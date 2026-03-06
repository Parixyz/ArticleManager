from __future__ import annotations

import csv
import io
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

ROLE_VALUES = {
    "background", "related work", "benchmark", "method", "dataset", "survey", "theory", "application"
}
EVIDENCE_VALUES = {"strong", "moderate", "weak", "unclear"}
READ_VALUES = {"unread", "skimmed", "read", "deeply analyzed"}
DECISION_VALUES = {"include", "maybe", "exclude"}


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
        "the", "and", "for", "with", "that", "this", "from", "into", "about", "your", "have",
        "using", "paper", "article", "results", "method", "study", "based", "analysis",
    }
    return [w for w in words if w not in stop]


def top_keywords(text: str, limit: int = 6) -> list[str]:
    freq: dict[str, int] = {}
    for t in tokenize(text):
        freq[t] = freq.get(t, 0) + 1
    return [k for k, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]


def choose_cluster(text: str) -> str:
    keywords = top_keywords(text, 8)
    if not keywords:
        return "general"
    buckets = {
        "rl": {"reinforcement", "policy", "agent", "reward", "qlearning"},
        "fl": {"federated", "client", "aggregation", "noniid", "privacy"},
        "vision": {"image", "vision", "detection", "segmentation", "pixel", "video"},
        "nlp": {"language", "llm", "prompt", "transformer", "token", "text", "embedding"},
        "networking": {"handover", "traffic", "steering", "mobility", "latency", "wireless"},
        "optimization": {"optimization", "convex", "objective", "gradient", "heuristic"},
    }
    for name, vocab in buckets.items():
        if any(k in vocab for k in keywords):
            return name
    return keywords[0]


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", title.lower())


def bib_warnings(content: str) -> list[str]:
    warnings: list[str] = []
    if "@" not in content or "{" not in content:
        warnings.append("malformed BibTeX")
    for field in ("author", "year", "title"):
        if re.search(rf"\b{field}\s*=", content, flags=re.I) is None:
            warnings.append(f"missing {field}")
    if re.search(r"\bjournal\s*=|\bbooktitle\s*=|\bvenue\s*=", content, flags=re.I) is None:
        warnings.append("missing venue")
    return warnings


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                taxonomy TEXT NOT NULL DEFAULT '',
                writing_outline TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_checklist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                item_text TEXT NOT NULL,
                is_done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                normalized_title TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'general',
                role TEXT NOT NULL DEFAULT 'background',
                research_task TEXT NOT NULL DEFAULT '',
                method_tags TEXT NOT NULL DEFAULT '[]',
                evidence_strength TEXT NOT NULL DEFAULT 'unclear',
                relevance_score INTEGER NOT NULL DEFAULT 50,
                read_status TEXT NOT NULL DEFAULT 'unread',
                decision_flag TEXT NOT NULL DEFAULT 'maybe',
                authors TEXT NOT NULL DEFAULT '',
                venue TEXT NOT NULL DEFAULT '',
                year TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                nlp_cluster TEXT NOT NULL DEFAULT 'general',
                keywords TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS article_analysis (
                article_id INTEGER PRIMARY KEY,
                problem_statement TEXT NOT NULL DEFAULT '',
                setting_domain TEXT NOT NULL DEFAULT '',
                dataset_environment TEXT NOT NULL DEFAULT '',
                model_algorithm TEXT NOT NULL DEFAULT '',
                baseline_methods TEXT NOT NULL DEFAULT '',
                evaluation_metrics TEXT NOT NULL DEFAULT '',
                key_findings TEXT NOT NULL DEFAULT '',
                limitations TEXT NOT NULL DEFAULT '',
                assumptions TEXT NOT NULL DEFAULT '',
                future_work TEXT NOT NULL DEFAULT '',
                commentary TEXT NOT NULL DEFAULT '',
                extracted_figures TEXT NOT NULL DEFAULT '',
                extracted_equations TEXT NOT NULL DEFAULT '',
                extracted_tables TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS article_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_id INTEGER NOT NULL,
                file_name TEXT NOT NULL,
                full_text TEXT NOT NULL DEFAULT '',
                section_segmentation TEXT NOT NULL DEFAULT '',
                references_extraction TEXT NOT NULL DEFAULT '',
                metadata_extraction TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS article_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_id INTEGER NOT NULL,
                asset_type TEXT NOT NULL,
                asset_label TEXT NOT NULL DEFAULT '',
                asset_content TEXT NOT NULL DEFAULT '',
                source_anchor TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bib_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                article_id INTEGER,
                bib_key TEXT NOT NULL,
                bib_content TEXT NOT NULL,
                warnings TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                UNIQUE(project_id, bib_key),
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                article_id INTEGER,
                capture_type TEXT NOT NULL,
                selected_text TEXT NOT NULL DEFAULT '',
                screenshot_data TEXT NOT NULL DEFAULT '',
                page_url TEXT NOT NULL DEFAULT '',
                page_title TEXT NOT NULL DEFAULT '',
                tag TEXT NOT NULL DEFAULT '',
                ocr_text TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                article_id INTEGER,
                note_type TEXT NOT NULL DEFAULT 'idea',
                content TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                source_anchor TEXT NOT NULL DEFAULT '',
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
    row = conn.execute("SELECT id FROM projects WHERE name=?", (project_name,)).fetchone()
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
        p = parsed.path
        if p == "/api/projects":
            return self._get_projects()
        if p == "/api/dashboard":
            return self._get_dashboard(parsed.query)
        if p == "/api/articles":
            return self._get_articles(parsed.query)
        if p == "/api/analysis":
            return self._get_analysis(parsed.query)
        if p == "/api/article-files":
            return self._get_article_files(parsed.query)
        if p == "/api/bib":
            return self._get_bib(parsed.query)
        if p == "/api/captures":
            return self._get_captures(parsed.query)
        if p == "/api/notes":
            return self._get_notes(parsed.query)
        if p == "/api/checklist":
            return self._get_checklist(parsed.query)
        if p == "/api/comparison":
            return self._get_comparison(parsed.query)
        if p == "/api/export/articles.csv":
            return self._export_articles_csv(parsed.query)
        if p == "/api/export/project.bib":
            return self._export_bib(parsed.query)
        if p == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        p = parsed.path
        if p == "/api/projects":
            return self._create_project()
        if p == "/api/articles":
            return self._create_article()
        if p == "/api/analysis":
            return self._upsert_analysis()
        if p == "/api/article-files":
            return self._upsert_article_files()
        if p == "/api/assets":
            return self._create_asset()
        if p == "/api/bib":
            return self._upsert_bib()
        if p == "/api/extension/capture":
            return self._extension_capture()
        if p == "/api/notes":
            return self._create_note()
        if p == "/api/checklist":
            return self._create_checklist_item()
        self._json_response({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/checklist":
            return self._toggle_checklist_item()
        self._json_response({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def _get_projects(self):
        with db_conn() as conn:
            rows = conn.execute("SELECT id,name,description,taxonomy,writing_outline,created_at FROM projects ORDER BY name").fetchall()
        self._json_response([dict(r) for r in rows])

    def _create_project(self):
        payload = self._parse_json()
        try:
            name = sanitize_project_name(payload.get("name", ""))
        except ValueError:
            return self._json_response({"error": "invalid project name"}, 400)
        description = payload.get("description", "").strip()
        taxonomy = payload.get("taxonomy", "").strip()
        outline = payload.get("writing_outline", "").strip()
        with db_conn() as conn:
            try:
                conn.execute(
                    "INSERT INTO projects(name,description,taxonomy,writing_outline,created_at) VALUES (?,?,?,?,?)",
                    (name, description, taxonomy, outline, utc_now()),
                )
            except sqlite3.IntegrityError:
                return self._json_response({"error": "project already exists"}, 409)
        self._json_response({"name": name}, 201)

    def _get_dashboard(self, query: str):
        project = parse_qs(query).get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            total = conn.execute("SELECT COUNT(*) c FROM articles WHERE project_id=?", (pid,)).fetchone()["c"]
            read_count = conn.execute("SELECT COUNT(*) c FROM articles WHERE project_id=? AND read_status IN ('read','deeply analyzed')", (pid,)).fetchone()["c"]
            include_count = conn.execute("SELECT COUNT(*) c FROM articles WHERE project_id=? AND decision_flag='include'", (pid,)).fetchone()["c"]
            missing_bib = conn.execute("SELECT COUNT(*) c FROM articles a WHERE a.project_id=? AND NOT EXISTS (SELECT 1 FROM bib_entries b WHERE b.article_id=a.id)", (pid,)).fetchone()["c"]
            missing_analysis = conn.execute("SELECT COUNT(*) c FROM articles a WHERE a.project_id=? AND NOT EXISTS (SELECT 1 FROM article_analysis aa WHERE aa.article_id=a.id)", (pid,)).fetchone()["c"]
            cluster_rows = conn.execute("SELECT nlp_cluster, COUNT(*) c FROM articles WHERE project_id=? GROUP BY nlp_cluster ORDER BY c DESC", (pid,)).fetchall()
        self._json_response({
            "articles": total,
            "read": read_count,
            "included": include_count,
            "missing_bib": missing_bib,
            "missing_analysis": missing_analysis,
            "cluster_distribution": [dict(r) for r in cluster_rows],
        })

    def _get_articles(self, query: str):
        q = parse_qs(query)
        project = q.get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            sql = "SELECT * FROM articles WHERE project_id=?"
            args: list = [pid]
            for field in ("decision_flag", "read_status", "nlp_cluster", "role", "research_task"):
                val = q.get(field, [""])[0].strip()
                if val:
                    sql += f" AND {field}=?"
                    args.append(val)
            search = q.get("search", [""])[0].strip()
            if search:
                sql += " AND (title LIKE ? OR notes LIKE ? OR authors LIKE ? OR venue LIKE ?)"
                term = f"%{search}%"
                args.extend([term, term, term, term])
            sql += " ORDER BY id DESC"
            rows = conn.execute(sql, tuple(args)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["keywords"] = json.loads(d["keywords"])
            d["method_tags"] = json.loads(d["method_tags"])
            out.append(d)
        self._json_response(out)

    def _create_article(self):
        payload = self._parse_json()
        project = payload.get("project", "").strip()
        title = payload.get("title", "").strip()
        if not project or not title:
            return self._json_response({"error": "project and title required"}, 400)

        role = payload.get("role", "background").strip().lower()
        evidence = payload.get("evidence_strength", "unclear").strip().lower()
        read_status = payload.get("read_status", "unread").strip().lower()
        decision = payload.get("decision_flag", "maybe").strip().lower()
        if role not in ROLE_VALUES:
            role = "background"
        if evidence not in EVIDENCE_VALUES:
            evidence = "unclear"
        if read_status not in READ_VALUES:
            read_status = "unread"
        if decision not in DECISION_VALUES:
            decision = "maybe"

        notes = payload.get("notes", "").strip()
        inferred = choose_cluster(f"{title}\n{notes}\n{payload.get('research_task', '')}")
        keywords = top_keywords(f"{title}\n{notes}")
        tags = [t.strip() for t in payload.get("method_tags", []) if t.strip()]
        relevance = int(payload.get("relevance_score", 50))
        relevance = max(0, min(100, relevance))

        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)

            norm_title = normalize_title(title)
            dup = conn.execute("SELECT id,title FROM articles WHERE project_id=? AND normalized_title=?", (pid, norm_title)).fetchall()
            cur = conn.execute(
                """INSERT INTO articles(project_id,title,normalized_title,source_url,category,role,research_task,method_tags,evidence_strength,
                relevance_score,read_status,decision_flag,authors,venue,year,notes,nlp_cluster,keywords,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    pid,
                    title,
                    norm_title,
                    payload.get("source_url", "").strip(),
                    payload.get("category", "general").strip() or "general",
                    role,
                    payload.get("research_task", "").strip(),
                    json.dumps(tags),
                    evidence,
                    relevance,
                    read_status,
                    decision,
                    payload.get("authors", "").strip(),
                    payload.get("venue", "").strip(),
                    payload.get("year", "").strip(),
                    notes,
                    inferred,
                    json.dumps(keywords),
                    utc_now(),
                ),
            )
            article_id = cur.lastrowid
            conn.execute(
                "INSERT INTO article_analysis(article_id,updated_at) VALUES(?,?)",
                (article_id, utc_now()),
            )
            conn.execute(
                """INSERT INTO article_files(article_id,file_name,full_text,section_segmentation,references_extraction,metadata_extraction,created_at)
                VALUES(?,?,?,?,?,?,?)""",
                (article_id, "primary", "", "", "", "", utc_now()),
            )
        self._json_response({"id": article_id, "nlp_cluster": inferred, "keywords": keywords, "duplicate_like": [dict(x) for x in dup]}, 201)

    def _get_analysis(self, query: str):
        aid = parse_qs(query).get("article_id", [""])[0]
        if not aid:
            return self._json_response({"error": "article_id required"}, 400)
        with db_conn() as conn:
            row = conn.execute("SELECT * FROM article_analysis WHERE article_id=?", (aid,)).fetchone()
        self._json_response(dict(row) if row else {"article_id": int(aid)})

    def _upsert_analysis(self):
        p = self._parse_json()
        aid = p.get("article_id")
        if not aid:
            return self._json_response({"error": "article_id required"}, 400)
        fields = [
            "problem_statement", "setting_domain", "dataset_environment", "model_algorithm", "baseline_methods",
            "evaluation_metrics", "key_findings", "limitations", "assumptions", "future_work", "commentary",
            "extracted_figures", "extracted_equations", "extracted_tables",
        ]
        vals = [p.get(f, "") for f in fields]
        with db_conn() as conn:
            conn.execute(
                f"""INSERT INTO article_analysis(article_id,{','.join(fields)},updated_at)
                VALUES(?,{','.join('?'*len(fields))},?)
                ON CONFLICT(article_id) DO UPDATE SET {','.join(f'{f}=excluded.{f}' for f in fields)},updated_at=excluded.updated_at""",
                [aid, *vals, utc_now()],
            )
        self._json_response({"status": "saved"}, 201)

    def _get_article_files(self, query: str):
        aid = parse_qs(query).get("article_id", [""])[0]
        if not aid:
            return self._json_response({"error": "article_id required"}, 400)
        with db_conn() as conn:
            row = conn.execute(
                """SELECT article_id,file_name,full_text,section_segmentation,references_extraction,metadata_extraction,created_at
                FROM article_files WHERE article_id=? ORDER BY id DESC LIMIT 1""",
                (aid,),
            ).fetchone()
        if row:
            return self._json_response(dict(row))
        self._json_response({
            "article_id": int(aid),
            "file_name": "primary",
            "full_text": "",
            "section_segmentation": "",
            "references_extraction": "",
            "metadata_extraction": "",
        })

    def _upsert_article_files(self):
        p = self._parse_json()
        aid = p.get("article_id")
        if not aid:
            return self._json_response({"error": "article_id required"}, 400)
        fields = ["full_text", "section_segmentation", "references_extraction", "metadata_extraction"]
        vals = [p.get(f, "") for f in fields]
        with db_conn() as conn:
            conn.execute(
                "DELETE FROM article_files WHERE article_id=?",
                (aid,),
            )
            conn.execute(
                """INSERT INTO article_files(article_id,file_name,full_text,section_segmentation,references_extraction,metadata_extraction,created_at)
                VALUES(?,?,?,?,?,?,?)""",
                [aid, p.get("file_name", "primary"), *vals, utc_now()],
            )
        self._json_response({"status": "saved"}, 201)

    def _create_asset(self):
        p = self._parse_json()
        aid = p.get("article_id")
        atype = p.get("asset_type", "figure").strip().lower()
        if not aid:
            return self._json_response({"error": "article_id required"}, 400)
        with db_conn() as conn:
            conn.execute(
                "INSERT INTO article_assets(article_id,asset_type,asset_label,asset_content,source_anchor,created_at) VALUES(?,?,?,?,?,?)",
                (aid, atype, p.get("asset_label", ""), p.get("asset_content", ""), p.get("source_anchor", ""), utc_now()),
            )
        self._json_response({"status": "saved"}, 201)

    def _get_bib(self, query: str):
        project = parse_qs(query).get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute("SELECT id,article_id,bib_key,bib_content,warnings,created_at FROM bib_entries WHERE project_id=? ORDER BY bib_key", (pid,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["warnings"] = json.loads(d["warnings"])
            out.append(d)
        self._json_response(out)

    def _upsert_bib(self):
        p = self._parse_json()
        project = p.get("project", "").strip()
        bib_key = p.get("bib_key", "").strip()
        bib_content = p.get("bib_content", "").strip()
        if not project or not bib_key or not bib_content:
            return self._json_response({"error": "project, bib_key, bib_content required"}, 400)
        warns = bib_warnings(bib_content)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            conn.execute(
                """INSERT INTO bib_entries(project_id,article_id,bib_key,bib_content,warnings,created_at)
                VALUES(?,?,?,?,?,?)
                ON CONFLICT(project_id,bib_key)
                DO UPDATE SET bib_content=excluded.bib_content,warnings=excluded.warnings,created_at=excluded.created_at,article_id=excluded.article_id""",
                (pid, p.get("article_id"), bib_key, bib_content, json.dumps(warns), utc_now()),
            )
        self._json_response({"status": "saved", "warnings": warns}, 201)

    def _extension_capture(self):
        p = self._parse_json()
        project = p.get("project", "").strip()
        if not project:
            return self._json_response({"error": "project required"}, 400)
        ss = p.get("screenshot_data", "").strip()
        if ss and not ss.startswith("data:image/"):
            return self._json_response({"error": "screenshot_data must be data URL"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            cur = conn.execute(
                """INSERT INTO captures(project_id,article_id,capture_type,selected_text,screenshot_data,page_url,page_title,tag,ocr_text,comment,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    pid,
                    p.get("article_id"),
                    p.get("capture_type", "selection"),
                    p.get("selected_text", ""),
                    ss,
                    p.get("page_url", ""),
                    p.get("page_title", ""),
                    p.get("tag", ""),
                    p.get("ocr_text", ""),
                    p.get("comment", ""),
                    utc_now(),
                ),
            )
        self._json_response({"capture_id": cur.lastrowid}, 201)

    def _get_captures(self, query: str):
        project = parse_qs(query).get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute("SELECT * FROM captures WHERE project_id=? ORDER BY id DESC", (pid,)).fetchall()
        self._json_response([dict(r) for r in rows])

    def _create_note(self):
        p = self._parse_json()
        project = p.get("project", "").strip()
        if not project or not p.get("content", "").strip():
            return self._json_response({"error": "project and content required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            conn.execute(
                "INSERT INTO notes(project_id,article_id,note_type,content,is_pinned,source_anchor,created_at) VALUES(?,?,?,?,?,?,?)",
                (pid, p.get("article_id"), p.get("note_type", "idea"), p.get("content"), int(bool(p.get("is_pinned"))), p.get("source_anchor", ""), utc_now()),
            )
        self._json_response({"status": "saved"}, 201)

    def _get_notes(self, query: str):
        q = parse_qs(query)
        project = q.get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            sql = "SELECT * FROM notes WHERE project_id=?"
            args: list = [pid]
            if q.get("search", [""])[0].strip():
                sql += " AND content LIKE ?"
                args.append(f"%{q['search'][0]}%")
            sql += " ORDER BY is_pinned DESC, id DESC"
            rows = conn.execute(sql, tuple(args)).fetchall()
        self._json_response([dict(r) for r in rows])

    def _create_checklist_item(self):
        p = self._parse_json()
        project = p.get("project", "").strip()
        text = p.get("item_text", "").strip()
        if not project or not text:
            return self._json_response({"error": "project and item_text required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            conn.execute("INSERT INTO project_checklist(project_id,item_text,is_done,created_at) VALUES(?,?,0,?)", (pid, text, utc_now()))
        self._json_response({"status": "saved"}, 201)

    def _toggle_checklist_item(self):
        p = self._parse_json()
        cid = p.get("id")
        done = int(bool(p.get("is_done")))
        if not cid:
            return self._json_response({"error": "id required"}, 400)
        with db_conn() as conn:
            conn.execute("UPDATE project_checklist SET is_done=? WHERE id=?", (done, cid))
        self._json_response({"status": "updated"})

    def _get_checklist(self, query: str):
        project = parse_qs(query).get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute("SELECT * FROM project_checklist WHERE project_id=? ORDER BY id DESC", (pid,)).fetchall()
        self._json_response([dict(r) for r in rows])

    def _get_comparison(self, query: str):
        q = parse_qs(query)
        project = q.get("project", [""])[0]
        ids = [int(x) for x in q.get("article_ids", [""])[0].split(",") if x.strip().isdigit()]
        if not project or not ids:
            return self._json_response({"error": "project and article_ids required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            placeholders = ",".join("?" * len(ids))
            rows = conn.execute(
                f"""SELECT id,title,research_task,method_tags,venue,year,category,evidence_strength,decision_flag,relevance_score
                FROM articles WHERE project_id=? AND id IN ({placeholders}) ORDER BY id""",
                (pid, *ids),
            ).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            d["method_tags"] = ", ".join(json.loads(d["method_tags"]))
            items.append(d)

        latex_lines = ["\\begin{tabular}{|l|l|l|l|l|}", "\\hline", "Title & Task & Methods & Evidence & Decision \\\\\\ \\hline"]
        for it in items:
            title = it["title"].replace("&", "\\&")
            latex_lines.append(f"{title} & {it['research_task']} & {it['method_tags']} & {it['evidence_strength']} & {it['decision_flag']} \\\\ \\hline")
        latex_lines.append("\\end{tabular}")

        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=list(items[0].keys()) if items else ["id"])
        writer.writeheader()
        for row in items:
            writer.writerow(row)

        self._json_response({"rows": items, "latex": "\n".join(latex_lines), "csv": out.getvalue()})

    def _export_articles_csv(self, query: str):
        project = parse_qs(query).get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute("SELECT id,title,authors,venue,year,research_task,decision_flag,read_status FROM articles WHERE project_id=?", (pid,)).fetchall()
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["id", "title", "authors", "venue", "year", "research_task", "decision_flag", "read_status"])
        for r in rows:
            writer.writerow([r["id"], r["title"], r["authors"], r["venue"], r["year"], r["research_task"], r["decision_flag"], r["read_status"]])
        payload = out.getvalue().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Content-Disposition", "attachment; filename=project_articles.csv")
        self.end_headers()
        self.wfile.write(payload)

    def _export_bib(self, query: str):
        project = parse_qs(query).get("project", [""])[0]
        if not project:
            return self._json_response({"error": "project query is required"}, 400)
        with db_conn() as conn:
            try:
                pid = get_project_id(conn, project)
            except KeyError:
                return self._json_response({"error": "project not found"}, 404)
            rows = conn.execute("SELECT bib_content FROM bib_entries WHERE project_id=? ORDER BY bib_key", (pid,)).fetchall()
        content = "\n\n".join([r["bib_content"] for r in rows])
        payload = content.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Content-Disposition", "attachment; filename=project.bib")
        self.end_headers()
        self.wfile.write(payload)


def run() -> None:
    init_db()
    port = int(os.getenv("PORT", "5000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Serving ArticleManager on http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
