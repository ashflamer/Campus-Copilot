"""Serve the CampusScope workspace UI (static files, standard library only).

    python serve.py            ->  http://localhost:5173
Env: UI_PORT (default 5173)
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("UI_PORT", "5173"))
    print(f"🎓 CampusScope Workspace UI → http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=str(ROOT))).serve_forever()
