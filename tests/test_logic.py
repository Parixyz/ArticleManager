import unittest
from unittest.mock import patch

from app import DEFAULT_MAIN_TEX, bib_warnings, choose_cluster, ensure_default_project_files, infer_article_fields, resolve_pdflatex_cmd, sanitize_project_name, top_keywords, validate_database_file


class LogicTests(unittest.TestCase):
    def test_sanitize(self):
        self.assertEqual(sanitize_project_name(' My Project 2026 '), 'My_Project_2026')

    def test_keywords(self):
        keys = top_keywords('Transformer token token embedding model')
        self.assertIn('token', keys)

    def test_cluster_networking(self):
        c = choose_cluster('traffic steering and handover optimization in wireless mobility')
        self.assertEqual(c, 'networking')

    def test_bib_warnings(self):
        w = bib_warnings('@article{x, title={A}}')
        self.assertIn('missing author', w)
        self.assertIn('missing year', w)

    def test_article_autofill(self):
        out = infer_article_fields('A Survey 2025', 'wireless handover mobility', 'https://ieeexplore.ieee.org/x')
        self.assertEqual(out['year'], '2025')
        self.assertEqual(out['venue'], 'ieeexplore.ieee.org')
        self.assertIn('mobility', out['tags'])

    def test_resolve_pdflatex_prefers_available_latex_binary(self):
        with patch('app.os.environ.get', return_value=''):
            with patch('app.shutil.which', side_effect=[None, '/usr/bin/lualatex']):
                self.assertEqual(resolve_pdflatex_cmd(), ['/usr/bin/lualatex'])

    def test_resolve_pdflatex_uses_valid_env_path(self):
        with patch('app.os.environ.get', return_value='/bin/echo'):
            self.assertEqual(resolve_pdflatex_cmd(), ['/bin/echo'])

    def test_default_main_tex_template_has_document(self):
        self.assertIn('\\begin{document}', DEFAULT_MAIN_TEX)
        self.assertIn('\\bibliography{references}', DEFAULT_MAIN_TEX)

    def test_ensure_default_project_files_creates_required_entries(self):
        import sqlite3

        conn = sqlite3.connect(':memory:')
        conn.execute(
            """CREATE TABLE project_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                file_type TEXT NOT NULL DEFAULT 'file',
                content TEXT NOT NULL DEFAULT '',
                linked_capture_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_id, path)
            )"""
        )
        ensure_default_project_files(conn, 7)
        rows = conn.execute('SELECT path,file_type FROM project_files WHERE project_id=7 ORDER BY path').fetchall()
        self.assertEqual({(r[0], r[1]) for r in rows}, {
            ('.bib', 'directory'),
            ('.bib/references.bib', 'file'),
            ('SourceArticles', 'directory'),
            ('main.tex', 'file'),
        })


    def test_validate_database_file_accepts_sqlite_with_projects_table(self):
        import sqlite3
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'ok.db'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE projects (id INTEGER PRIMARY KEY)')
            validate_database_file(path)

    def test_validate_database_file_rejects_missing_projects_table(self):
        import sqlite3
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'bad.db'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE something_else (id INTEGER PRIMARY KEY)')
            with self.assertRaises(ValueError):
                validate_database_file(path)


if __name__ == '__main__':
    unittest.main()
