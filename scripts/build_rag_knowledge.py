#!/usr/bin/env python3
"""
build_rag_knowledge.py
編譯台灣好行 6670 日月潭智慧行控中心【靜態領域知識庫 (Tier 1 Static Knowledge Base)】。
輸出:
  - data/rag/static_kb.json (結構化 JSON 知識庫)
  - data/rag/static_kb.md   (高密度 LLM 易讀 Markdown)
"""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAG_DIR = ROOT / "data" / "rag"
RAG_DIR.mkdir(parents=True, exist_ok=True)

STATIC_KB = {
    "system_profile": {
        "system_name": "台灣好行 6670 日月潭走廊智慧行控中心 (OCC Digital Twin & AI Copilot)",
        "operator": "南投客運 (Nantou Bus)",
        "route_id": "6670",
        "route_name_zh": "台灣好行日月潭線",
        "route_name_en": "Taiwan Trip Sun Moon Lake Route 6670",
        "operating_hours": "07:00 - 20:30 (平日/假日微調)",
        "fleet_size_baseline": 18,
        "key_terminals": [
            {"id": "tc_station", "name_zh": "干城站 / 台中車站", "role": "市區起點端"},
            {"id": "hsr_taichung", "name_zh": "高鐵台中站 (第5月台)", "role": "高鐵聯運中樞 / 最大去程客流源"},
            {"id": "puli_transfer", "name_zh": "埔里轉運站", "role": "走廊唯一中繼調節站 / 班距 Holding 核心點"},
            {"id": "ncnu", "name_zh": "國立暨南國際大學", "role": "學生通學與學術交流重點站"},
            {"id": "shuishe", "name_zh": "日月潭水社遊客中心", "role": "全線端點終點站 / 最大返程客流源 / 環湖轉運總站"},
            {"id": "xiangshan", "name_zh": "向山遊客中心", "role": "觀光延伸線終點 (6670F 延駛)"}
        ]
    },
    "subroutes": [
        {"code": "6670", "name": "日月潭主線", "type": "主線", "via": "台中-高鐵-草屯-埔里-日月潭", "desc": "全站停靠標準線"},
        {"code": "6670A", "name": "日月潭A (經九族)", "type": "觀光支線", "via": "經九族文化村", "desc": "主題樂園熱門觀光專車"},
        {"code": "6670B", "name": "日月潭B (經埔里)", "type": "主走廊", "via": "台中-高鐵-國道6號-埔里-水社", "desc": "常態主力班次"},
        {"code": "6670C", "name": "日月潭C (中台禪寺)", "type": "宗教專線", "via": "台中-埔里-中台禪寺", "desc": "特定時段行駛"},
        {"code": "6670D", "name": "日月潭D (國道快線)", "type": "直達快線", "via": "直達日月潭水社，不入埔里市區", "desc": "速度最快之直達觀光車"},
        {"code": "6670E", "name": "日月潭E (機場接駁)", "type": "國門快線", "via": "台中國際機場-高鐵台中站-日月潭", "desc": "外籍國際旅客直達綠色走廊"},
        {"code": "6670F", "name": "日月潭F (向山延伸)", "type": "風景延伸線", "via": "水社-向山行政暨遊客中心", "desc": "服務自行車道與熱門建築打卡點"},
        {"code": "6670G", "name": "日月潭G (埔里區間)", "type": "區間通勤線", "via": "台中-高鐵-埔里轉運站", "desc": "服務台中埔里高密度通勤通學"},
        {"code": "6670H", "name": "日月潭H (免經草屯)", "type": "高架快線", "via": "中投快速公路-國道3號-國道6號-日月潭", "desc": "尖峰避開草屯平面市區號誌"}
    ],
    "dispatch_sops": {
        "anti_bunching": {
            "title": "串車防制與車頭時距調節標準作業程序 (Anti-Bunching SOP)",
            "trigger_condition": "同方向相鄰兩輛班車間距 < 3.5 km 或 時距 < 6 分鐘 (正常巡航時距應為 15~20 分鐘)",
            "hri_standard": {
                "metric": "班距變異係數 (Headway Regularity Index, HRI = σ / μ)",
                "ratings": [
                    {"range": "< 0.30", "status": "優良 (綠燈)", "desc": "班距均勻，運行穩定"},
                    {"range": "0.30 - 0.45", "status": "警戒 (黃燈)", "desc": "班距波動，需監控前後車時速"},
                    {"range": "> 0.45", "status": "嚴重失調 (紅燈)", "desc": "已發生串車或前車大脫班，必須立即介入調度"}
                ]
            },
            "actions": [
                {
                    "step": 1,
                    "action_name": "中繼站停留調節 (Holding Strategy at Puli)",
                    "detail": "令後行車在『埔里轉運站』延長靠站停等 3 ~ 5 分鐘，自然拉開與前行車之距離。"
                },
                {
                    "step": 2,
                    "action_name": "前車跳站巡航 (Express Cruise / Station Skipping)",
                    "detail": "若前車載客率已超過 80%，授權前車於沿途非主要招呼站『只下不上』，縮短停靠延滯，快速脫離後車壓力區。"
                },
                {
                    "step": 3,
                    "action_name": "國道速差巡航控管 (Highway Speed Regulation)",
                    "detail": "在國道6號路段，指令後行車保持速限 70~80 km/h 巡航，禁止超車或逼近前車，確保維持至少 5 km 縱深。"
                },
                {
                    "step": 4,
                    "action_name": "起訖點機動班距微調",
                    "detail": "高鐵台中站端或日月潭水社端若發現前班車出站延誤，發車調度員得彈性推遲後車發車時距 3~5 分鐘。"
                }
            ]
        },
        "weather_and_safety": {
            "title": "惡劣天候與突發事件應變指引",
            "scenarios": [
                {
                    "condition": "台21線山區濃霧 / 豪大雨特報",
                    "action": "全線通報車載降速至 40 km/h 以下，開啟大燈與黃色霧燈，保持 2 倍煞車安全車距。"
                },
                {
                    "condition": "國道6號發生重大車禍或連假嚴重紫爆壅塞",
                    "action": "行控中心通報全線啟動替代路徑，下東草屯改走舊台14線（中潭公路），推播高鐵與水社端旅客預告延遲 25~35 分鐘。"
                },
                {
                    "condition": "連假收假水社遊客中心月台人潮滯留超過 45 人",
                    "action": "啟動『機動加班車機制 (Reinforcement Fleet)』，調派埔里預備車輛空車馳援水社站載客直發高鐵。"
                }
            ]
        }
    },
    "historical_insights": {
        "source": "2024~2025 台灣好行 6670 電子票證刷卡大數據 (180 萬筆交易紀錄分析)",
        "peak_hours": [
            {"time_window": "08:30 - 11:00", "direction": "去程 (台中往日月潭)", "characteristic": "觀光去程高峰，高鐵站排隊人潮最高，常態客滿"},
            {"time_window": "15:30 - 18:30", "direction": "返程 (日月潭往台中)", "characteristic": "遊客集中返程高峰，水社站候車壓力最大，需防串車與滯留"}
        ],
        "top_od_pairs": [
            {"origin": "埔里站", "destination": "高鐵台中站", "share": "~36%", "type": "通勤 / 通學 / 轉乘高鐵主力"},
            {"origin": "高鐵台中站", "destination": "日月潭水社", "share": "~28%", "type": "純外地觀光客主力"},
            {"origin": "高鐵台中站", "destination": "埔里站", "share": "~25%", "type": "返鄉與商務"}
        ],
        "passenger_types": "本國旅客以 TPASS 行政院通勤月票、悠遊卡、一卡通為主；外籍旅客以台灣好行一日/二日券電子套票與 QR 碼乘車碼為主 (佔比達 32%)。"
    },
    "tourism_knowledge": {
        "shuishe_hub": "水社是全區交通心臟，出站直達水社碼頭搭乘電動遊艇，並可租借自行車進入全球十大最美自行車道。",
        "transfer_6669": "在水社遊客中心或向山可無縫轉乘 6669 日月潭遊湖巴士，前往玄光寺、伊達邵老街與纜車站。",
        "tickets": "台灣好行發售日月潭水陸空套票 (含 6670 來回車票、遊艇券、日月潭纜車站優惠券)。"
    },
    "esg_carbon_model": {
        "standard": "依據交通部運輸研究所與環境部大眾運輸碳排標準",
        "factor_kg_co2_per_km": 0.188,
        "explanation": "大眾客運每延人公里替代自小客車行駛，平均可減排 0.188 kg CO₂e。",
        "tree_annual_absorption_kg": 12.0,
        "daily_baseline_reduction": "在線 18 輛車滿載營運約替代 18,200 km 自小客車行駛，單日減碳量約達 3,420 kg CO₂，相當於 285 棵樹一年吸碳量。"
    }
}

# 產出靜態 Markdown 知識庫
STATIC_KB_MD = f"""# 台灣好行 6670 日月潭智慧行控中心 · 領域專家知識庫 (Tier 1 Static KB)

## 1. 系統營運輪廓
- **主線名稱**：台灣好行 6670 日月潭線 (Taiwan Trip Sun Moon Lake Route 6670)
- **營運業者**：南投客運 (Nantou Bus)
- **常態出勤車輛**：18 輛
- **營運時間**：每日 07:00 ~ 20:30
- **核心樞紐站**：
  1. **干城站 / 台中火車站** (市區出發端)
  2. **高鐵台中站 (第5月台)** (外地旅客與高鐵聯運中樞，去程最大客流源)
  3. **埔里轉運站** (全線唯一中繼調節站、班距 Holding 核心點)
  4. **國立暨南國際大學** (學生通勤要站)
  5. **日月潭水社遊客中心** (全線終點站、返程最大客流源、環湖轉運總站)
  6. **向山遊客中心** (6670F 觀光延伸線終點)

## 2. 6670 各子線特色
- **6670 (主線)**：台中-高鐵-草屯-埔里-日月潭 (全站停靠標準線)
- **6670A**：經九族文化村 (主題樂園熱門觀光專車)
- **6670B**：台中-高鐵-國道6號-埔里-水社 (常態營運主力班次)
- **6670C**：台中-埔里-中台禪寺 (宗教文化專線)
- **6670D (國道快線)**：高鐵直達日月潭水社，**不入埔里市區**，速度最快 (觀光客首選)
- **6670E (機場快線)**：台中國際機場-高鐵-日月潭，服務外籍入境觀光客
- **6670F (向山延伸)**：水社延駛向山遊客中心，服務自行車道與清水模建築打卡人潮
- **6670G (埔里區間)**：台中-高鐵-埔里轉運站，專營高密度通勤通學
- **6670H (高架快線)**：經中投快速公路與國道6號直達日月潭，避開草屯平面市區號誌

## 3. 行控調度標準作業程序 (Dispatch SOP)
### 3.1 串車防制與車頭時距調節 (Anti-Bunching SOP)
- **觸發標準**：同方向相鄰兩輛班車間距 < 3.5 km 或 時距 < 6 分鐘 (正常巡航時距應為 15~20 分鐘)。
- **班距變異係數 (HRI = σ / μ)**：
  - `< 0.30`：🟢 優良 (班距均勻，無串車)
  - `0.30 ~ 0.45`：🟡 警戒 (班距開始波動，需注意前後車速)
  - `> 0.45`：🔴 嚴重失調 (已發生串車或前車脫班，需立即發布調度指令)
- **調度介入四步驟**：
  1. **中繼站滯留調節 (Holding at Puli)**：令後行車在『埔里轉運站』延長靠站停等 3~5 分鐘，以拉開與前車時距。
  2. **前車跳站巡航 (Express Cruise)**：若前車載客率 > 80%，指令前車於沿途非主要招呼站『只下不上』快速前行。
  3. **國道速差巡航控管**：國道6號路段令後行車維持 70~80 km/h 巡航，禁止逼近前車，確保縱深 > 5 km。
  4. **起點端發車時距微調**：高鐵站或水社站端因應前方路況彈性推遲後車發車 3~5 分鐘。

### 3.2 惡劣天候與突發事件應變指引
- **台21線濃霧 / 豪大雨**：全線車載廣播限速 40 km/h 以下，開啟大燈與霧燈。
- **國道6號事故 / 壅塞**：行控中心指示改走舊台14線 (中潭公路)，推播旅客預估延遲 25~35 分鐘。
- **水社月台候車超過 45 人**：啟動『機動加班車機制』，調派埔里預備車空車馳援水社端。

## 4. 歷史票證大數據洞察 (180 萬筆紀錄)
- **去程晨峰 (08:30 - 11:00)**：台中高鐵站往日月潭觀光客流暴增，常態客滿。
- **返程夕峰 (15:30 - 18:30)**：日月潭水社往高鐵站返程洪峰，排隊最長，需嚴防串車。
- **核心 OD**：
  - 埔里 ↔ 高鐵台中站 (~36%，通學通勤最高)
  - 日月潭水社 ↔ 高鐵台中站 (~28%，觀光客主力)

## 5. 即時 ESG 減碳計算標準
- 依交通部運研所與環境部標準，大眾客運每延人公里替代小客車排碳約 **0.188 kg CO₂e**。
- 日均 18 輛在線車輛替代約 18,200 km 自小客車行駛，**每日減碳約 3,420 kg CO₂**，相當於 **285 棵樹** 一年生長吸收量。
"""

def main():
    json_path = RAG_DIR / "static_kb.json"
    md_path = RAG_DIR / "static_kb.md"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(STATIC_KB, f, ensure_ascii=False, indent=2)
    print(f"✓ 成功寫入 {json_path}")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(STATIC_KB_MD.strip() + "\n")
    print(f"✓ 成功寫入 {md_path}")

if __name__ == "__main__":
    main()
