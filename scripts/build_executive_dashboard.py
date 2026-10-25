import json
from datetime import datetime, timezone

import pandas as pd

RAW = "data/raw"
OUT = "src/data/executive-dashboard.json"


def load_year(year: int) -> pd.DataFrame:
    sheets = pd.read_excel(f"{RAW}/{year}年_6670刷卡資料.xlsx", sheet_name=None)
    frames = []
    for df in sheets.values():
        frames.append(df)
    data = pd.concat(frames, ignore_index=True)
    data["上車時間(上)"] = pd.to_datetime(data["上車時間(上)"], errors="coerce")
    data["下車時間(下)"] = pd.to_datetime(data["下車時間(下)"], errors="coerce")
    for col in ("交易實扣", "原始票價", "優惠票價", "優惠額度"):
        data[col] = pd.to_numeric(data[col], errors="coerce")
    data["路線公路編號"] = data["路線公路編號"].astype(str).str.strip()
    return data


def summarize(year: int, data: pd.DataFrame) -> dict:
    data = data.copy()
    data["月"] = data["上車時間(上)"].dt.month
    data["時"] = data["上車時間(上)"].dt.hour
    data["星期"] = data["上車時間(上)"].dt.day_of_week
    data["日期"] = data["上車時間(上)"].dt.date
    duration = (data["下車時間(下)"] - data["上車時間(上)"]).dt.total_seconds() / 60

    card_counts = data.groupby("卡號").size()
    observed_days = data["日期"].nunique()
    weekday_counts = data.groupby("星期").size()
    weekday_days = data.groupby("星期")["日期"].nunique()
    weekday_mean = (weekday_counts / weekday_days).reindex(range(7)).fillna(0)
    weekend_mean = weekday_mean.loc[[5, 6]].mean()
    workday_mean = weekday_mean.loc[[0, 1, 2, 3, 4]].mean()

    od = (
        data.groupby(["計費站名(上)", "計費站名(下)"])
        .size()
        .reset_index(name="transactions")
        .sort_values("transactions", ascending=False)
    )
    top2_share = float(od.head(2)["transactions"].sum() / len(data))

    return {
        "rows": int(len(data)),
        "observed_days": int(observed_days),
        "unique_cards": int(data["卡號"].nunique()),
        "repeat_card_rate": round(float((card_counts >= 2).mean()), 4),
        "one_time_card_rate": round(float((card_counts == 1).mean()), 4),
        "fare": {
            "actual": int(data["交易實扣"].sum()),
            "discount": int(data["優惠額度"].sum()),
            "original": int(data["原始票價"].sum()),
            "avg_actual": round(float(data["交易實扣"].mean()), 1),
            "subsidy_share": round(float(data["優惠額度"].sum() / data["原始票價"].sum()), 4),
        },
        "duration_minutes": {
            "median": round(float(duration.median()), 1),
            "mean": round(float(duration.mean()), 1),
            "p90": round(float(duration.quantile(0.9)), 1),
        },
        "monthly": [int(x) for x in data.groupby("月").size().reindex(range(1, 13)).fillna(0)],
        "hourly": [int(x) for x in data.groupby("時").size().reindex(range(24)).fillna(0)],
        "weekday_daily_mean": [round(float(x), 1) for x in weekday_mean],
        "weekend_workday_ratio": round(float(weekend_mean / workday_mean), 2),
        "top_od_share": round(top2_share, 4),
        "top_od": [
            {"origin": str(r["計費站名(上)"]), "destination": str(r["計費站名(下)"]), "transactions": int(r["transactions"])}
            for _, r in od.head(10).iterrows()
        ],
        "top_stations": [
            {"name": str(k), "touches": int(v)}
            for k, v in data["計費站名(上)"].value_counts().head(8).items()
        ],
        "routes": [
            {"route": str(k), "transactions": int(v)}
            for k, v in data["路線公路編號"].value_counts().items()
        ],
        "ticket_types": [
            {"type": str(k).strip(), "transactions": int(v)}
            for k, v in data["票種代碼"].value_counts().head(8).items()
        ],
        "top_days": [
            {"date": str(k), "transactions": int(v)}
            for k, v in data.groupby("日期").size().sort_values(ascending=False).head(5).items()
        ],
    }


result = {
    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "sources": ["2024年_6670刷卡資料.xlsx", "2025年_6670刷卡資料.xlsx"],
    "years": [2024, 2025],
    "by_year": {str(year): summarize(year, load_year(year)) for year in (2024, 2025)},
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1, separators=(",", ": "))

print("wrote", OUT)
