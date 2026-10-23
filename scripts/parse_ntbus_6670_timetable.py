"""Parse the saved public NT Bus 6670 timetable into a provenance-rich fixture."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "ntbus_site" / "html" / "hsr6.html"
OUTPUT = ROOT / "src" / "data" / "ntbus-6670-timetable.json"
SOURCE_URL = "http://www.ntbus.com.tw/hsr6.html"
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")


def expand_cells(row: Any) -> list[Any]:
    expanded: list[Any] = []
    for cell in row.find_all(["td", "th"], recursive=False):
        span = max(1, int(cell.get("colspan", 1)))
        expanded.extend([cell] * span)
    return expanded


def _service_class(cells: list[Any]) -> tuple[str, str | None]:
    colors = {str(c.get("bgcolor", "")).upper() for c in cells}
    text = " ".join(c.get_text(" ", strip=True) for c in cells)
    if "週五~日" in text or "週五～日" in text or "#FFCCCC" in colors:
        return "fri_sun", "週五至週日班次標記"
    if "週一~四" in text or "週一～四" in text or "#E8E8E8" in colors:
        return "mon_thu", "週一至週四班次標記"
    if "#CCCCCC" in colors:
        return "unspecified", "原表灰底未在班表圖例中明確定義"
    return "daily_unmarked", "原表未標示週別；需依營運日曆再次核對"


def _parse_side(cells: list[Any], stops: list[str], direction: str, row_no: int) -> dict[str, Any] | None:
    if len(cells) != 10:
        return None
    code = cells[1].get_text(" ", strip=True)
    if not code or code in {"路線編號", "→"}:
        return None
    values = [c.get_text(" ", strip=True) for c in cells[2:10]]
    timed = [(i, value) for i, value in enumerate(values) if TIME_RE.fullmatch(value)]
    if len(timed) < 2:
        return None
    service_class, service_note = _service_class(cells[1:])
    parsed_stops = []
    for ordinal, (index, value) in enumerate(timed):
        parsed_stops.append({
            "name": stops[index],
            "time": f"{int(value.split(':')[0]):02d}:{value.split(':')[1]}",
            "time_role": "scheduled_departure" if ordinal == 0 else "estimated_intermediate_arrival" if ordinal < len(timed) - 1 else "estimated_terminal_arrival",
        })
    return {
        "trip_id": f"6670-{direction}-{row_no:02d}-{code}",
        "route_code": "6670" if code == "加" else f"6670{code}",
        "route_code_raw": code,
        "direction": direction,
        "service_class": service_class,
        "service_note": service_note,
        "stops": parsed_stops,
    }


def parse_timetable(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    candidates = soup.find_all("table")
    timetable = None
    timetable_rows = None
    for table in candidates:
        rows = table.find_all("tr")
        table_text = " ".join(table.stripped_strings)
        if len(rows) >= 20 and "路線編號" in table_text and "台中" in table_text and "日月潭" in table_text:
            # The main full-size timetable has two simultaneous directions.
            expanded = [expand_cells(row) for row in rows]
            if len(expanded) >= 40 and len(expanded[1]) == 16 and len(expanded[3]) == 20:
                timetable, timetable_rows = table, expanded
                break
    if timetable is None or timetable_rows is None:
        raise ValueError("Could not locate the two-direction 6670 timetable table")

    header = timetable_rows[1]
    if len(header) < 16:
        raise ValueError("6670 timetable header does not contain both stop sequences")
    station_names = [c.get_text(" ", strip=True) for c in header]
    outbound_stops = station_names[0:8]
    inbound_stops = station_names[8:16]
    if not any("台中" in name for name in outbound_stops) or not any("日月潭" in name for name in inbound_stops):
        raise ValueError("Unexpected 6670 timetable stop header")

    trips = []
    for row_no, row in enumerate(timetable_rows[3:], start=1):
        if len(row) < 20:
            continue
        left = _parse_side(row[:10], outbound_stops, "taichung_to_sun_moon_lake", row_no)
        right = _parse_side(row[-10:], inbound_stops, "sun_moon_lake_to_taichung", row_no)
        if left:
            trips.append(left)
        if right:
            trips.append(right)
    if not trips:
        raise ValueError("No usable 6670 departures found")

    raw = html.encode("utf-8")
    text = soup.get_text(" ", strip=True)
    effective_match = re.search(r"本表\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日起實施", text)
    if not effective_match:
        effective_match = re.search(r"時刻表Timetable\((\d{4})/(\d{1,2})/(\d{1,2})起實施\)", text)
    effective_date = None
    if effective_match:
        effective_date = "{}-{:02d}-{:02d}".format(*map(int, effective_match.groups()))
    return {
        "dataset_id": "ntbus-6670-public-timetable-snapshot",
        "dataset_status": "published_snapshot_unverified_for_today",
        "source_url": SOURCE_URL,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "effective_from": effective_date,
        "snapshot_file": "data/ntbus_site/html/hsr6.html",
        "snapshot_captured_at": "2026-10-23",
        "route_name": "6670 國道六號線（時刻主表；不含另列九人座班次）",
        "vehicle_service_scope": "main timetable only; separate 9-seat timetable excluded",
        "stops_outbound": outbound_stops,
        "stops_inbound": inbound_stops,
        "time_quality": "首站為表列發車時間；中間站與終點為業者公告之預估到站時間；道路壅塞可能造成誤點",
        "fare_status": "not_joined_unverified",
        "service_calendar_status": "weekday_class_from_source_colors; unspecified_rows_require_review",
        "warnings": [
            "此為官網公開頁面快照，非即時班表 API；部署前應重新核對頁面與生效日期。",
            "此解析範圍為一般時刻主表，未納入頁面另外列出的九人座班表及其公告調整。",
            "班表頁標示的中間站時間為預估到站時間，且業者不保證因壅塞造成的準點。",
            "此資料未含經核對的 OD 票價，不能據此計算或宣稱最低票價。",
            "同一方向之空白停靠時間表示該班表未列該站，不推定可停靠。",
        ],
        "trips": trips,
    }


def main() -> None:
    document = parse_timetable(SOURCE.read_text(encoding="utf-8", errors="replace"))
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(document['trips'])} trips; effective_from={document['effective_from']}; sha256={document['source_sha256']}")


if __name__ == "__main__":
    main()
