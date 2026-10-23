import unittest

from api.fleet_optimizer import FleetCandidate, solve_candidate_set


class FleetOptimizerTests(unittest.TestCase):
    def test_cp_sat_picks_one_large_bus_over_two_more_expensive_small_buses(self):
        candidates = [
            FleetCandidate("large", "08:00", 8 * 60, 40, 1000, "L-1"),
            FleetCandidate("small-a", "08:00", 8 * 60, 22, 650, "S-1"),
            FleetCandidate("small-b", "08:00", 8 * 60, 22, 650, "S-2"),
        ]
        result = solve_candidate_set(candidates, demand=40, min_served_ratio=1)
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["objective_ntd"], 1000)
        self.assertEqual(result["selected_ids"], ["large"])
        self.assertEqual(result["best_bound_ntd"], 1000)
        self.assertFalse(result["operational_ready"])

    def test_same_vehicle_turnaround_conflict_is_enforced(self):
        candidates = [
            FleetCandidate("first", "09:00", 9 * 60, 30, 100, "bus-1", 120),
            FleetCandidate("too-soon", "10:30", 10 * 60 + 30, 30, 100, "bus-1", 120),
            FleetCandidate("other-bus", "10:30", 10 * 60 + 30, 30, 170, "bus-2", 120),
        ]
        result = solve_candidate_set(candidates, demand=55, min_served_ratio=1)
        self.assertEqual(result["status"], "optimal")
        self.assertIn(result["selected_ids"], [["first", "other-bus"], ["too-soon", "other-bus"]])
        self.assertEqual(result["objective_ntd"], 270)
        self.assertIn(["first", "too-soon"], result["conflicts"])

    def test_reports_infeasible_service_floor_instead_of_relaxing_it(self):
        result = solve_candidate_set(
            [FleetCandidate("only", "09:00", 9 * 60, 20, 100, "bus-1")],
            demand=40,
            min_served_ratio=0.9,
        )
        self.assertEqual(result["status"], "infeasible")
        self.assertIsNone(result["objective_ntd"])
        self.assertEqual(result["selected_ids"], [])
        self.assertEqual(result["unserved"], 40)

    def test_matches_independent_enumeration_oracle(self):
        candidates = [
            FleetCandidate("a", "08:00", 480, 24, 380, "bus-1"),
            FleetCandidate("b", "08:30", 510, 24, 360, "bus-1"),
            FleetCandidate("c", "09:00", 540, 30, 510, "bus-2"),
            FleetCandidate("d", "09:30", 570, 30, 600, "bus-3"),
            FleetCandidate("e", "10:00", 600, 20, 240, "bus-1"),
        ]
        demand, ratio = 50, 0.9
        feasible_costs = []
        required_capacity = 45
        for mask in range(1 << len(candidates)):
            chosen = [candidate for index, candidate in enumerate(candidates) if mask & (1 << index)]
            compatible = all(
                left.vehicle != right.vehicle
                or left.departure_minute + left.turnaround_minutes <= right.departure_minute
                or right.departure_minute + right.turnaround_minutes <= left.departure_minute
                for index, left in enumerate(chosen)
                for right in chosen[index + 1 :]
            )
            if compatible and sum(candidate.capacity for candidate in chosen) >= required_capacity:
                feasible_costs.append(sum(candidate.cost_ntd for candidate in chosen))

        result = solve_candidate_set(candidates, demand, ratio)
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["objective_ntd"], min(feasible_costs))

    def test_rejects_duplicate_candidate_ids_and_invalid_objective(self):
        repeated = [
            FleetCandidate("same", "08:00", 480, 20, 10, "bus-1"),
            FleetCandidate("same", "09:00", 540, 20, 10, "bus-2"),
        ]
        with self.assertRaisesRegex(ValueError, "unique"):
            solve_candidate_set(repeated, 10, 1)
        with self.assertRaisesRegex(ValueError, "min_served_ratio"):
            solve_candidate_set(repeated[:1], 10, 1.1)


if __name__ == "__main__":
    unittest.main()
