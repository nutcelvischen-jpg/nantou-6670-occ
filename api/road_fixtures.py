from __future__ import annotations

from typing import Any


def build_nantou_road_demo() -> dict[str, Any]:
    return {
        "id": "synthetic-puli-sml-road-network-v1",
        "name": "埔里—日月潭示意路網",
        "source_status": "synthetic",
        "node_ids": ["puli", "ncnu", "sun_moon_lake"],
        "nodes": [
            {"id": "puli", "name": "埔里轉運站"},
            {"id": "ncnu", "name": "暨南大學"},
            {"id": "sun_moon_lake", "name": "日月潭站"},
        ],
        "edges": [
            {"id": "highway-toll", "from": "puli", "to": "sun_moon_lake", "label": "快速道路示意", "distance_km": 21.0, "travel_time_seconds": 1200, "toll_ntd": 120, "energy_factor": 1.03, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 3.8, "max_vehicle_weight_ton": 25},
            {"id": "local-scenic", "from": "puli", "to": "sun_moon_lake", "label": "地方道路示意", "distance_km": 28.0, "travel_time_seconds": 2850, "toll_ntd": 0, "energy_factor": 1.12, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 4.0, "max_vehicle_weight_ton": 20},
            {"id": "puli-ncnu", "from": "puli", "to": "ncnu", "label": "暨大方向道路示意", "distance_km": 6.5, "travel_time_seconds": 780, "toll_ntd": 0, "energy_factor": 1.02, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 4.0, "max_vehicle_weight_ton": 20},
            {"id": "ncnu-sml", "from": "ncnu", "to": "sun_moon_lake", "label": "暨大—日月潭道路示意", "distance_km": 18.2, "travel_time_seconds": 1860, "toll_ntd": 0, "energy_factor": 1.05, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 4.0, "max_vehicle_weight_ton": 20},
            {"id": "sml-ncnu", "from": "sun_moon_lake", "to": "ncnu", "label": "日月潭—暨大道路示意", "distance_km": 18.2, "travel_time_seconds": 1860, "toll_ntd": 0, "energy_factor": 1.05, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 4.0, "max_vehicle_weight_ton": 20},
            {"id": "ncnu-puli", "from": "ncnu", "to": "puli", "label": "暨大方向—埔里道路示意", "distance_km": 6.5, "travel_time_seconds": 780, "toll_ntd": 0, "energy_factor": 1.02, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 4.0, "max_vehicle_weight_ton": 20},
            {"id": "sml-puli-highway", "from": "sun_moon_lake", "to": "puli", "label": "快速道路示意", "distance_km": 21.0, "travel_time_seconds": 1200, "toll_ntd": 120, "energy_factor": 1.03, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 3.8, "max_vehicle_weight_ton": 25},
            {"id": "sml-puli-local", "from": "sun_moon_lake", "to": "puli", "label": "地方道路示意", "distance_km": 28.0, "travel_time_seconds": 2850, "toll_ntd": 0, "energy_factor": 1.12, "energy_kind": "either", "access_status": "verified", "max_vehicle_height_m": 4.0, "max_vehicle_weight_ton": 20},
        ],
    }


def demo_profiles() -> list[dict[str, Any]]:
    return [
        {
            "id": "diesel_demo",
            "name": "柴油公車成本情境",
            "vehicle_class": "bus",
            "energy_kind": "liter",
            "energy_per_km": 1 / 2.26,
            "energy_price_per_unit": 28.5,
            "driver_cost_per_hour": 120,
            "maintenance_cost_per_km": 6,
            "max_vehicle_height_m": 3.5,
            "max_vehicle_weight_ton": 18,
            "assumptions": ["2.26 km/L", "燃油 28.5 元/L（示例）", "駕駛 120 元/小時", "維護 6 元/車公里"],
        },
        {
            "id": "electric_demo",
            "name": "電動公車成本情境",
            "vehicle_class": "bus",
            "energy_kind": "kwh",
            "energy_per_km": 1 / 0.7,
            "energy_price_per_unit": 3.5,
            "driver_cost_per_hour": 120,
            "maintenance_cost_per_km": 4,
            "max_vehicle_height_m": 3.5,
            "max_vehicle_weight_ton": 18,
            "assumptions": ["0.7 km/kWh", "電價 3.5 元/kWh（示例）", "駕駛 120 元/小時", "維護 4 元/車公里"],
        },
    ]
