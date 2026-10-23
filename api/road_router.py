"""Deterministic Dijkstra routing for nonnegative bus operating-cost graphs."""
from __future__ import annotations

import heapq
import math
from typing import Any


def _nonnegative_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be a finite nonnegative number")
    return float(value)


def _validate_profile(profile: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(profile, dict):
        raise ValueError("vehicle_profile must be an object")
    energy_kind = profile.get("energy_kind")
    if energy_kind not in {"liter", "kwh"}:
        raise ValueError("energy_kind must be liter or kwh")
    vehicle_class = profile.get("vehicle_class")
    if not isinstance(vehicle_class, str) or not vehicle_class:
        raise ValueError("vehicle_class is required")
    return {
        "vehicle_class": vehicle_class,
        "energy_kind": energy_kind,
        "energy_per_km": _nonnegative_number(profile.get("energy_per_km"), "energy_per_km"),
        "energy_price_per_unit": _nonnegative_number(profile.get("energy_price_per_unit"), "energy_price_per_unit"),
        "driver_cost_per_hour": _nonnegative_number(profile.get("driver_cost_per_hour"), "driver_cost_per_hour"),
        "maintenance_cost_per_km": _nonnegative_number(profile.get("maintenance_cost_per_km"), "maintenance_cost_per_km"),
        "max_vehicle_height_m": _nonnegative_number(profile.get("max_vehicle_height_m"), "max_vehicle_height_m"),
        "max_vehicle_weight_ton": _nonnegative_number(profile.get("max_vehicle_weight_ton"), "max_vehicle_weight_ton"),
    }


def find_least_operating_cost_path(
    graph: dict[str, Any],
    origin: str,
    destination: str,
    vehicle_profile: dict[str, Any],
) -> dict[str, Any]:
    """Minimize integer-cent operating cost; ties prefer less time, distance, hops, then edge IDs."""
    if not isinstance(graph, dict) or not isinstance(graph.get("edges"), list):
        raise ValueError("graph.edges must be an array")
    if not isinstance(origin, str) or not origin or not isinstance(destination, str) or not destination:
        raise ValueError("origin and destination are required")
    profile = _validate_profile(vehicle_profile)
    edges = graph["edges"]
    node_ids = set(graph.get("node_ids", []))
    adjacency: dict[str, list[dict[str, Any]]] = {}
    edge_ids: set[str] = set()
    reviewed_edge_count = 0
    needs_review_count = 0
    for edge in edges:
        if not isinstance(edge, dict):
            raise ValueError("each graph edge must be an object")
        edge_id = edge.get("id")
        source, target = edge.get("from"), edge.get("to")
        if not all(isinstance(value, str) and value for value in (edge_id, source, target)):
            raise ValueError("each edge must have nonempty id, from, and to")
        if edge_id in edge_ids:
            raise ValueError(f"duplicate edge id: {edge_id}")
        edge_ids.add(edge_id)
        distance = _nonnegative_number(edge.get("distance_km"), f"{edge_id}.distance_km")
        seconds = _nonnegative_number(edge.get("travel_time_seconds"), f"{edge_id}.travel_time_seconds")
        toll = _nonnegative_number(edge.get("toll_ntd", 0), f"{edge_id}.toll_ntd")
        factor = _nonnegative_number(edge.get("energy_factor", 1), f"{edge_id}.energy_factor")
        if not float(seconds).is_integer():
            raise ValueError(f"{edge_id}.travel_time_seconds must be an integer")
        if not isinstance(edge.get("energy_kind"), str) or edge["energy_kind"] not in {"liter", "kwh", "either"}:
            raise ValueError(f"{edge_id}.energy_kind must be liter, kwh, or either")
        access = edge.get("access_status", "verified")
        if access not in {"verified", "needs_review", "closed"}:
            raise ValueError(f"{edge_id}.access_status is invalid")
        node_ids.update((source, target))
        if access == "closed":
            continue
        if access == "needs_review":
            needs_review_count += 1
            continue
        allowed = edge.get("allowed_vehicle_classes")
        if allowed is not None and (not isinstance(allowed, list) or not all(isinstance(item, str) for item in allowed)):
            raise ValueError(f"{edge_id}.allowed_vehicle_classes must be a string array")
        if allowed is not None and profile["vehicle_class"] not in allowed:
            continue
        if edge.get("max_vehicle_height_m") is not None and profile["max_vehicle_height_m"] > _nonnegative_number(edge["max_vehicle_height_m"], f"{edge_id}.max_vehicle_height_m"):
            continue
        if edge.get("max_vehicle_weight_ton") is not None and profile["max_vehicle_weight_ton"] > _nonnegative_number(edge["max_vehicle_weight_ton"], f"{edge_id}.max_vehicle_weight_ton"):
            continue
        edge_energy_kind = edge["energy_kind"]
        if edge_energy_kind not in {"either", profile["energy_kind"]}:
            raise ValueError(f"{edge_id}.energy_kind does not match vehicle_profile")
        energy_units = distance * factor * profile["energy_per_km"]
        energy_minor = round(energy_units * profile["energy_price_per_unit"] * 100)
        driver_minor = round((seconds / 3600) * profile["driver_cost_per_hour"] * 100)
        maintenance_minor = round(distance * profile["maintenance_cost_per_km"] * 100)
        toll_minor = round(toll * 100)
        prepared = {
            **edge,
            "distance_km": distance,
            "travel_time_seconds": int(seconds),
            "toll_ntd": toll,
            "energy_units": energy_units,
            "cost_breakdown_minor": {
                "energy": energy_minor,
                "driver_time": driver_minor,
                "maintenance": maintenance_minor,
                "toll": toll_minor,
            },
            "cost_minor": energy_minor + driver_minor + maintenance_minor + toll_minor,
        }
        adjacency.setdefault(source, []).append(prepared)
        reviewed_edge_count += 1

    if origin not in node_ids or destination not in node_ids:
        raise ValueError("origin and destination must exist in graph")
    if origin == destination:
        return {
            "status": "optimal",
            "algorithm": "dijkstra_operating_cost_v1",
            "origin": origin,
            "destination": destination,
            "vehicle_profile": profile,
            "cost_minor": 0,
            "cost_ntd": 0,
            "cost_breakdown_minor": {"energy": 0, "driver_time": 0, "maintenance": 0, "toll": 0},
            "distance_km": 0,
            "travel_time_seconds": 0,
            "edge_ids": [],
            "node_ids": [origin],
            "legs": [],
            "optimality_scope": "complete_supplied_graph" if needs_review_count == 0 else "verified_edges_only",
            "warnings": [],
            "reviewed_edge_count": reviewed_edge_count,
            "excluded_needs_review_count": needs_review_count,
        }

    # Heap key includes stable tie-breaks so equal-cost runs reproduce identical paths.
    start_key = (0, 0, 0, 0, ())
    queue: list[tuple[tuple[Any, ...], str, tuple[str, ...], tuple[str, ...], tuple[dict[str, Any], ...]]] = []
    heapq.heappush(queue, (start_key, origin, (origin,), (), ()))
    best: dict[str, tuple[Any, ...]] = {origin: start_key}
    winner = None
    while queue:
        key, node, path_nodes, path_edges, path_legs = heapq.heappop(queue)
        if best.get(node) != key:
            continue
        if node == destination:
            winner = (key, path_nodes, path_edges, path_legs)
            break
        for edge in adjacency.get(node, []):
            target = edge["to"]
            breakdown = edge["cost_breakdown_minor"]
            next_key = (
                key[0] + edge["cost_minor"],
                key[1] + edge["travel_time_seconds"],
                key[2] + round(edge["distance_km"] * 1000),
                key[3] + 1,
                key[4] + (edge["id"],),
            )
            if next_key < best.get(target, (math.inf, math.inf, math.inf, math.inf, ())):
                leg = {
                    "edge_id": edge["id"],
                    "from": edge["from"],
                    "to": target,
                    "distance_km": edge["distance_km"],
                    "travel_time_seconds": edge["travel_time_seconds"],
                    "cost_minor": edge["cost_minor"],
                    "cost_breakdown_minor": breakdown,
                }
                best[target] = next_key
                heapq.heappush(queue, (
                    next_key,
                    target,
                    path_nodes + (target,),
                    path_edges + (edge["id"],),
                    path_legs + (leg,),
                ))

    if winner is None:
        return {
            "status": "incomplete_data" if needs_review_count else "infeasible",
            "algorithm": "dijkstra_operating_cost_v1",
            "origin": origin,
            "destination": destination,
            "vehicle_profile": profile,
            "cost_minor": None,
            "cost_ntd": None,
            "cost_breakdown_minor": None,
            "distance_km": None,
            "travel_time_seconds": None,
            "edge_ids": [],
            "node_ids": [],
            "legs": [],
            "optimality_scope": "verified_edges_only",
            "warnings": ["可能存在未核對通行條件的路段。"] if needs_review_count else [],
            "reviewed_edge_count": reviewed_edge_count,
            "excluded_needs_review_count": needs_review_count,
        }
    key, path_nodes, path_edges, path_legs = winner
    breakdown = {name: sum(leg["cost_breakdown_minor"][name] for leg in path_legs) for name in ("energy", "driver_time", "maintenance", "toll")}
    warnings = ["此結果僅是合成圖中已核對路段的最低成本；未核對路段已排除。"] if needs_review_count else []
    return {
        "status": "optimal",
        "algorithm": "dijkstra_operating_cost_v1",
        "origin": origin,
        "destination": destination,
        "vehicle_profile": profile,
        "cost_minor": key[0],
        "cost_ntd": key[0] / 100,
        "cost_breakdown_minor": breakdown,
        "distance_km": key[2] / 1000,
        "travel_time_seconds": key[1],
        "edge_ids": list(path_edges),
        "node_ids": list(path_nodes),
        "legs": list(path_legs),
        "optimality_scope": "complete_supplied_graph" if needs_review_count == 0 else "verified_edges_only",
        "warnings": warnings,
        "reviewed_edge_count": reviewed_edge_count,
        "excluded_needs_review_count": needs_review_count,
    }
