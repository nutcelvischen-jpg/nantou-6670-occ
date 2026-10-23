import unittest
import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app, validate_aggregate_payload


class AggregateApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_ready_reports_local_read_only_data_mode(self):
        response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        self.assertEqual(body["data_mode"], "read_only_local_aggregate")
        self.assertEqual(body["years"], ["2024", "2025"])

    def test_aggregate_endpoint_returns_only_year_aggregates(self):
        response = self.client.get("/api/v1/datasets/aggregates")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ETag", response.headers)
        body = response.json()
        self.assertEqual([x["rows"] for x in body["years"]], [875149, 925761])
        self.assertTrue(all("raw_card_id" not in x for x in body["years"]))

    def test_hourly_aggregate_is_filtered_and_defines_its_unit(self):
        response = self.client.get("/api/v1/demand/hourly?year=2025&route=6670A")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["unit"], "ticket_transactions")
        self.assertEqual(len(body["data"]), 24)
        self.assertGreater(sum(x["transactions"] for x in body["data"]), 0)

    def test_missing_year_and_invalid_ranges_return_readable_http_errors(self):
        self.assertEqual(self.client.get("/api/v1/demand/hourly?year=2023").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/demand/hourly?year=1900").status_code, 422)

    def test_validation_rejects_restricted_raw_identifier_fields(self):
        with self.assertRaisesRegex(ValueError, "raw_card_id"):
            validate_aggregate_payload(
                {
                    "synthetic": False,
                    "years": [
                        {
                            "source": "2025.xlsx",
                            "rows": 1,
                            "parsed_rows": 1,
                            "raw_card_id": "must-not-ship",
                            "hour_by_route": [],
                            "daily": [],
                            "routes": [],
                            "top_od": [],
                            "top_stations": [],
                            "ticket_types": [],
                            "card_transaction_frequency": [],
                            "same_day_return_interval": [],
                        }
                    ],
                }
            )

    def test_validation_rejects_restricted_fields_nested_in_aggregates(self):
        with self.assertRaisesRegex(ValueError, "card_number"):
            validate_aggregate_payload(
                {
                    "synthetic": False,
                    "years": [
                        {
                            "source": "2025.xlsx",
                            "rows": 1,
                            "parsed_rows": 1,
                            "hour_by_route": [],
                            "daily": [],
                            "routes": [],
                            "top_od": [{"card_number": "must-not-ship"}],
                            "top_stations": [],
                            "ticket_types": [],
                            "card_transaction_frequency": [],
                            "same_day_return_interval": [],
                        }
                    ],
                }
            )

    def test_tdx_status_does_not_claim_connection(self):
        response = self.client.get("/api/v1/integrations/tdx/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["state"], "not_configured")
        self.assertEqual(response.json()["reason_code"], "credentials_missing")

    def test_tdx_route_map_uses_geojson_contract_and_etag(self):
        payload = {
            "source": "TDX MOTC",
            "synthetic": False,
            "route_prefix": "6670",
            "retrieved_at": "2026-10-23T00:00:00Z",
            "api_family": "Bus v2 InterCity",
            "routes": [],
            "route_uids": [],
            "shapes": {"type": "FeatureCollection", "features": []},
            "stops": {"type": "FeatureCollection", "features": []},
            "warnings": [],
        }
        with patch("api.main.tdx_client.route_map", return_value=payload):
            response = self.client.get("/api/v1/integrations/tdx/route-map")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ETag", response.headers)
        self.assertEqual(response.json()["source"], "TDX MOTC")
        self.assertFalse(response.json()["synthetic"])

    def test_tdx_invalid_route_prefix_is_rejected(self):
        response = self.client.get("/api/v1/integrations/tdx/route-map?route_prefix=6670%27%20or%20true")
        self.assertEqual(response.status_code, 422)

    def test_timetable_endpoint_exposes_provenance_and_directions(self):
        response = self.client.get("/api/v1/timetables/6670")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ETag", response.headers)
        body = response.json()
        self.assertEqual(body["effective_from"], "2024-11-01")
        self.assertEqual(body["dataset_status"], "published_snapshot_unverified_for_today")
        self.assertEqual(body["fare_status"], "not_joined_unverified")
        self.assertEqual(len(body["trips"]), 88)
        self.assertEqual(
            {trip["direction"] for trip in body["trips"]},
            {"taichung_to_sun_moon_lake", "sun_moon_lake_to_taichung"},
        )

    def test_road_route_demo_returns_separate_diesel_and_electric_dijkstra_solutions(self):
        response = self.client.get("/api/v1/road-routes/demo")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ETag", response.headers)
        body = response.json()
        self.assertEqual(body["source_status"], "synthetic")
        self.assertEqual(body["objective"], "operating_cost_min")
        self.assertEqual([item["result"]["edge_ids"] for item in body["results"]], [["highway-toll"], ["puli-ncnu", "ncnu-sml"]])
        self.assertTrue(all(item["result"]["algorithm"] == "dijkstra_operating_cost_v1" for item in body["results"]))

    def test_road_route_demo_rejects_unknown_nodes(self):
        response = self.client.get("/api/v1/road-routes/demo?origin=private-place")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "UNKNOWN_ROAD_NODE")

    def test_fleet_optimization_endpoint_runs_cp_sat_with_candidate_scope(self):
        response = self.client.post("/api/v1/optimizations/fleet", json={
            "candidates": [
                {"id": "large", "label": "08:00", "departure_minute": 480, "capacity": 40, "cost_ntd": 1000, "vehicle": "L-1"},
                {"id": "small-a", "label": "08:00", "departure_minute": 480, "capacity": 22, "cost_ntd": 650, "vehicle": "S-1"},
                {"id": "small-b", "label": "08:00", "departure_minute": 480, "capacity": 22, "cost_ntd": 650, "vehicle": "S-2"},
            ],
            "demand": 40,
            "min_served_ratio": 1,
        })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["algorithm"], "OR-Tools CP-SAT")
        self.assertEqual(body["status"], "optimal")
        self.assertEqual(body["objective_ntd"], 1000)
        self.assertEqual(body["selected_ids"], ["large"])
        self.assertFalse(body["operational_ready"])

    def test_fleet_optimization_rejects_duplicate_candidate_ids(self):
        response = self.client.post("/api/v1/optimizations/fleet", json={
            "candidates": [
                {"id": "same", "label": "08:00", "departure_minute": 480, "capacity": 20, "cost_ntd": 100, "vehicle": "bus-1"},
                {"id": "same", "label": "09:00", "departure_minute": 540, "capacity": 20, "cost_ntd": 100, "vehicle": "bus-2"},
            ],
            "demand": 10,
            "min_served_ratio": 1,
        })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "INVALID_OPTIMIZATION_INPUT")

    def test_assistant_reports_missing_live_vehicle_feed_without_guessing(self):
        with patch.dict(os.environ, {"OPENCODE_API_KEY": ""}):
            response = self.client.post("/api/v1/assistant/answer", json={
                "mode": "operations",
                "message": "現在 6670 有沒有延誤？",
                "year": 2025,
                "route": "6670A",
            })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["engine"], "demo")
        self.assertEqual(body["data_status"], "missing")
        self.assertIn("未接入車輛 GPS／ETA", body["answer"])
        self.assertEqual(body["sources"], [])

    def test_assistant_demand_answer_has_aggregate_citation_and_scope(self):
        with patch.dict(os.environ, {"OPENCODE_API_KEY": ""}):
            response = self.client.post("/api/v1/assistant/answer", json={
                "mode": "operations",
                "message": "2025年哪個時段票證交易最多？",
                "year": 2025,
                "route": "6670A",
            })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["data_status"], "sourced")
        self.assertIn("交易數不等於完整乘客數", body["answer"])
        self.assertEqual(body["sources"][0]["status"], "observed_aggregate")
        self.assertEqual(body["sources"][0]["title"], "2025年6670票證彙總")

    def test_assistant_runs_a_clearly_labeled_synthetic_fleet_preview(self):
        with patch.dict(os.environ, {"OPENCODE_API_KEY": ""}):
            response = self.client.post("/api/v1/assistant/answer", json={
                "mode": "operations",
                "message": "尖峰需求提高 15% 會怎樣？",
                "year": 2025,
                "route": "全部",
            })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["data_status"], "assumed")
        self.assertIn("不是實際車隊排班", body["answer"])
        self.assertEqual(body["sources"][1]["status"], "assumed")
        self.assertEqual(body["sources"][1]["title"], "合成候選班次／車輛／成本")

    def test_assistant_rejects_unknown_routes_and_oversized_messages(self):
        invalid_route = self.client.post("/api/v1/assistant/answer", json={"message": "查詢", "route": "private"})
        oversized = self.client.post("/api/v1/assistant/answer", json={"message": "x" * 2001})
        self.assertEqual(invalid_route.status_code, 422)
        self.assertEqual(invalid_route.json()["error"]["code"], "INVALID_ASSISTANT_FILTER")
        self.assertEqual(oversized.status_code, 422)

    def test_assistant_rejects_traveler_mode_and_out_of_scope_questions(self):
        invalid_mode = self.client.post("/api/v1/assistant/answer", json={"mode": "traveler", "message": "現在 6670 有沒有延誤？"})
        self.assertEqual(invalid_mode.status_code, 422)
        with patch.dict(os.environ, {"OPENCODE_API_KEY": "test-key"}), patch("api.main.answer_with_opencode") as provider:
            response = self.client.post("/api/v1/assistant/answer", json={"message": "請幫我規劃日月潭兩天一夜行程"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["engine"], "demo")
        self.assertIn("不在支援範圍", response.json()["answer"])
        provider.assert_not_called()


if __name__ == "__main__":
    unittest.main()
