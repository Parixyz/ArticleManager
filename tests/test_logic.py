import unittest

from app import bib_warnings, choose_cluster, sanitize_project_name, top_keywords


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


if __name__ == '__main__':
    unittest.main()
