import unittest

from scripts.parse_ntbus_6670_timetable import SOURCE, parse_timetable


class NtbusTimetableTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = parse_timetable(SOURCE.read_text(encoding="utf-8", errors="replace"))

    def test_saved_public_timetable_has_source_and_validity_warnings(self):
        self.assertEqual(self.data["effective_from"], "2024-11-01")
        self.assertEqual(self.data["dataset_status"], "published_snapshot_unverified_for_today")
        self.assertEqual(self.data["fare_status"], "not_joined_unverified")
        self.assertIn("9-seat", self.data["vehicle_service_scope"])
        self.assertTrue(self.data["source_sha256"])
        self.assertGreater(len(self.data["warnings"]), 2)

    def test_both_directions_and_trip_stop_times_are_normalized(self):
        directions = {trip["direction"] for trip in self.data["trips"]}
        self.assertEqual(directions, {"taichung_to_sun_moon_lake", "sun_moon_lake_to_taichung"})
        self.assertTrue(all(len(trip["stops"]) >= 2 for trip in self.data["trips"]))
        self.assertTrue(all(trip["stops"][0]["time_role"] == "scheduled_departure" for trip in self.data["trips"]))
        self.assertTrue(all("trip_id" in trip and "route_code" in trip for trip in self.data["trips"]))

    def test_weekend_departures_are_not_merged_with_daily_rows(self):
        weekend = [trip for trip in self.data["trips"] if trip["service_class"] == "fri_sun"]
        weekdays = [trip for trip in self.data["trips"] if trip["service_class"] == "mon_thu"]
        self.assertTrue(weekend)
        self.assertTrue(weekdays)


if __name__ == "__main__":
    unittest.main()
