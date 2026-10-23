import unittest
from datetime import datetime, timedelta

from scripts.build_public_aggregates import bucket_return_intervals, derive_return_intervals


class ReturnIntervalTests(unittest.TestCase):
    def test_pairs_reverse_od_once_and_ignores_non_return_trips(self):
        start = datetime(2025, 1, 2, 8)
        trips = [
            (start, "台中", "埔里"),
            (start + timedelta(hours=2), "埔里", "台中"),
            (start + timedelta(hours=3), "台中", "埔里"),
            (start + timedelta(hours=4), "草屯", "埔里"),
        ]
        self.assertEqual(derive_return_intervals(trips), ["2–4 小時"])

    def test_return_pair_must_be_within_12_hours_and_positive_interval(self):
        start = datetime(2025, 1, 2, 8)
        trips = [
            (start, "台中", "埔里"),
            (start, "埔里", "台中"),
            (start + timedelta(hours=13), "埔里", "台中"),
        ]
        self.assertEqual(derive_return_intervals(trips), [])

    def test_small_return_buckets_are_suppressed(self):
        rows = bucket_return_intervals({"1 小時內": 9, "1–2 小時": 10})
        self.assertTrue(rows[0]["suppressed"])
        self.assertIsNone(rows[0]["return_count"])
        self.assertFalse(rows[1]["suppressed"])
        self.assertEqual(rows[1]["return_count"], 10)


if __name__ == "__main__":
    unittest.main()
