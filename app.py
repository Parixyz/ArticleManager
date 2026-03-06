from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def run() -> None:
    port = int(os.getenv("PORT", "5000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Serving ArticleManager on http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
