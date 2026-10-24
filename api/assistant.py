from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any
from pathlib import Path

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from api.fleet_optimizer import FleetCandidate, solve_candidate_set


OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
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
                    "year": {"type": "integer", "minimum": 2000, "maximum": 2100},
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
            "name": "get_ticket_behavior_summary",
            "description": "查詢公開安全聚合的卡片交易頻次與同日反向OD回程間隔分布；只能作群體行為代理，不可辨識個人或確定旅程。",
            "parameters": {
                "type": "object",
                "properties": {"year": {"type": "integer", "minimum": 2000, "maximum": 2100}},
                "required": ["year"],
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
                    "year": {"type": "integer", "minimum": 2000, "maximum": 2100},
                    "route": {"type": "string", "enum": sorted(ALLOWED_ROUTES)},
                    "demand_increase_pct": {"type": "integer", "minimum": 0, "maximum": 100},
                },
                "required": ["year", "route", "demand_increase_pct"],
                "additionalProperties": False,
            },
        },
    },
]


TOOLS.append({"type":"function","function":{"name":"get_annual_comparison","description":"讀取畫面選定的兩年度票證比較，包含總量、日均、月份、時段、子線與缺日；問題指定的年份優先，資料由伺服器重算。","parameters":{"type":"object","properties":{},"additionalProperties":False}}})

from api.annual_comparison import annual_context, is_annual_question, available_years

SUPPORTED_TOPIC = re.compile(
    r"方案|甘特|未安排|車型|加班|實扣|票種|站點|計費站|年度|年增|同比|去年|前年|比較.*20\d{2}|20\d{2}.*20\d{2}|預測|尖峰|離峰|運量|交易|票證|回程|頻次|od|乘載|載客率|需求|班次|班距|配置|最佳化|最佳化|成本|情境|候選|車隊|營運|儀表板|即時|延誤|誤點|gps|eta|車況|資料狀態|資料品質|來源|回測|wape|mae|碳排|排放|最多|最高|時段|查需求|查運量|B\s?\d|號車|排隊|候車|加開|調度|滿載|異常|告警|現況|狀況|最擠|人數",
    re.IGNORECASE,
)


GUIDE_PATH = Path(__file__).resolve().parents[1] / "shared/site-guide.json"
GUIDE_QUERY = re.compile(r"第一次|新手|導覽|怎麼用|怎麼操作|使用說明|手冊|操作|來源|怎麼來|如何計算|怎麼算|公式|定義|方法|意思|解釋|為什麼|怎麼解讀|如何解讀|有哪些頁|功能")
TOOLS.append({"type":"function","function":{"name":"get_site_guide","description":"讀取本站所有頁面操作、數據來源、單位、公式、理由與限制的正式使用手冊；新手導覽或方法解釋必用。","parameters":{"type":"object","properties":{},"additionalProperties":False}}})


def is_operations_question(message: str) -> bool:
    """A deterministic scope gate; unsupported prompts never reach the LLM."""
    return bool(SUPPORTED_TOPIC.search(message) or GUIDE_QUERY.search(message))


def answer_out_of_scope(mode: str = "operations") -> dict[str, Any]:
    return {
        "answer": "我目前是內部營運分析助理，只支援需求預測、尖離峰、票證彙總與行為、班次配置與成本情境，以及儀表板資料狀態。旅遊行程、旅客客服及其他一般問題目前不在支援範圍。",
        "mode": mode,
        "engine": "demo",
        "data_status": "general",
        "as_of": datetime.now(timezone.utc).isoformat(),
        "sources": [],
        "tool_calls": [],
        "suggested_actions": ["查詢尖離峰票證交易", "檢視班次最低成本情境", "確認即時資料來源狀態"],
    }

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
    if name == "get_site_guide":
        if arguments: raise ValueError("guide accepts no arguments")
        return {**json.loads(GUIDE_PATH.read_text()), "simulation": timetable.get("_simulation")}, [_source("site-guide","本站使用手冊與數據字典","documented_method",None,"/manual/index.html")]
    if name == "get_annual_comparison":
        if arguments: raise ValueError("annual comparison does not accept client metrics")
        selected=timetable.get('_annual_selection', {})
        years=available_years(aggregates)
        result=annual_context(aggregates, selected.get('message','年度比較'),selected.get('year',years[-1]),selected.get('compare_year'),selected.get('route','全部'))
        c=result['annual_comparison']
        if c:
            baseline=json.loads((Path(__file__).resolve().parents[1]/'src/data/baseline-dashboard.json').read_text())
            result['baseline_evidence']={k:baseline[k] for k in ['scope','duration_definition','category_definition']}
            result['baseline_evidence']['years']=[y for y in baseline['years'] if y['year'] in [c['baseYear'],c['targetYear']]]
            result['baseline_evidence']['note']='全子線摘要；只有routes與route_month可作子線分析；缺少的OD不是零，無紀錄月份不能推論停駛。'
        return result, [_source(f"ticket-aggregate-{y}",f"{y}年6670票證聚合","observed_aggregate",aggregates.get('generated_at')) for y in dict.fromkeys([c['baseYear'],c['targetYear']])] if c else []
    if name == "get_service_status":
        return (
            {
                "state": "unavailable",
                "message": "目前系統未接入車輛 GPS／ETA 即時資料，無法確認是否延誤或車輛位置。",
                "available_sources": ["6670 官網班表靜態快照", "TDX 靜態路線資料"],
                "simulation": timetable.get("_simulation"),
            },
            [],
        )
    if name == "get_demand_summary":
        year = arguments.get("year")
        route = arguments.get("route")
        if year not in available_years(aggregates) or route not in ALLOWED_ROUTES:
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
    if name == "get_ticket_behavior_summary":
        year = arguments.get("year")
        if year not in available_years(aggregates):
            raise ValueError("invalid ticket behavior arguments")
        record = _find_year(aggregates, year)
        if not record:
            raise ValueError("requested year is unavailable")
        source_date = record.get("source", "")[:4]
        return (
            {
                "year": year,
                "unit": "privacy_safe_aggregates",
                "card_transaction_frequency": record.get("card_transaction_frequency", []),
                "same_day_return_interval": record.get("same_day_return_interval", []),
                "interpretation": "群體聚合行為代理；同卡同日反向OD配對並非確定同一旅程或身份辨識；小樣本區間已抑制。",
            },
            [_source(f"ticket-aggregate-{source_date}", f"{source_date}年6670票證行為彙總", "observed_aggregate", aggregates.get("generated_at"), "/運量分析")],
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
        if year not in available_years(aggregates) or route not in ALLOWED_ROUTES or not isinstance(increase_pct, int) or isinstance(increase_pct, bool) or not 0 <= increase_pct <= 100:
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
        "max_tokens": 2400,
        "extra_body": {"reasoning": {"enabled": True}},
        "stream": False,
    }
    if include_tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"
        body["parallel_tool_calls"] = False
    client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key, timeout=45, max_retries=0)
    try:
        response = client.chat.completions.create(**body)
    except APIStatusError as error:
        if error.status_code == 402:
            raise AssistantProviderError("OpenRouter HTTP 402：帳戶額度不足或上游付款尚未啟用") from error
        raise AssistantProviderError(f"OpenRouter HTTP {error.status_code}") from error
    except (APIConnectionError, APITimeoutError) as error:
        raise AssistantProviderError("OpenRouter request failed") from error
    if not response.choices or response.choices[0].message is None:
        raise AssistantProviderError("OpenRouter response did not include a message")
    return response.choices[0].message.model_dump(exclude_none=True)


def _required_tool(message: str) -> str | None:
    text = message.lower()
    if re.search(r"第一次|新手|導覽|怎麼用|操作|使用說明|手冊|來源|怎麼來|如何計算|怎麼算|公式|定義|方法|有哪些頁|功能", message): return "get_site_guide"
    if is_annual_question(message): return "get_annual_comparison"
    if re.search(r"現在|即時|延誤|誤點|車到了|車在哪|gps|eta|有沒有來|車況", text):
        return "get_service_status"
    if re.search(r"最佳化|配置|需求.*(增加|提高|上升)|增加.*%|提高.*%|情境", text):
        return "preview_fleet_optimization"
    if re.search(r"回程|頻次|od|票證行為|交易頻次|乘載行為", text):
        return "get_ticket_behavior_summary"
    if re.search(r"回程|頻次|od|票證行為|交易頻次|乘載行為", text):
        return "get_demand_summary"
    if re.search(r"尖峰|離峰|需求|運量|交易量|哪個時段|最高|票證", text):
        return "get_demand_summary"
    return None


def answer_with_openrouter(message: str, mode: str, aggregates: dict[str, Any], timetable: dict[str, Any], simulation: dict[str, Any] | None = None) -> dict[str, Any]:
    if simulation:
        timetable = {**timetable, "_simulation": simulation}
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    model = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v4.1-flash-1017").strip()
    if not api_key or not model:
        raise AssistantProviderError("OpenRouter is not configured")
    if not is_operations_question(message):
        return answer_out_of_scope(mode)
    system = (
        "你是潭行 Twin 的內部營運分析與網站導覽助理，可解釋本站每個頁面（含旅客行程、旅遊資訊、低碳）的操作與資料方法；營運分析處理需求預測、尖離峰、票證彙總與行為、班次與成本最佳化、儀表板資料狀態。"
        "不得回答旅遊規劃、旅客客服或一般無關問題；若意外收到，簡短列出支援範圍。"
        "首次導覽先用4至6步說明主要流程，不要一次列出所有公式。首次導覽與方法問題必須使用get_site_guide，依頁面入口、步驟、來源與單位、公式、好處、限制回答；教學可300至600字，用純文字與簡潔條列，勿使用Markdown粗體、LaTeX或程式欄位名。不知道的指標不可編造。沒有跨輪記憶，追問缺上下文時請重述。"
        "只用核准工具資料回答可查詢的事實；不得猜即時車況、餘位、票價、GPS或ETA。沒有GPS/ETA時明確說無法確認。"
        "成本最佳化頁的8個候選車輛、容量、班次與成本為合成假設；3D重排依當日票證推估車次與成本假設，兩者不能混用，都不能直接稱真實可執行排班。票證筆數是交易數，不是完整乘客數。"
        "站點、OD、票種與實扣金額使用baseline_evidence，注意全子線範圍及前十大OD限制；實扣不是營收、優惠額度不是已核付補貼、票種不代表身分或政策效果、刷卡時間差不是延誤。年度差異必須呼叫get_annual_comparison，用兩年總量、日均及涵蓋日數回答，說明缺日與基期為零；未提供年度不能用其他年替代，不能捏造原因。"
        "用繁體中文，標示來源與資料限制。若get_service_status含simulation，可解讀瀏覽器快照；kind=ticket_replay時稱票證重播，車次與在車量為規則推估，位置為內插，容量是假設，負值為資料異常。候車與延誤未知，不以零代替；不得當作GPS真實車況。回答使用頁面上的中文名稱，不直接輸出control、mode、kind等內部欄位。一般操作說明300至600字，先說模式與結論。若simulation有control，行控選取對象與模式優先用control；fixed或scenario是方案OD配置，不可拿歷史vehicles當成方案V車。control.pendingChanges為true時，先說設定尚未重新計算，dispatch是上次已算結果，不推測新條件結果。一般模式先簡短說目前結果、代價和下一步；被追問時再解釋公式。若simulation有dispatch，05調度與成本問題只用dispatch的當次候選與fixed比較；附營運日、方向、時窗、車隊上限、改搭窗口及版本。不能沿用舊版optimization或文件示例數字。paid及assignedPaid等是整數分，回答元時除100；cost已是元。說明未安排需求與feasible狀態，未通過不可建議直接採用。B換小車不改原始低載比例；H加班不保證低載改善或每班實扣上升；≥43達容量與>43超出容量要分開。所有車型成本是未核實假設，方案成本差只對fixed算；未安排不等於實際拒載。若快照帶optimization，重排問題先用這些當日全線數值，非另一個合成候選集合；成本邊界不同，不能稱實證節省或合規。span_limit是值勤跨度上限，不是班距；重排司機數是啟發式候選，不能稱下限。排班檢核一律稱「超出設定門檻」，不得稱違規或全部合規；remaining_rule_violations為相容舊欄位，意義也是超出設定門檻。回答舊版optimization數字需附營運日、空車調度模式、司機是否換車與門檻；新版dispatch的params.shift明確表示允許改搭±分鐘，必須引用，不得稱未提供。本版司機在同一車輛工作鏈按端點切段換人，不做跨車鏈串司機，不能套用舊版crew_swap。缺參數才說未知，不套用文件預設。文件示範僅限2025-10-11與其列出的參數；不同日期與模式不能代用。"
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": message}]
    if simulation and simulation.get("dispatch"):
        messages[0]["content"] += "本次含05候選快照；當次方案數值先呼叫get_service_status，操作方法可另呼叫get_site_guide。"
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
    if simulation and simulation.get("dispatch") and not is_annual_question(message) and not GUIDE_QUERY.search(message) and re.search(r"方案|甘特|未安排|車型|加班|排班|重排|配置|最佳化|成本", message):
        required_tool = "get_service_status"
    if required_tool and required_tool not in used_tools:
        raise AssistantProviderError("OpenRouter did not use the required data tool")
    if not isinstance(answer, str) or not answer.strip():
        raise AssistantProviderError("OpenRouter returned an empty answer")
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
        "engine": "openrouter",
        "data_status": data_status,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "tool_calls": used_tools,
        "suggested_actions": [],
    }




def answer_demo(message: str, mode: str, aggregates: dict[str, Any], timetable: dict[str, Any], year: int, route: str) -> dict[str, Any]:
    if not is_operations_question(message):
        return answer_out_of_scope(mode)
    text = message.lower()
    if GUIDE_QUERY.search(message):
        data, sources = _execute_tool("get_site_guide", {}, aggregates, timetable)
        answer = "本機規則導覽（非LLM）：先從營運總覽選兩個年度，確認交易單位與缺日；再到數位孿生選日期與定位時間，依序查看預測、尖離峰、票證與班次最佳化。完整來源、公式與步驟請開使用說明。票證重播不是即時GPS，重排只是候選。"
        status = "general"
        actions = []
    elif is_annual_question(message):
        timetable={**timetable,'_annual_selection':{**timetable.get('_annual_selection',{}),'message':message,'year':year,'route':route}}
        result,sources=_execute_tool('get_annual_comparison',{},aggregates,timetable)
        c=result['annual_comparison'];status='sourced' if c else 'missing';actions=['在營運總覽查看年度差異']
        if c:
            t=c['total'];b=c['base'];a=c['target']
            fmt=lambda v:'無資料' if v is None else f'{v:,.1f}'
            answer=f"{c['baseYear']} → {c['targetYear']} 年 {route}：交易量 {fmt(t['base'])} → {fmt(t['target'])} 筆，差異 {fmt(t['delta'])} 筆（{fmt(t['percent'])}%）。有紀錄日 {b['observedDays']}／{a['observedDays']}；日均 {fmt(b['dailyMean'])} → {fmt(a['dailyMean'])} 筆。無紀錄日不是零或停駛證據；交易不是獨立旅客，增減不代表因果。子線無逐日分布時不提供日均。"
        else: answer=f"尚無 {result['unavailable_requested_years']} 年聚合資料，無法比較。"
    elif re.search(r"現在|即時|延誤|誤點|車到了|車在哪|gps|eta|有沒有來|車況", text):
        data, sources = _execute_tool("get_service_status", {}, aggregates, timetable)
        answer = data["message"] + " 可查到的是公開班表快照，但它沒有即時行車資訊。"
        status = "missing"
        actions = ["查看目前資料來源限制", "改查歷史尖峰交易"]
    elif re.search(r"回程|頻次|od|票證行為|交易頻次|乘載行為", text):
        data, sources = _execute_tool("get_ticket_behavior_summary", {"year": year}, aggregates, timetable)
        returns = data["same_day_return_interval"]
        visible = [item for item in returns if not item.get("suppressed")]
        best = max(visible, key=lambda item: item.get("return_count", 0), default=None)
        peak_interval = f"最多的回程間隔組是「{best['label']}」（{best['return_count']:,} 對）" if best else "回程間隔資料目前無可公開的群體區間"
        answer = f"{year} 年票證聚合中，{peak_interval}。配對條件為同卡、同日、反向 OD、間隔不超過 12 小時；這只是群體回程代理，不代表確認同一段旅程或辨識個人。小樣本區間已抑制。"
        status = "sourced"
        actions = ["在需求分析查看回程間隔圖", "查看資料品質與隱私門檻"]
    elif re.search(r"尖峰|離峰|需求|運量|交易量|哪個時段|最高", text) and not re.search(r"增加|提高|上升|最佳化|配置|情境", text):
        data, sources = _execute_tool("get_demand_summary", {"year": year, "route": route}, aggregates, timetable)
        answer = f"{data['year']} 年 {data['route']} 的票證交易最高時段是 {data['peak_hour']:02d}:00–{data['peak_hour'] + 1:02d}:00，共 {data['peak_transactions']:,} 筆交易。這是歷史票證彙總，交易數不等於完整乘客數，也不能代表目前候車量。"
        status = "sourced"
        actions = ["在需求分析查看24小時曲線", "切換年度或子線"]
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
        answer = "我可以查歷史尖離峰票證彙總、班次與成本情境，或說明目前營運資料來源限制。你可以點選下方範例問題。"
        sources = []
        status = "demo"
        actions = ["哪個時段票證交易最多？", "同日回程交易間隔怎麼解讀？", "尖峰需求提高 15% 會怎樣？"]
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
