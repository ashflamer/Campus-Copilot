"""CampusScope Assignments API - standard library only.

Run:  python run.py      ->  http://localhost:8766
"""
import json
import os
import re
import urllib.request
from collections import defaultdict
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from . import ai, db, gemma

NAV_URL = os.environ.get("NAV_URL", "http://localhost:8765").rstrip("/")
ID_RE = re.compile(r"^/api/assignments/([a-f0-9]{6,32})(/breakdown)?$")


def courses():
    names = {e["course"] for e in db.get_timetable()} | {a["course"] for a in db.list_assignments() if a["course"]}
    return sorted(n for n in names if n)


def progress():
    items = db.list_assignments()
    by = defaultdict(list)
    for a in items:
        by[a["course"] or "Other"].append(a["progress"])
    avg = lambda xs: round(sum(xs) / len(xs)) if xs else 0
    return {"overall": avg([a["progress"] for a in items]), "total": len(items),
            "done": sum(a["status"] == "done" for a in items),
            "by_course": [{"course": c, "progress": avg(v), "count": len(v)} for c, v in sorted(by.items())]}


def myday(origin=None):
    now = datetime.now()
    stamp, today = now.strftime("%Y-%m-%dT%H:%M"), now.strftime("%Y-%m-%d")
    items = [a for a in db.list_assignments() if a["status"] != "done"]
    out = {"now": stamp,
           "overdue": [a for a in items if a["due"] and a["due"] < stamp],
           "due_today": [a for a in items if a["due"] and a["due"] >= stamp and a["due"][:10] == today],
           "next_class": None}
    try:  # ask the Navigator where the next class is and how long the walk takes
        body = json.dumps({"entries": db.get_timetable(), "from": origin}).encode()
        req = urllib.request.Request(f"{NAV_URL}/api/next-class", data=body, method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as r:
            out["next_class"] = json.loads(r.read().decode())
    except Exception as e:
        out["next_class_error"] = f"navigator offline ({type(e).__name__})"
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "CampusScopeAssignments/1.0"

    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode() or "{}") if n else {}

    def log_message(self, fmt, *args):
        if os.environ.get("API_QUIET") != "1":
            super().log_message(fmt, *args)

    def do_OPTIONS(self):
        self._send(204, {})

    def _route(self, method):
        u = urlparse(self.path)
        path = u.path.rstrip("/")
        q = dict(p.split("=", 1) for p in u.query.split("&") if "=" in p)
        try:
            body = self._body() if method in ("POST", "PATCH", "PUT") else {}
            if path == "/api/health":
                return self._send(200, {"ok": True, "ai": gemma.label()})
            if path == "/api/ai/status":
                return self._send(200, gemma.ping())
            if path == "/api/assignments":
                if method == "GET":
                    return self._send(200, db.list_assignments())
                if method == "POST":
                    return self._send(201, db.create(body))
            m = ID_RE.match(path)
            if m:
                aid, sub = m.group(1), m.group(2)
                a = db.get(aid)
                if not a:
                    return self._send(404, {"error": "assignment not found"})
                if sub and method == "POST":  # Gemma: split into sub-tasks and save them
                    res = ai.breakdown(a)
                    keep = [s for s in a["subtasks"] if s.get("done")]
                    new = keep + [{"text": t, "done": False} for t in res["subtasks"]
                                  if t.lower() not in {k["text"].lower() for k in keep}]
                    return self._send(200, {"assignment": db.update(aid, {"subtasks": new}), **res})
                if method == "GET":
                    return self._send(200, a)
                if method == "PATCH":
                    return self._send(200, db.update(aid, body))
                if method == "DELETE":
                    db.delete(aid)
                    return self._send(200, {"deleted": aid})
            if path == "/api/ai/quick-add" and method == "POST":
                text = str(body.get("text", "")).strip()
                if not text:
                    return self._send(400, {"error": "text is required"})
                parsed = ai.quick_add(text, courses())
                if body.get("preview"):
                    return self._send(200, {"parsed": parsed})
                src = "gemma" if parsed["parser"].startswith("gemma") else "rules"
                return self._send(201, {"parsed": parsed, "assignment": db.create(parsed, source=src)})
            if path == "/api/ai/plan":
                return self._send(200, ai.plan(db.list_assignments(), db.get_timetable()))
            if path == "/api/timetable":
                if method == "GET":
                    return self._send(200, db.get_timetable())
                if method == "PUT":
                    return self._send(200, db.set_timetable(body.get("entries", body if isinstance(body, list) else [])))
            if path == "/api/courses":
                return self._send(200, courses())
            if path == "/api/progress":
                return self._send(200, progress())
            if path == "/api/myday":
                return self._send(200, myday(q.get("from")))
            return self._send(404, {"error": "not found"})
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        except Exception as e:  # never crash the demo
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_PATCH(self):
        self._route("PATCH")

    def do_PUT(self):
        self._route("PUT")

    def do_DELETE(self):
        self._route("DELETE")


def main():
    host = os.environ.get("API_HOST", "0.0.0.0")
    port = int(os.environ.get("API_PORT", "8766"))
    db.conn()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"📚 CampusScope Assignments API → http://localhost:{port}   |  AI: {gemma.label()}   |  DB: {db.DB_PATH}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
