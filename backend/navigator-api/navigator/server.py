"""CampusScope Navigator HTTP server — standard library only.

Run:  python run.py            (http://localhost:8765)
"""
import json
import os
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from . import nlu
from .engine import Campus, DATA_DIR

STATIC_DIR = Path(os.environ.get("NAV_STATIC_DIR") or
                  Path(__file__).resolve().parents[3] / "frontend" / "navigator-ui").resolve()
campus = Campus()


def _bool(v):
    return str(v).lower() in ("1", "true", "yes", "on")


class Handler(BaseHTTPRequestHandler):
    server_version = "CampusNavigator/1.0"

    # -------------------------------------------------------------- helpers
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith(("application/json", "text/")) else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _err(self, code, msg):
        self._send(code, {"error": msg})

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode() or "{}")

    def log_message(self, fmt, *args):
        if os.environ.get("NAV_QUIET") != "1":
            super().log_message(fmt, *args)

    def do_OPTIONS(self):
        self._send(204, b"")

    # ------------------------------------------------------------------ GET
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        path = u.path.rstrip("/") or "/"
        try:
            if path == "/api/campus":
                return self._send(200, {
                    "campus": campus.campus,
                    "locations": [campus.location_info(i) for i in campus.locations],
                    "nodes": {k: {"lat": v[0], "lng": v[1], "label": v[2]} for k, v in campus.nodes.items()
                              if k not in campus.locations},
                    "edges": [{"from": e["from"], "to": e["to"], "stairs": e.get("stairs", False),
                               "covered": e.get("covered", False), "name": e.get("name", "")}
                              for e in campus.graph_data["edges"]],
                    "emergency": campus.emergency_info(),
                    "ai": {"provider": nlu.PROVIDER, "model": nlu.MODEL if nlu.PROVIDER != "none" else None},
                })
            if path == "/api/route":
                src, dst = campus.resolve(q.get("from", "")) or q.get("from"), campus.resolve(q.get("to", "")) or q.get("to")
                r = campus.route(src, dst, _bool(q.get("accessible")))
                return self._send(200, r) if r else self._err(404, "No route found between those places")
            if path == "/api/options":
                r = campus.route_options(q.get("from"), q.get("to"))
                return self._send(200, r) if r else self._err(404, "No route found")
            if path == "/api/nearest":
                return self._send(200, campus.nearest(q.get("category", ""), q.get("from"), _bool(q.get("open")),
                                                      int(q.get("limit", 3))))
            if path == "/api/location":
                lid = campus.resolve(q.get("id", "")) or q.get("id")
                info = campus.location_info(lid)
                return self._send(200, info) if info else self._err(404, "Location not in campus database")
            if path == "/api/search":
                return self._send(200, campus.search(q.get("q", "")))
            if path == "/api/room":
                r = campus.resolve_room(q.get("code", ""))
                return self._send(200, r) if r else self._err(404, "Unknown room code")
            if path == "/api/next-class":
                return self._send(200, self._next_class(None, q.get("from"), _bool(q.get("accessible"))))
            if path == "/api/emergency":
                return self._send(200, campus.emergency_info())
            if path == "/api/ask":
                return self._send(200, nlu.explain(nlu.answer(q.get("q", ""), campus, q.get("origin"))))
            if path == "/api/health":
                return self._send(200, {"ok": True, "ai": nlu.PROVIDER, "model": nlu.MODEL})
            return self._static(path)
        except Exception as e:  # never crash the demo
            return self._err(500, f"{type(e).__name__}: {e}")

    def _next_class(self, entries, origin, accessible=False):
        nc = campus.next_class(entries)
        if not nc:
            return {"next_class": None}
        out = {"next_class": nc}
        if origin and nc.get("location"):
            out["route"] = campus.route(origin, nc["location"], accessible)
        return out

    def _static(self, path):
        rel = "index.html" if path in ("/", "/navigator") else path.lstrip("/")
        f = (STATIC_DIR / rel).resolve()
        if STATIC_DIR not in f.parents or not f.is_file():
            return self._err(404, "Not found")
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        return self._send(200, f.read_bytes(), ctype)

    # ----------------------------------------------------------------- POST
    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        try:
            body = self._body()
            if path == "/api/ask":
                return self._send(200, nlu.explain(nlu.answer(body.get("text", ""), campus, body.get("origin"))))
            if path == "/api/next-class":
                # CampusScope integration: POST its own timetable entries
                return self._send(200, self._next_class(body.get("entries"), body.get("from"), body.get("accessible")))
            if path == "/api/editor/save":
                if os.environ.get("NAV_EDITOR", "1") != "1":
                    return self._err(403, "Editor disabled")
                return self._send(200, self._save_pins(body))
            return self._err(404, "Not found")
        except Exception as e:
            return self._err(500, f"{type(e).__name__}: {e}")

    def _save_pins(self, body):
        """Pin Editor: write corrected coordinates back to the JSON files."""
        locs_path, graph_path = DATA_DIR / "locations.json", DATA_DIR / "graph.json"
        locs = json.loads(locs_path.read_text(encoding="utf-8"))
        graph = json.loads(graph_path.read_text(encoding="utf-8"))
        changed = 0
        for item in locs["locations"]:
            if item["id"] in body.get("locations", {}):
                item["lat"], item["lng"] = [round(x, 6) for x in body["locations"][item["id"]]]
                changed += 1
        for nid, ll in body.get("nodes", {}).items():
            if nid in graph["nodes"]:
                graph["nodes"][nid]["lat"], graph["nodes"][nid]["lng"] = [round(x, 6) for x in ll]
                changed += 1
        locs_path.write_text(json.dumps(locs, indent=2, ensure_ascii=False), encoding="utf-8")
        graph_path.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
        campus.reload()
        return {"saved": changed}


def main():
    host = os.environ.get("NAV_HOST", "0.0.0.0")
    port = int(os.environ.get("NAV_PORT", "8765"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    ai = f"{nlu.PROVIDER} / {nlu.MODEL}" if nlu.PROVIDER != "none" else "keyword parser only (GEMMA_PROVIDER=none)"
    print(f"🗺️  CampusScope Navigator API + UI → http://localhost:{port}   |  Gemma: {ai}")
    print(f"   serving UI from {STATIC_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
