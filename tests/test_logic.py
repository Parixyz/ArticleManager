import unittest
from unittest.mock import patch

from app import bib_warnings, choose_cluster, infer_article_fields, resolve_pdflatex_cmd, sanitize_project_name, top_keywords


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


if __name__ == '__main__':
    unittest.main()
