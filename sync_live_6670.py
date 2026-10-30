#!/usr/bin/env python3
"""
sync_live_6670.py
南投客運 6670 路線與 6669 即時公車動態擷取器。
從台灣好行/交通部 TDX 介面取得最新真實車輛 GPS 座標與站點預估時間，
並儲存至 data/live_buses.json，供 GitHub Pages 前端無 CORS 阻礙讀取。
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
import requests

TZ_TW = timezone(timedelta(hours=8))
URL_PTX = "https://www.taiwantrip.com.tw/Frontend/Bustime/GetPTX"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
}

def fetch_ptx(route_id: str, ptype: str):
    payload = {
        "Source": "Inter",
        "Type": ptype,
        "City": "Other",
        "RouteId": route_id
    }
    try:
        resp = requests.post(URL_PTX, data=payload, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            print(f"Warning: {route_id} {ptype} HTTP {resp.status_code}")
            return []
        res_json = resp.json()
        inner_data = res_json.get("data", "[]")
        if isinstance(inner_data, str):
            return json.loads(inner_data)
        return inner_data
    except Exception as e:
        print(f"Error fetching {route_id} {ptype}: {e}")
        return []

def main():
    now_tw = datetime.now(TZ_TW)
    now_str = now_tw.strftime("%Y-%m-%d %H:%M:%S")

    print(f"[{now_str}] 開始同步 6670 即時公車資料...")

    # 1. 抓取車輛 GPS 位置
    buses_6670 = fetch_ptx("6670", "Location")
    arrivals_6670 = fetch_ptx("6670", "ES")

    # 判斷營運狀態
    is_operating = len(buses_6670) > 0
    status = "operating" if is_operating else "off_duty"
    message = (
        f"即時營運中：全線共有 {len(buses_6670)} 輛車在線"
        if is_operating
        else "全線已收班（TDX 實時狀態：末班車已過，目前無營運車輛）"
    )

    output = {
        "sync_time": now_tw.isoformat(),
        "sync_time_str": now_str,
        "route_id": "6670",
        "route_name": "台灣好行日月潭線",
        "status": status,
        "is_operating": is_operating,
        "message": message,
        "bus_count": len(buses_6670),
        "buses": buses_6670,
        "arrivals_count": len(arrivals_6670),
        "arrivals": arrivals_6670[:100]  # 前 100 筆站點預估以控制 JSON 體積
    }

    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    out_file = os.path.join(data_dir, "live_buses.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✓ 成功寫入 {out_file}")
    print(f"  狀態: {status} | 車輛數: {len(buses_6670)} | 預估站次: {len(arrivals_6670)}")

    # 2. 自動編譯更新 RAG 結構化知識庫與即時快照 (Tier 2 Live Context)
    try:
        from scripts.update_rag_snapshot import build_snapshot
        build_snapshot()
        print("✓ 成功同步生成 RAG 即時情境知識庫 (data/rag/live_context.json & .md)")
    except Exception as e:
        print(f"Warning: RAG 快照更新異常: {e}")

if __name__ == "__main__":
    main()
