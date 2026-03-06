from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "article_manager.db"
STATIC_ROOT = ROOT


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_project_name(name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip()).strip("_")
    if not safe:
        raise ValueError("Invalid project name")
    return safe


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z]{3,}", text.lower())
    stop = {
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "from",
        "into",
        "about",
        "your",
        "have",
        "using",
        "paper",
        "article",
    }
    return [w for w in words if w not in stop]


def top_keywords(text: str, limit: int = 5) -> list[str]:
    freq: dict[str, int] = {}
    for t in tokenize(text):
        freq[t] = freq.get(t, 0) + 1
    return [k for k, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]


def choose_cluster(text: str) -> str:
    keywords = top_keywords(text, 6)
    if not keywords:
        return "general"
    buckets = {
        "nlp": {"language", "llm", "prompt", "transformer", "token", "text", "embedding"},
        "vision": {"image", "vision", "detection", "segmentation", "pixel", "video"},
        "math": {"proof", "theorem", "equation", "algebra", "geometry", "optimization"},
        "systems": {"database", "distributed", "latency", "throughput", "cache", "server"},
    }
    for name, vocab in buckets.items():
        if any(k in vocab for k in keywords):
            return name
    return keywords[0]


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                source_url TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'general',
                nlp_cluster TEXT NOT NULL DEFAULT 'general',
                keywords TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bib_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                bib_key TEXT NOT NULL,
                bib_content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, bib_key),
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                article_id INTEGER,
                capture_type TEXT NOT NULL,
                selected_text TEXT NOT NULL DEFAULT '',
                screenshot_data TEXT NOT NULL DEFAULT '',
                page_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
            );
            """
        )


def db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_project_id(conn: sqlite3.Connection, project_name: str) -> int:
    row = conn.execute("SELECT id FROM projects WHERE name = ?", (project_name,)).fetchone()
    if not row:
        raise KeyError("project not found")
    return int(row["id"])


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_ROOT), **kwargs)

    def _json_response(self, data: dict | list, status: int = 200) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _parse_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/projects":
            return self._get_projects()
        if parsed.path == "/api/articles":
            return self._get_articles(parsed.query)
        if parsed.path == "/api/bib":
            return self._get_bib(parsed.query)
        if parsed.path == "/api/captures":
            return self._get_captures(parsed.query)
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/projects":
            return self._create_project()
        if parsed.path == "/api/articles":
            return self._create_article()
        if parsed.path == "/api/bib":
            return self._upsert_bib()
        if parsed.path == "/api/extension/capture":
            return self._extension_capture()
        self._json_response({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def _get_projects(self):
        with db_conn() as conn:
            rows = conn.execute("SELECT id, name, description, created_at FROM projects ORDER BY name").fetchall()
        self._json_response([dict(r) for r in rows])

    def _create_project(self):
        payload = self._parse_json()
        try:
            name = sanitize_project_name(payload.get("name", ""))
        except ValueError:
            return self._json_response({"error": "invalid project name"}, 400)
        description = payload.get("description", "").strip()
        with db_conn() as conn:
            try:
                conn.execute(
                    "INSERT INTO projects(name, description, created_at) VALUES (?, ?, ?)",
                    (name, description, utc_now()),
                )
            except sqlite3.IntegrityError:
                return self._json_response({"error": "project already exists"}, 409)
        self._json_response({"name": name}, 201)

    def _get_articles(self, query: str):
        params = parse_qs(query)
        project = params.get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                project_id = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute(
                "SELECT id,title,source_url,notes,category,nlp_cluster,keywords,created_at FROM articles WHERE project_id=? ORDER BY id DESC",
                (project_id,),
            ).fetchall()
        out = []
        for r in rows:
            item = dict(r)
            item["keywords"] = json.loads(item["keywords"])
            out.append(item)
        self._json_response(out)

    def _create_article(self):
        payload = self._parse_json()
        title = payload.get("title", "").strip()
        project = payload.get("project", "").strip()
        source_url = payload.get("source_url", "").strip()
        notes = payload.get("notes", "").strip()
        category = payload.get("category", "").strip() or "general"
        if not project or not title:
            return self._json_response({"error": "project and title required"}, 400)

        inferred = choose_cluster(f"{title}\n{notes}")
        keywords = top_keywords(f"{title}\n{notes}")

        with db_conn() as conn:
            try:
                project_id = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            cur = conn.execute(
                """INSERT INTO articles(project_id,title,source_url,notes,category,nlp_cluster,keywords,created_at)
                VALUES (?,?,?,?,?,?,?,?)""",
                (project_id, title, source_url, notes, category, inferred, json.dumps(keywords), utc_now()),
            )
            article_id = cur.lastrowid
        self._json_response({"id": article_id, "nlp_cluster": inferred, "keywords": keywords}, 201)

    def _get_bib(self, query: str):
        params = parse_qs(query)
        project = params.get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                project_id = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute(
                "SELECT bib_key,bib_content,created_at FROM bib_entries WHERE project_id=? ORDER BY bib_key",
                (project_id,),
            ).fetchall()
        self._json_response([dict(r) for r in rows])

    def _upsert_bib(self):
        payload = self._parse_json()
        project = payload.get("project", "").strip()
        bib_key = payload.get("bib_key", "").strip()
        bib_content = payload.get("bib_content", "").strip()
        if not project or not bib_key or not bib_content:
            return self._json_response({"error": "project, bib_key, bib_content required"}, 400)
        with db_conn() as conn:
            try:
                project_id = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            conn.execute(
                """INSERT INTO bib_entries(project_id,bib_key,bib_content,created_at)
                VALUES(?,?,?,?)
                ON CONFLICT(project_id, bib_key)
                DO UPDATE SET bib_content=excluded.bib_content, created_at=excluded.created_at""",
                (project_id, bib_key, bib_content, utc_now()),
            )
        self._json_response({"status": "saved"}, 201)

    def _extension_capture(self):
        payload = self._parse_json()
        project = payload.get("project", "").strip()
        selected_text = payload.get("selected_text", "").strip()
        screenshot_data = payload.get("screenshot_data", "").strip()
        page_url = payload.get("page_url", "").strip()
        article_id = payload.get("article_id")
        capture_type = payload.get("capture_type", "selection").strip() or "selection"

        if not project:
            return self._json_response({"error": "project required"}, 400)
        if screenshot_data and not screenshot_data.startswith("data:image/"):
            return self._json_response({"error": "screenshot_data must be data URL"}, 400)

        with db_conn() as conn:
            try:
                project_id = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            cur = conn.execute(
                """INSERT INTO captures(project_id,article_id,capture_type,selected_text,screenshot_data,page_url,created_at)
                VALUES(?,?,?,?,?,?,?)""",
                (project_id, article_id, capture_type, selected_text, screenshot_data, page_url, utc_now()),
            )
            capture_id = cur.lastrowid

        self._json_response({"capture_id": capture_id}, 201)

    def _get_captures(self, query: str):
        params = parse_qs(query)
        project = params.get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                project_id = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute(
                "SELECT id,article_id,capture_type,selected_text,screenshot_data,page_url,created_at FROM captures WHERE project_id=? ORDER BY id DESC",
                (project_id,),
            ).fetchall()
        self._json_response([dict(r) for r in rows])


def run() -> None:
    init_db()
    port = int(os.getenv("PORT", "5000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Serving ArticleManager on http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
