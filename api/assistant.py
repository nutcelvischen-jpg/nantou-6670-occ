from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from api.fleet_optimizer import FleetCandidate, solve_candidate_set


OPENCODE_BASE_URL = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/inference/openai/v1").rstrip("/")
ALLOWED_ROUTES = {"全部", "6670A", "6670B", "6670D", "6670E", "6670F", "6670H"}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_service_status",
            "description": "查詢系統已接入的即時公車狀態；若沒有GPS/ETA資料，必須回報無法確認。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_demand_summary",
            "description": "查詢指定年度和6670子線的電子票證每小時交易彙總，找出交易量最高的時段。",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "enum": [2024, 2025]},
                    "route": {"type": "string", "enum": sorted(ALLOWED_ROUTES)},
                },
                "required": ["year", "route"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_timetable_summary",
            "description": "查詢本機保存的6670官網班表快照及其有效日期、驗證限制。",
            "parameters": {
                "type": "object",
                "properties": {"direction": {"type": "string", "enum": ["taichung_to_sun_moon_lake", "sun_moon_lake_to_taichung", "all"]}},
                "required": ["direction"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_fleet_optimization",
            "description": "以歷史需求比例和合成候選班次，預覽需求增加情境下的最低成本班次集合。必須清楚稱為示範情境，不可稱真實排班。",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "enum": [2024, 2025]},
                    "route": {"type": "string", "enum": sorted(ALLOWED_ROUTES)},
                    "demand_increase_pct": {"type": "integer", "minimum": 0, "maximum": 100},
                },
                "required": ["year", "route", "demand_increase_pct"],
                "additionalProperties": False,
            },
        },
    },
]

FLEET_CANDIDATES = [
    FleetCandidate("T-1510", "15:10", 910, 45, 2020, "6670-03"),
    FleetCandidate("T-1540", "15:40", 940, 35, 1820, "6670-08"),
    FleetCandidate("T-1610", "16:10", 970, 55, 2270, "6670-05"),
    FleetCandidate("T-1640", "16:40", 1000, 35, 1760, "6670-11"),
    FleetCandidate("T-1710", "17:10", 1030, 45, 2110, "6670-03"),
    FleetCandidate("T-1740", "17:40", 1060, 55, 2370, "6670-12"),
    FleetCandidate("T-1810", "18:10", 1090, 55, 2280, "6670-05"),
    FleetCandidate("T-1840", "18:40", 1120, 35, 1800, "6670-08"),
]


class AssistantProviderError(RuntimeError):
    pass


def _source(source_id: str, title: str, status: str, as_of: str | None, url: str | None = None) -> dict[str, Any]:
    return {"id": source_id, "title": title, "status": status, "as_of": as_of, "url": url}


def _find_year(aggregates: dict[str, Any], year: int) -> dict[str, Any] | None:
    return next((row for row in aggregates.get("years", []) if str(row.get("source", "")).startswith(str(year))), None)


def _execute_tool(name: str, arguments: dict[str, Any], aggregates: dict[str, Any], timetable: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if name == "get_service_status":
        return (
            {
                "state": "unavailable",
                "message": "目前系統未接入車輛 GPS／ETA 即時資料，無法確認是否延誤或車輛位置。",
                "available_sources": ["6670 官網班表靜態快照", "TDX 靜態路線資料"],
            },
            [],
        )
    if name == "get_demand_summary":
        year = arguments.get("year")
        route = arguments.get("route")
        if year not in (2024, 2025) or route not in ALLOWED_ROUTES:
            raise ValueError("invalid demand tool arguments")
        record = _find_year(aggregates, year)
        if not record:
            raise ValueError("requested year is unavailable")
        counts = [0] * 24
        for row in record.get("hour_by_route", []):
            if route != "全部" and row.get("route") != route:
                continue
            hour = row.get("hour")
            if isinstance(hour, int) and 0 <= hour < 24:
                counts[hour] += int(row.get("transactions", 0))
        peak_hour = max(range(24), key=lambda hour: counts[hour])
        source_date = record.get("source", "")[:4]
        generated_at = aggregates.get("generated_at")
        return (
            {
                "year": year,
                "route": route,
                "unit": "ticket_transactions",
                "peak_hour": peak_hour,
                "peak_transactions": counts[peak_hour],
                "hourly_transactions": counts,
                "interpretation": "票證交易數不是完整乘客數，也不含拒載或現金乘客。",
            },
            [_source(f"ticket-aggregate-{source_date}", f"{source_date}年6670票證彙總", "observed_aggregate", generated_at, "/資料品質")],
        )
    if name == "get_timetable_summary":
        direction = arguments.get("direction")
        if direction not in {"taichung_to_sun_moon_lake", "sun_moon_lake_to_taichung", "all"}:
            raise ValueError("invalid timetable tool arguments")
        trips = [trip for trip in timetable.get("trips", []) if direction == "all" or trip.get("direction") == direction]
        return (
            {
                "route_name": timetable.get("route_name"),
                "trip_count": len(trips),
                "effective_from": timetable.get("effective_from"),
                "snapshot_captured_at": timetable.get("snapshot_captured_at"),
                "dataset_status": timetable.get("dataset_status"),
                "fare_status": timetable.get("fare_status"),
                "warnings": timetable.get("warnings", [])[:4],
                "direction": direction,
            },
            [_source("ntbus-timetable-snapshot", "南投客運6670官網班表快照", "published_snapshot_unverified_for_today", timetable.get("snapshot_captured_at"), timetable.get("source_url"))],
        )
    if name == "preview_fleet_optimization":
        year = arguments.get("year")
        route = arguments.get("route")
        increase_pct = arguments.get("demand_increase_pct")
        if year not in (2024, 2025) or route not in ALLOWED_ROUTES or not isinstance(increase_pct, int) or isinstance(increase_pct, bool) or not 0 <= increase_pct <= 100:
            raise ValueError("invalid optimization preview arguments")
        record = _find_year(aggregates, year)
        if not record:
            raise ValueError("requested year is unavailable")
        counts = [0] * 24
        for row in record.get("hour_by_route", []):
            if route != "全部" and row.get("route") != route:
                continue
            hour = row.get("hour")
            if isinstance(hour, int) and 0 <= hour < 24:
                counts[hour] += int(row.get("transactions", 0))
        total = sum(counts)
        evening = sum(counts[15:19])
        base_demand = max(45, round(evening / max(1, total) * 320))
        demand = round(base_demand * (1 + increase_pct / 100))
        result = solve_candidate_set(FLEET_CANDIDATES, demand, 0.9, 5)
        source_date = record.get("source", "")[:4]
        return (
            {
                **result,
                "year": year,
                "route": route,
                "base_demand_assumption": base_demand,
                "demand_increase_pct": increase_pct,
                "candidate_departures": [candidate.label for candidate in FLEET_CANDIDATES],
                "selected_departures": [candidate.label for candidate in FLEET_CANDIDATES if candidate.id in result.get("selected_ids", [])],
                "data_note": "以歷史交易比例映射到320人次情境基數；容量、候選班次、固定車輛與成本均為合成假設。",
            },
            [
                _source(f"ticket-aggregate-{source_date}", f"{source_date}年6670票證彙總", "observed_aggregate", aggregates.get("generated_at"), "/需求分析"),
                _source("synthetic-fleet-candidates", "合成候選班次／車輛／成本", "assumed", None),
            ],
        )
    raise ValueError("tool is not allowlisted")


def _completion(messages: list[dict[str, Any]], api_key: str, model: str, include_tools: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 500,
        "stream": False,
    }
    if include_tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"
        body["parallel_tool_calls"] = False
    client = OpenAI(base_url=OPENCODE_BASE_URL, api_key=api_key, timeout=25)
    try:
        response = client.chat.completions.create(**body)
    except APIStatusError as error:
        if error.status_code == 402:
            raise AssistantProviderError("OpenCode HTTP 402：帳戶額度不足或上游付款尚未啟用") from error
        raise AssistantProviderError(f"OpenCode HTTP {error.status_code}") from error
    except (APIConnectionError, APITimeoutError) as error:
        raise AssistantProviderError("OpenCode request failed") from error
    if not response.choices or response.choices[0].message is None:
        raise AssistantProviderError("OpenCode response did not include a message")
    return response.choices[0].message.model_dump(exclude_none=True)


def _required_tool(message: str) -> str | None:
    text = message.lower()
    if re.search(r"現在|即時|延誤|誤點|車到了|車在哪|gps|eta|有沒有來|車況", text):
        return "get_service_status"
    if re.search(r"班次|時刻|末班|發車|時刻表", text):
        return "get_timetable_summary"
    if re.search(r"最佳化|配置|需求.*(增加|提高|上升)|增加.*%|提高.*%|情境", text):
        return "preview_fleet_optimization"
    if re.search(r"尖峰|離峰|需求|運量|交易量|哪個時段|最高", text):
        return "get_demand_summary"
    return None


def answer_with_opencode(message: str, mode: str, aggregates: dict[str, Any], timetable: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("OPENCODE_API_KEY", "").strip()
    model = os.getenv("OPENCODE_MODEL", "deepseek-v4.1-flash").strip()
    if not api_key or not model:
        raise AssistantProviderError("OpenCode is not configured")
    system = (
        "你是潭行 Twin 的交通資訊助理。只用工具回傳的資料回答南投6670公共運輸問題。"
        "需要時選擇提供的唯讀工具；不得猜測即時車況、餘位、票價或班表有效性。"
        "若工具回報沒有GPS/ETA，就清楚說無法確認即時行車狀態。最佳化預覽使用合成車輛、容量、班次和成本時，必須說明這些假設，並且不能稱為實際可執行排班。"
        "將票證交易稱為交易，不可稱為完整乘客人數。用繁體中文簡短回答，並尊重來源的日期和限制。"
        f"使用者模式：{mode}。"
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": message}]
    first = _completion(messages, api_key, model)
    tool_calls = first.get("tool_calls") or []
    sources: list[dict[str, Any]] = []
    used_tools: list[str] = []
    if tool_calls:
        messages.append(first)
        for call in tool_calls[:2]:
            function = call.get("function") or {}
            name = function.get("name")
            try:
                arguments = json.loads(function.get("arguments") or "{}")
                if not isinstance(arguments, dict):
                    raise ValueError("tool arguments must be an object")
                result, tool_sources = _execute_tool(name, arguments, aggregates, timetable)
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                result, tool_sources = {"error": "此查詢參數無效，請改用建議範例問題。"}, []
            if call.get("id"):
                messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, ensure_ascii=False)})
            sources.extend(tool_sources)
            if name in {tool["function"]["name"] for tool in TOOLS}:
                used_tools.append(name)
        final = _completion(messages, api_key, model, include_tools=False)
        answer = final.get("content")
    else:
        answer = first.get("content")
    required_tool = _required_tool(message)
    if required_tool and required_tool not in used_tools:
        raise AssistantProviderError("OpenCode did not use the required data tool")
    if not isinstance(answer, str) or not answer.strip():
        raise AssistantProviderError("OpenCode returned an empty answer")
    if "get_service_status" in used_tools:
        data_status = "missing"
    elif "preview_fleet_optimization" in used_tools:
        data_status = "assumed"
    elif "get_timetable_summary" in used_tools:
        data_status = "stale"
    else:
        data_status = "sourced" if sources else "general"
    return {
        "answer": answer.strip(),
        "mode": mode,
        "engine": "opencode",
        "data_status": data_status,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "tool_calls": used_tools,
        "suggested_actions": [],
    }


# Keep the previous import name available for local tests and downstream callers.
answer_with_openrouter = answer_with_opencode


def answer_demo(message: str, mode: str, aggregates: dict[str, Any], timetable: dict[str, Any], year: int, route: str) -> dict[str, Any]:
    text = message.lower()
    if re.search(r"現在|即時|延誤|誤點|車到了|車在哪|gps|eta|有沒有來|車況", text):
        data, sources = _execute_tool("get_service_status", {}, aggregates, timetable)
        answer = data["message"] + " 可查到的是公開班表快照，但它沒有即時行車資訊。"
        status = "missing"
        actions = ["查看6670班表快照", "改查歷史尖峰交易"]
    elif re.search(r"尖峰|離峰|需求|運量|交易量|哪個時段|最高", text) and not re.search(r"增加|提高|上升|最佳化|配置|情境", text):
        data, sources = _execute_tool("get_demand_summary", {"year": year, "route": route}, aggregates, timetable)
        answer = f"{data['year']} 年 {data['route']} 的票證交易最高時段是 {data['peak_hour']:02d}:00–{data['peak_hour'] + 1:02d}:00，共 {data['peak_transactions']:,} 筆交易。這是歷史票證彙總，交易數不等於完整乘客數，也不能代表目前候車量。"
        status = "sourced"
        actions = ["在需求分析查看24小時曲線", "切換年度或子線"]
    elif re.search(r"班次|時刻|末班|發車|時刻表", text):
        data, sources = _execute_tool("get_timetable_summary", {"direction": "all"}, aggregates, timetable)
        answer = f"本機保存的6670主表快照含 {data['trip_count']} 個雙向班次列，頁面標示自 {data['effective_from']} 起生效，快照擷取日為 {data['snapshot_captured_at']}。目前未核實它今天仍有效，也未含另外列出的九人座班表；請以業者公告為準。"
        status = "stale"
        actions = ["開啟旅遊資訊班表查詢", "查看原始來源限制"]
    elif re.search(r"最佳化|配置|需求.*(增加|提高|上升)|增加.*%|提高.*%|情境", text):
        match = re.search(r"(\d{1,3})\s*%|百分之\s*(\d{1,3})", text)
        increase_pct = int(next(value for value in match.groups() if value)) if match else 15
        data, sources = _execute_tool("preview_fleet_optimization", {"year": year, "route": route, "demand_increase_pct": min(100, increase_pct)}, aggregates, timetable)
        selected = "、".join(data["selected_departures"]) or "無可行候選班次"
        if data["status"] in {"optimal", "feasible"}:
            answer = f"在需求增加 {data['demand_increase_pct']}% 的示範情境中，估計需求為 {data['demand']} 人次；CP-SAT 在合成的 8 個候選班次內選出 {selected}，示例成本 NT${data['objective_ntd']:,}，容量服務 {data['served']}/{data['demand']}。這不是實際車隊排班；基準換算、容量、車輛和成本都是假設。"
        else:
            answer = f"需求增加 {data['demand_increase_pct']}% 後，現有合成候選集合無法滿足 90% 服務底線。這不代表真實車隊無解；目前車輛、容量與成本都是示範假設。"
        status = "assumed"
        actions = ["前往班次最佳化查看限制", "在需求分析查看歷史分布"]
    else:
        answer = "我目前在公開資料示範模式，可以查歷史尖離峰票證彙總、6670班表快照，或說明為什麼目前無法確認即時車況。你可以點選下方範例問題。"
        sources = []
        status = "demo"
        actions = ["哪個時段票證交易最多？", "現在 6670 有沒有延誤？", "6670 班表快照有哪些限制？"]
    return {
        "answer": answer,
        "mode": mode,
        "engine": "demo",
        "data_status": status,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "tool_calls": [],
        "suggested_actions": actions,
    }
