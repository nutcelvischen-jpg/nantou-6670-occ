from __future__ import annotations

import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse
from api.road_fixtures import build_nantou_road_demo, demo_profiles
from api.road_router import find_least_operating_cost_path
from api.fleet_optimizer import FleetCandidate, solve_candidate_set
from api.tdx_adapter import TdxClient, TdxError
from api.assistant import AssistantProviderError, answer_demo, answer_out_of_scope, answer_with_openrouter, is_operations_question

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AGGREGATES_PATH = PROJECT_ROOT / "src" / "data" / "ticket-aggregates.json"
TIMETABLE_PATH = PROJECT_ROOT / "src" / "data" / "ntbus-6670-timetable.json"
FORBIDDEN_RAW_KEYS = {"raw_card_id", "card_id", "card_number", "raw_driver_id"}

app = FastAPI(
    title="Nantou Transit Twin API",
    version="0.1.0",
    description="Read-only local API over privacy-safe ticket aggregates.",
)
tdx_client = TdxClient(os.getenv("TDX_CLIENT_ID"), os.getenv("TDX_CLIENT_SECRET"))


class FleetCandidateInput(BaseModel):
    id: str = Field(min_length=1, max_length=48)
    label: str = Field(min_length=1, max_length=24)
    departure_minute: int = Field(ge=0, lt=1440)
    capacity: int = Field(ge=0, le=10000)
    cost_ntd: int = Field(ge=0, le=1_000_000_000)
    vehicle: str = Field(min_length=1, max_length=48)
    turnaround_minutes: int = Field(default=120, ge=0, le=24 * 60)


class FleetOptimizationRequest(BaseModel):
    candidates: list[FleetCandidateInput] = Field(min_length=1, max_length=256)
    demand: int = Field(ge=0, le=1_000_000)
    min_served_ratio: float = Field(ge=0, le=1)
    max_time_seconds: float = Field(default=5, ge=0.05, le=30)


class SimulationBus(BaseModel):
    id: str = Field(pattern=r"^B\d{2,3}$")
    state: str = Field(pattern=r"^(run|idle|lay|dh|done|rest)$")
    load: float = Field(ge=-10000, le=10000)
    capacity: float = Field(ge=0, le=100)
    delay_minutes: float | None = Field(default=None, ge=0, le=1440)
    next_stop: str | None = Field(default=None, pattern=r"^(TC|HSR|PULI|JNU|YC|SML|XS|J9)$")

class SimulationQueue(BaseModel):
    station: str = Field(pattern=r"^(TC|HSR|PULI|JNU|YC|SML|XS|J9)$")
    waiting: float = Field(ge=0, le=1e7)
    oldest_wait_minutes: float = Field(ge=0, le=1500)

class ReplayOptimization(BaseModel):
    deadhead_mode: str | None = Field(default=None, pattern=r"^(p85|p50|fixed)$")
    crew_swap: bool | None = None
    model_version: str | None = Field(default=None, pattern=r"^crew-reference-2026-10-24$")
    capacity: float | None = Field(default=None, ge=0, le=100)
    scenario_load_limit: float | None = Field(default=None, ge=0, le=1)
    base_threshold_exceedances: float | None = Field(default=None, ge=0, le=1e8)
    trips: float = Field(ge=0, le=1e8)
    base_buses: float = Field(ge=0, le=1e8)
    replanned_buses: float = Field(ge=0, le=1e8)
    base_crews: float = Field(ge=0, le=1e8)
    replanned_crews: float = Field(ge=0, le=1e8)
    base_cost: float = Field(ge=0, le=1e8)
    replanned_cost: float = Field(ge=0, le=1e8)
    remaining_rule_violations: float = Field(ge=0, le=1e8)
    drive_limit: float = Field(ge=0, le=24)
    continuous_limit: float = Field(ge=0, le=24)
    rest_minutes: float = Field(ge=0, le=1440)
    span_limit: float = Field(ge=0, le=24)
    turn_minutes: float = Field(ge=0, le=1440)
    scenario_growth: float = Field(ge=0, le=1e8)
    scenario_shift: float = Field(ge=0, le=1440)
    scenario_buses: float = Field(ge=0, le=1e8)
    scenario_crews: float = Field(ge=0, le=1e8)
    scenario_added: float = Field(ge=0, le=1e8)
    scenario_merged: float = Field(ge=0, le=1e8)

class SimulationSnapshot(BaseModel):
    optimization: ReplayOptimization | None = None
    kind: str = Field(default="simulation", pattern=r"^(simulation|ticket_replay)$")
    selected_routes: list[str] = Field(default_factory=list, max_length=6)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    minute: float = Field(ge=0, le=1500)
    plan: str = Field(pattern=r"^(cur|opt)$")
    congestion: bool = False
    vehicles: list[SimulationBus] = Field(default_factory=list, max_length=100)
    queues: list[SimulationQueue] = Field(default_factory=list, max_length=10)

class AssistantRequest(BaseModel):
    mode: str = Field(default="operations", pattern="^operations$")
    message: str = Field(min_length=1, max_length=2000)
    year: int = Field(default=2025, ge=2000, le=2100)
    compare_year: int | None = Field(default=None, ge=2000, le=2100)
    route: str = Field(default="全部", max_length=24)
    simulation: SimulationSnapshot | None = None


def validate_aggregate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("synthetic") is not False:
        raise ValueError("aggregate payload must declare synthetic=false")
    years = payload.get("years")
    if not isinstance(years, list) or not years:
        raise ValueError("aggregate payload must contain year summaries")
    for year in years:
        if not isinstance(year, dict):
            raise ValueError("year summary must be an object")
        rows = year.get("rows")
        parsed_rows = year.get("parsed_rows")
        if not isinstance(rows, int) or rows < 0:
            raise ValueError("rows must be a nonnegative integer")
        if not isinstance(parsed_rows, int) or parsed_rows < 0:
            raise ValueError("parsed_rows must be a nonnegative integer")
        for collection in (
            "hour_by_route",
            "daily",
            "routes",
            "top_od",
            "top_stations",
            "ticket_types",
            "card_transaction_frequency",
            "same_day_return_interval",
        ):
            if not isinstance(year.get(collection), list):
                raise ValueError(f"{collection} must be an array")
    def reject_restricted_fields(value: Any) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                if key.lower() in FORBIDDEN_RAW_KEYS:
                    raise ValueError(f"restricted field present: {key}")
                reject_restricted_fields(nested)
        elif isinstance(value, list):
            for nested in value:
                reject_restricted_fields(nested)

    reject_restricted_fields(payload)
    return payload


@lru_cache(maxsize=1)
def load_aggregate_document() -> tuple[dict[str, Any], str]:
    try:
        raw = AGGREGATES_PATH.read_bytes()
        payload = validate_aggregate_payload(json.loads(raw))
    except FileNotFoundError as error:
        raise RuntimeError("privacy-safe aggregate dataset is missing") from error
    except (json.JSONDecodeError, ValueError) as error:
        raise RuntimeError("privacy-safe aggregate dataset failed validation") from error
    return payload, hashlib.sha256(raw).hexdigest()


def _error(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


@app.get("/health/ready")
def readiness() -> JSONResponse:
    try:
        payload, digest = load_aggregate_document()
    except RuntimeError:
        return _error("AGGREGATE_DATA_UNAVAILABLE", "聚合資料目前無法讀取。", 503)
    return JSONResponse(
        content={
            "status": "ready",
            "service": "nantou-transit-twin-api",
            "data_mode": "read_only_local_aggregate",
            "dataset_version": digest,
            "years": [year["source"][:4] for year in payload["years"]],
        }
    )


@app.get("/api/v1/datasets/aggregates")
def dataset_aggregates() -> JSONResponse:
    try:
        payload, digest = load_aggregate_document()
    except RuntimeError:
        return _error("AGGREGATE_DATA_UNAVAILABLE", "聚合資料目前無法讀取。", 503)
    return JSONResponse(
        content=payload,
        headers={"ETag": f'"{digest}"', "Cache-Control": "no-cache"},
    )


@app.get("/api/v1/datasets/versions")
def dataset_versions() -> dict[str, Any]:
    try:
        payload, digest = load_aggregate_document()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="聚合資料目前無法讀取。") from error
    return {
        "versions": [
            {
                "id": digest,
                "kind": "ticket_aggregate",
                "status": "read_only_local",
                "generated_at": payload.get("generated_at"),
                "source_count": len(payload["years"]),
                "row_count": sum(year["rows"] for year in payload["years"]),
                "years": [year["source"][:4] for year in payload["years"]],
            }
        ]
    }


@app.post("/api/v1/optimizations/fleet")
def optimize_fleet(request: FleetOptimizationRequest) -> JSONResponse:
    try:
        result = solve_candidate_set(
            [FleetCandidate(**candidate.model_dump()) for candidate in request.candidates],
            request.demand,
            request.min_served_ratio,
            request.max_time_seconds,
        )
    except ValueError as error:
        return _error("INVALID_OPTIMIZATION_INPUT", str(error), 422)
    return JSONResponse(content=result)


@app.post("/api/v1/assistant/answer")
def assistant_answer(request: AssistantRequest) -> JSONResponse:
    message = request.message.strip()
    if not message:
        return _error("EMPTY_ASSISTANT_MESSAGE", "請輸入想查詢的問題。", 422)
    if request.route not in {"全部", "6670A", "6670B", "6670D", "6670E", "6670F", "6670H"}:
        return _error("INVALID_ASSISTANT_FILTER", "目前只支援 6670 路線家族的篩選。", 422)
    try:
        aggregates, digest = load_aggregate_document()
        timetable = json.loads(TIMETABLE_PATH.read_text(encoding="utf-8"))
    except (RuntimeError, OSError, json.JSONDecodeError):
        return _error("ASSISTANT_DATA_UNAVAILABLE", "助理目前無法讀取所需資料。", 503)
    available = {int(row['source'][:4]) for row in aggregates['years']}
    if request.year not in available or (request.compare_year is not None and request.compare_year not in available):
        return _error('INVALID_ASSISTANT_YEAR', '該年度尚無聚合資料。', 422)
    timetable = {**timetable, '_annual_selection': {'message': message, 'year': request.year, 'compare_year': request.compare_year, 'route': request.route}}
    if not is_operations_question(message):
        answer = answer_out_of_scope(request.mode)
    else:
        try:
            if os.getenv("OPENROUTER_API_KEY"):
                answer = answer_with_openrouter(message, request.mode, aggregates, timetable, request.simulation.model_dump() if request.simulation else None)
            else:
                answer = answer_demo(message, request.mode, aggregates, timetable, request.year, request.route)
        except AssistantProviderError as provider_error:
            answer = answer_demo(message, request.mode, aggregates, timetable, request.year, request.route)
            answer["engine"] = "demo_fallback"
            answer["provider_notice"] = f"{provider_error}；已退回可追溯的本機資料示範回覆。"
    answer["dataset_version"] = digest
    answer["request_id"] = hashlib.sha256(f"{datetime.now(timezone.utc).isoformat()}:{message}".encode()).hexdigest()[:16]
    return JSONResponse(content=answer, headers={"Cache-Control": "no-store"})


@app.get("/api/v1/demand/hourly")
def demand_hourly(
    year: int = Query(ge=2000, le=2100),
    route: str = Query(default="全部", max_length=24),
) -> dict[str, Any]:
    try:
        payload, digest = load_aggregate_document()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="聚合資料目前無法讀取。") from error
    selected = next(
        (row for row in payload["years"] if row["source"].startswith(str(year))),
        None,
    )
    if selected is None:
        raise HTTPException(status_code=404, detail="沒有此年度的聚合資料。")
    counts = [0] * 24
    for row in selected["hour_by_route"]:
        if route != "全部" and row["route"] != route:
            continue
        hour = row["hour"]
        if isinstance(hour, int) and 0 <= hour < 24:
            counts[hour] += row["transactions"]
    return {
        "year": year,
        "route": route,
        "unit": "ticket_transactions",
        "population_definition": "可解析上車時間的票證交易列；非乘客數",
        "dataset_version": digest,
        "data": [{"hour": hour, "transactions": value} for hour, value in enumerate(counts)],
    }


@app.get("/api/v1/integrations/tdx/status")
def tdx_status() -> dict[str, Any]:
    return tdx_client.status()


@app.post("/api/v1/integrations/tdx/validate")
def tdx_validate() -> JSONResponse:
    try:
        tdx_client.access_token()
    except TdxError as error:
        return JSONResponse(
            status_code=error.status_code,
            content={
                "state": "not_connected",
                "reason_code": error.code,
                "message": error.message,
            },
        )
    return JSONResponse(content=tdx_client.status())


@app.get("/api/v1/integrations/tdx/route-map")
def tdx_route_map(
    route_prefix: str = Query(default="6670", min_length=1, max_length=16),
) -> JSONResponse:
    try:
        payload = tdx_client.route_map(route_prefix)
    except TdxError as error:
        return JSONResponse(
            status_code=error.status_code,
            content={"error": {"code": error.code, "message": error.message}},
        )
    except ValueError as error:
        return _error("INVALID_ROUTE_PREFIX", str(error), 422)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return JSONResponse(
        content=payload,
        headers={"ETag": f'"{hashlib.sha256(encoded).hexdigest()}"', "Cache-Control": "private, no-cache"},
    )


@lru_cache(maxsize=1)
def load_6670_timetable() -> tuple[dict[str, Any], str]:
    try:
        raw = TIMETABLE_PATH.read_bytes()
        payload = json.loads(raw)
    except FileNotFoundError as error:
        raise RuntimeError("public 6670 timetable snapshot is missing") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("public 6670 timetable snapshot is invalid JSON") from error
    trips = payload.get("trips") if isinstance(payload, dict) else None
    if (
        not isinstance(payload, dict)
        or payload.get("dataset_id") != "ntbus-6670-public-timetable-snapshot"
        or payload.get("dataset_status") != "published_snapshot_unverified_for_today"
        or not isinstance(trips, list)
        or not trips
    ):
        raise RuntimeError("public 6670 timetable snapshot failed validation")
    return payload, hashlib.sha256(raw).hexdigest()


@app.get("/api/v1/timetables/6670")
def timetable_6670() -> JSONResponse:
    try:
        payload, digest = load_6670_timetable()
    except RuntimeError:
        return _error("TIMETABLE_UNAVAILABLE", "6670 公開班表快照目前無法讀取。", 503)
    return JSONResponse(
        content=payload,
        headers={"ETag": f'"{digest}"', "Cache-Control": "no-cache"},
    )


@app.get("/api/v1/road-routes/demo")
def road_routes_demo(
    origin: str = Query(default="puli", max_length=48),
    destination: str = Query(default="sun_moon_lake", max_length=48),
) -> JSONResponse:
    graph = build_nantou_road_demo()
    node_names = {node["id"]: node["name"] for node in graph["nodes"]}
    if origin not in node_names or destination not in node_names:
        return _error("UNKNOWN_ROAD_NODE", "起點或目的地不在這份示意道路網中。", 422)
    profiles = demo_profiles()
    results = [
        {
            "profile_id": profile["id"],
            "profile_name": profile["name"],
            "assumptions": profile["assumptions"],
            "result": find_least_operating_cost_path(graph, origin, destination, profile),
        }
        for profile in profiles
    ]
    payload = {
        "graph_id": graph["id"],
        "graph_name": graph["name"],
        "source_status": graph["source_status"],
        "origin": {"id": origin, "name": node_names[origin]},
        "destination": {"id": destination, "name": node_names[destination]},
        "objective": "operating_cost_min",
        "objective_unit": "TWD_cent",
        "algorithm": "Dijkstra with deterministic time-distance tie-breaks",
        "nodes": graph["nodes"],
        "edges": graph["edges"],
        "results": results,
        "warnings": [
            "道路拓樸、距離、旅行時間、通行限制與價格均為合成示例，不能作為真實車輛導航或成本估算。",
            "不含方向轉向限制、即時封路、坡度/SOC、駕駛勤務、固定出車費或營運服務底線。",
        ],
    }
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return JSONResponse(content=payload, headers={"ETag": f'"{digest}"', "Cache-Control": "no-cache"})
