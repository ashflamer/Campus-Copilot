"""Serve the CampusScope workspace UI (standard library only).

    python serve.py            ->  http://localhost:5173

Besides the static files it proxies the two backends on the SAME origin,
so the app also works in hosted previews / tunnels that expose only one port:

    /svc/api/...  ->  assignments-api   (API_URL, default http://localhost:8766)
    /svc/nav/...  ->  navigator-api     (NAV_URL, default http://localhost:8765)

Env: UI_PORT (default 5173), API_URL, NAV_URL
"""
import os
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGETS = {
    "/svc/api": os.environ.get("API_URL", "http://localhost:8766").rstrip("/"),
    "/svc/nav": os.environ.get("NAV_URL", "http://localhost:8765").rstrip("/"),
}
HOP = {"connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding", "server", "date"}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("UI_QUIET") != "1":
            super().log_message(fmt, *args)

    def _target(self):
        for prefix, base in TARGETS.items():
            if self.path == prefix or self.path.startswith(prefix + "/") or self.path.startswith(prefix + "?"):
                rest = self.path[len(prefix):] or "/"
                return base + (rest if rest.startswith("/") else "/" + rest)
        return None

    def _proxy(self, method):
        url = self._target()
        if not url:
            return False
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        req = urllib.request.Request(url, data=body, method=method,
                                     headers={"Content-Type": self.headers.get("Content-Type", "application/json")})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                status, headers, data = r.status, r.headers.items(), r.read()
        except urllib.error.HTTPError as e:
            status, headers, data = e.code, e.headers.items(), e.read()
        except Exception as e:  # backend not running
            status, headers = 502, [("Content-Type", "application/json")]
            data = ('{"error": "backend unreachable via proxy: %s"}' % type(e).__name__).encode()
        self.send_response(status)
        for k, v in headers:
            if k.lower() not in HOP:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return True

    def do_GET(self):
        if not self._proxy("GET"):
            super().do_GET()

    def do_POST(self):
        self._proxy("POST") or self.send_error(404)

    def do_PATCH(self):
        self._proxy("PATCH") or self.send_error(404)

    def do_PUT(self):
        self._proxy("PUT") or self.send_error(404)

    def do_DELETE(self):
        self._proxy("DELETE") or self.send_error(404)


if __name__ == "__main__":
    port = int(os.environ.get("UI_PORT", "5173"))
    print(f"🎓 CampusScope Workspace UI → http://localhost:{port}   (proxy: /svc/api, /svc/nav)")
    ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=str(ROOT))).serve_forever()
