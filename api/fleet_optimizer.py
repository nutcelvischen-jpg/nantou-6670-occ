from __future__ import annotations

from dataclasses import dataclass
from math import ceil, isfinite
from typing import Any

from ortools.sat.python import cp_model


@dataclass(frozen=True)
class FleetCandidate:
    id: str
    label: str
    departure_minute: int
    capacity: int
    cost_ntd: int
    vehicle: str
    turnaround_minutes: int = 120


def solve_candidate_set(
    candidates: list[FleetCandidate],
    demand: int,
    min_served_ratio: float,
    max_time_seconds: float = 5.0,
) -> dict[str, Any]:
    """Solve the current fixed-vehicle synthetic candidate set exactly when possible.

    This is a CP-SAT subset-selection model, not a full duty/vehicle-flow optimizer.
    Candidate vehicle assignments are inputs, and same-vehicle trips must not overlap
    their turnaround windows. Costs and capacities are scenario assumptions.
    """
    if not candidates:
        raise ValueError("candidates must not be empty")
    if len({candidate.id for candidate in candidates}) != len(candidates):
        raise ValueError("candidate IDs must be unique")
    if not isinstance(demand, int) or isinstance(demand, bool) or demand < 0:
        raise ValueError("demand must be a nonnegative integer")
    if not isfinite(min_served_ratio) or not 0 <= min_served_ratio <= 1:
        raise ValueError("min_served_ratio must be between 0 and 1")
    if not isfinite(max_time_seconds) or not 0.05 <= max_time_seconds <= 30:
        raise ValueError("max_time_seconds must be between 0.05 and 30")
    for candidate in candidates:
        if (not candidate.id or not candidate.vehicle or
                not isinstance(candidate.departure_minute, int) or
                not 0 <= candidate.departure_minute < 24 * 60 or
                not isinstance(candidate.capacity, int) or candidate.capacity < 0 or
                not isinstance(candidate.cost_ntd, int) or candidate.cost_ntd < 0 or
                not isinstance(candidate.turnaround_minutes, int) or candidate.turnaround_minutes < 0):
            raise ValueError("candidate fields are outside supported bounds")

    model = cp_model.CpModel()
    selected = [model.new_bool_var(f"run_{index}") for index in range(len(candidates))]
    required_capacity = ceil(demand * min_served_ratio)
    model.add(sum(candidate.capacity * selected[index] for index, candidate in enumerate(candidates)) >= required_capacity)

    conflicts: list[tuple[str, str]] = []
    for left_index, left in enumerate(candidates):
        for right_index in range(left_index + 1, len(candidates)):
            right = candidates[right_index]
            if left.vehicle != right.vehicle:
                continue
            left_end = left.departure_minute + left.turnaround_minutes
            right_end = right.departure_minute + right.turnaround_minutes
            if left.departure_minute < right_end and right.departure_minute < left_end:
                model.add(selected[left_index] + selected[right_index] <= 1)
                conflicts.append((left.id, right.id))

    model.minimize(sum(candidate.cost_ntd * selected[index] for index, candidate in enumerate(candidates)))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    status_code = solver.solve(model)

    if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        chosen = [candidate for index, candidate in enumerate(candidates) if solver.boolean_value(selected[index])]
        total_capacity = sum(candidate.capacity for candidate in chosen)
        served = min(demand, total_capacity)
        objective = sum(candidate.cost_ntd for candidate in chosen)
        bound = min(objective, int(ceil(solver.best_objective_bound)))
        return {
            "status": "optimal" if status_code == cp_model.OPTIMAL else "feasible",
            "algorithm": "OR-Tools CP-SAT",
            "objective_ntd": objective,
            "best_bound_ntd": bound,
            "absolute_gap_ntd": max(0, objective - bound),
            "selected_ids": [candidate.id for candidate in chosen],
            "capacity_supplied": total_capacity,
            "served": served,
            "unserved": demand - served,
            "demand": demand,
            "required_capacity": required_capacity,
            "min_served_ratio": min_served_ratio,
            "conflicts": [list(pair) for pair in conflicts],
            "optimality_scope": "fixed candidate set; fixed vehicle assignments; scenario capacity/cost/turnaround assumptions",
            "operational_ready": False,
            "warnings": [
                "此解只對送入的候選集合與固定車輛指派有效；不代表全域排班最優。",
                "未建模駕駛勤務、實際迴轉／空駛、首末班政策、站間分段載客與即時需求。",
            ],
        }

    status = "infeasible" if status_code == cp_model.INFEASIBLE else "unknown"
    return {
        "status": status,
        "algorithm": "OR-Tools CP-SAT",
        "objective_ntd": None,
        "best_bound_ntd": None,
        "absolute_gap_ntd": None,
        "selected_ids": [],
        "capacity_supplied": 0,
        "served": 0,
        "unserved": demand,
        "demand": demand,
        "required_capacity": required_capacity,
        "min_served_ratio": min_served_ratio,
        "conflicts": [list(pair) for pair in conflicts],
        "optimality_scope": "fixed candidate set; fixed vehicle assignments; scenario capacity/cost/turnaround assumptions",
        "operational_ready": False,
        "warnings": [
            "此解只對送入的候選集合與固定車輛指派有效；不代表全域排班最優。",
            "未建模駕駛勤務、實際迴轉／空駛、首末班政策、站間分段載客與即時需求。",
        ],
    }
