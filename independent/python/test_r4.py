#!/usr/bin/env python3
"""Clean-room canonical-number regression vectors."""
import unittest
from r4 import num, canon

class CanonicalNumberTests(unittest.TestCase):
    def test_precision_regression(self):
        self.assertEqual(num(0.0000012345678901234567), "0.0000012345678901234567")

    def test_ecmascript_thresholds_and_exponents(self):
        vectors = [
            (1e-6, "0.000001"),
            (1e-7, "1e-7"),
            (1e20, "100000000000000000000"),
            (1e21, "1e+21"),
            (-0.0, "0"),
            (5e-324, "5e-324"),
        ]
        for value, expected in vectors:
            with self.subTest(value=value): self.assertEqual(num(value), expected)

    def test_utf16_key_order_is_unchanged(self):
        self.assertEqual(canon({"\ue000": 2, "\U00010000": 1}), '{"𐀀":1,"":2}')

if __name__ == "__main__": unittest.main()
