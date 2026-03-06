import unittest

from app import choose_cluster, sanitize_project_name, top_keywords


class LogicTests(unittest.TestCase):
    def test_sanitize(self):
        self.assertEqual(sanitize_project_name(' My Project 2026 '), 'My_Project_2026')

    def test_keywords(self):
        keys = top_keywords('Transformer text model model token token token')
        self.assertIn('token', keys)

    def test_cluster_vision(self):
        c = choose_cluster('image segmentation with pixel level detection')
        self.assertEqual(c, 'vision')


if __name__ == '__main__':
    unittest.main()
