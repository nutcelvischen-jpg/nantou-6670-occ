import unittest

from api.road_fixtures import build_nantou_road_demo, demo_profiles
from api.road_router import find_least_operating_cost_path


def profile(**overrides):
    return {
        "vehicle_class": "bus",
        "energy_kind": "liter",
        "energy_per_km": 0,
        "energy_price_per_unit": 0,
        "driver_cost_per_hour": 120,
        "maintenance_cost_per_km": 10,
        "max_vehicle_height_m": 3.5,
        "max_vehicle_weight_ton": 18,
        **overrides,
    }


def tiny_graph(edges, nodes=("S", "H", "L", "T")):
    return {"node_ids": list(nodes), "edges": edges}


class RoadRouterTests(unittest.TestCase):
    def test_matches_hand_calculated_toll_tradeoff_and_time_tie_break(self):
        graph = tiny_graph([
            {"id": "highway", "from": "S", "to": "T", "distance_km": 10, "travel_time_seconds": 600, "toll_ntd": 40, "energy_kind": "liter"},
            {"id": "local", "from": "S", "to": "T", "distance_km": 12, "travel_time_seconds": 1200, "toll_ntd": 0, "energy_kind": "liter"},
        ], nodes=("S", "T"))
        result = find_least_operating_cost_path(graph, "S", "T", profile())
        # Highway: 100 maintenance + 20 driver + 40 toll = 160; same cost as local, faster wins.
        self.assertEqual(result["cost_minor"], 16000)
        self.assertEqual(result["edge_ids"], ["highway"])
        graph["edges"][0]["toll_ntd"] = 60
        result = find_least_operating_cost_path(graph, "S", "T", profile())
        self.assertEqual(result["cost_minor"], 16000)
        self.assertEqual(result["edge_ids"], ["local"])

    def test_respects_vehicle_height_weight_and_class_access(self):
        graph = tiny_graph([
            {"id": "low-bridge", "from": "S", "to": "T", "distance_km": 1, "travel_time_seconds": 30, "energy_kind": "liter", "max_vehicle_height_m": 3.2},
            {"id": "bus-road", "from": "S", "to": "T", "distance_km": 2, "travel_time_seconds": 120, "energy_kind": "liter", "max_vehicle_height_m": 4.0, "allowed_vehicle_classes": ["bus"]},
        ], nodes=("S", "T"))
        result = find_least_operating_cost_path(graph, "S", "T", profile())
        self.assertEqual(result["edge_ids"], ["bus-road"])

    def test_never_uses_unreviewed_edges_and_reports_incomplete_scope(self):
        graph = tiny_graph([
            {"id": "review", "from": "S", "to": "T", "distance_km": 1, "travel_time_seconds": 30, "energy_kind": "liter", "access_status": "needs_review"},
        ], nodes=("S", "T"))
        result = find_least_operating_cost_path(graph, "S", "T", profile())
        self.assertEqual(result["status"], "incomplete_data")
        self.assertEqual(result["excluded_needs_review_count"], 1)
        self.assertEqual(result["edge_ids"], [])

    def test_disconnected_verified_network_is_infeasible(self):
        graph = tiny_graph([], nodes=("S", "T"))
        result = find_least_operating_cost_path(graph, "S", "T", profile())
        self.assertEqual(result["status"], "infeasible")

    def test_demo_vehicle_profiles_are_solved_separately_with_breakdowns(self):
        graph = build_nantou_road_demo()
        diesel, electric = [
            find_least_operating_cost_path(graph, "puli", "sun_moon_lake", item)
            for item in demo_profiles()
        ]
        self.assertEqual(diesel["edge_ids"], ["highway-toll"])
        self.assertEqual(electric["edge_ids"], ["puli-ncnu", "ncnu-sml"])
        self.assertGreater(diesel["cost_breakdown_minor"]["toll"], 0)
        self.assertEqual(electric["cost_breakdown_minor"]["toll"], 0)
        self.assertEqual(diesel["status"], "optimal")
        self.assertEqual(electric["status"], "optimal")

    def test_rejects_negative_cost_input_and_duplicate_edge_ids(self):
        with self.assertRaises(ValueError):
            find_least_operating_cost_path(tiny_graph([
                {"id": "bad", "from": "S", "to": "T", "distance_km": -1, "travel_time_seconds": 1, "energy_kind": "liter"},
            ], nodes=("S", "T")), "S", "T", profile())

    def test_requires_vehicle_dimensions_before_claiming_access_feasibility(self):
        incomplete_profile = profile()
        incomplete_profile.pop("max_vehicle_height_m")
        with self.assertRaisesRegex(ValueError, "max_vehicle_height_m"):
            find_least_operating_cost_path(tiny_graph([], nodes=("S", "T")), "S", "T", incomplete_profile)
        with self.assertRaisesRegex(ValueError, "duplicate edge id"):
            find_least_operating_cost_path(tiny_graph([
                {"id": "same", "from": "S", "to": "T", "distance_km": 1, "travel_time_seconds": 1, "energy_kind": "liter"},
                {"id": "same", "from": "S", "to": "T", "distance_km": 2, "travel_time_seconds": 2, "energy_kind": "liter"},
            ], nodes=("S", "T")), "S", "T", profile())


if __name__ == "__main__":
    unittest.main()
