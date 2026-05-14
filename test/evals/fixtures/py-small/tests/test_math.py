import unittest
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from src.math_utils import add, sub, div


class TestMath(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2, 3), 5)

    def test_sub(self):
        self.assertEqual(sub(5, 2), 3)

    def test_div(self):
        self.assertEqual(div(10, 2), 5)

    def test_div_zero(self):
        with self.assertRaises(ValueError):
            div(1, 0)


if __name__ == '__main__':
    unittest.main()
