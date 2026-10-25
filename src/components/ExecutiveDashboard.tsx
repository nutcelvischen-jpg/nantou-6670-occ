import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Download, Gauge } from "lucide-react";
import { Chart } from "./Chart";
import "./executive-dashboard.css";
import dashboardJson from "../data/executive-dashboard.json";

type YearStat = {
  rows: number;
  observed_days: number;
  unique_cards: number;
  repeat_card_rate: number;
  one_time_card_rate: number;
  fare: { actual: number; discount: number; original: number; avg_actual: number; subsidy_share: number };
  duration_minutes: { median: number; mean: number; p90: number };
  monthly: number[];
  hourly: number[];
  weekday_daily_mean: number[];
  weekend_workday_ratio: number;
  top_od_share: number;
  top_od: { origin: string; destination: string; transactions: number }[];
  top_stations: { name: string; touches: number }[];
  routes: { route: string; transactions: number }[];
  ticket_types: { type: string; transactions: number }[];
  top_days: { date: string; transactions: number }[];
};
type Dashboard = { generated_at: string; sources: string[]; years: number[]; by_year: Record<string, YearStat> };
const dashboard = dashboardJson as Dashboard;
const nf = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const wan = (n: number) => (n >= 100000000 ? `${(n / 100000000).toFixed(2)} 億` : `${(n / 10000).toFixed(0)} 萬`);
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const deltaPct = (now: number, base: number) => (base === 0 ? "—" : `${now - base >= 0 ? "+" : ""}${(((now - base) / base) * 100).toFixed(1)}%`);
const COLORS = ["#849caf", "#39765d"];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const WEEKDAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];

function lineOption(labels: string[], series: { name: string; data: (number | null)[]; color: string; dashed?: boolean }[], unit: string): EChartsOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: "system-ui", fontSize: 13 },
    tooltip: { trigger: "axis", valueFormatter: (v) => (typeof v === "number" ? `${v.toLocaleString("zh-TW")} ${unit}` : "無紀錄") },
    legend: { top: 0, textStyle: { fontSize: 14 } },
    grid: { top: 42, left: 60, right: 22, bottom: 34 },
    xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: "#dbe4df" } }, axisLabel: { fontSize: 12 } },
    yAxis: { type: "value", min: 0, name: unit, axisLabel: { formatter: (v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v)) }, splitLine: { lineStyle: { color: "#edf0eb" } } },
    series: series.map((s) => ({ name: s.name, type: "line" as const, data: s.data, symbol: "circle", symbolSize: 6, lineStyle: { width: 3, type: s.dashed ? ("dashed" as const) : ("solid" as const) }, itemStyle: { color: s.color } })),
  };
}
function barOption(labels: string[], series: { name: string; data: number[]; color: string }[], unit: string, horizontal = false): EChartsOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: "system-ui", fontSize: 13 },
    tooltip: { trigger: "axis", valueFormatter: (v) => (typeof v === "number" ? `${v.toLocaleString("zh-TW")} ${unit}` : "無紀錄") },
    legend: { top: 0, textStyle: { fontSize: 14 } },
    grid: horizontal ? { top: 36, left: 130, right: 60, bottom: 24 } : { top: 42, left: 60, right: 22, bottom: 34 },
    xAxis: horizontal
      ? { type: "value", axisLabel: { formatter: (v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v)) }, splitLine: { lineStyle: { color: "#edf0eb" } } }
      : { type: "category", data: labels, axisLine: { lineStyle: { color: "#dbe4df" } }, axisLabel: { fontSize: 12 } },
    yAxis: horizontal
      ? { type: "category", inverse: true, data: labels, axisLabel: { fontSize: 12 } }
      : { type: "value", min: 0, name: unit, axisLabel: { formatter: (v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v)) }, splitLine: { lineStyle: { color: "#edf0eb" } } },
    series: series.map((s) => ({ name: s.name, type: "bar" as const, data: s.data, barMaxWidth: 20, itemStyle: { color: s.color, borderRadius: horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0] } })),
  };
}

export function ExecutiveDashboard() {
  const years = dashboard.years;
  const [focusYear, setFocusYear] = useState(years.at(-1)!);
  const [baseYear, setBaseYear] = useState(years[0]);
  const [odMetric, setOdMetric] = useState<"total" | "share">("total");
  const focus = dashboard.by_year[String(focusYear)];
  const base = dashboard.by_year[String(baseYear)];
  const pair = useMemo(() => [baseYear, focusYear], [baseYear, focusYear]);
  const odLabels = focus.top_od.map((o) => `${o.origin} → ${o.destination}`);
  const odShare = (stat: YearStat, od: { origin: string; destination: string }) => {
    const hit = stat.top_od.find((o) => o.origin === od.origin && o.destination === od.destination);
    return hit ? Number(((hit.transactions / stat.rows) * 100).toFixed(2)) : 0;
  };
  const monthly = lineOption(MONTHS, [
    { name: String(baseYear), data: base.monthly, color: COLORS[0], dashed: true },
    { name: String(focusYear), data: focus.monthly, color: COLORS[1] },
  ], "筆");
  const od = barOption(
    odLabels,
    [
      { name: String(baseYear), data: focus.top_od.map((o) => (odMetric === "total" ? (base.top_od.find((b) => b.origin === o.origin && b.destination === o.destination)?.transactions ?? 0) : odShare(base, o))), color: COLORS[0] },
      { name: String(focusYear), data: focus.top_od.map((o) => (odMetric === "total" ? o.transactions : odShare(focus, o))), color: COLORS[1] },
    ],
    odMetric === "total" ? "筆" : "%",
    true,
  );
  const hourly = barOption(
    Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")),
    [
      { name: String(baseYear), data: base.hourly, color: COLORS[0] },
      { name: String(focusYear), data: focus.hourly, color: COLORS[1] },
    ],
    "筆",
  );
  const weekday = barOption(WEEKDAYS, [
    { name: String(baseYear), data: base.weekday_daily_mean, color: COLORS[0] },
    { name: String(focusYear), data: focus.weekday_daily_mean, color: COLORS[1] },
  ], "筆／日");
  const routes = barOption(
    focus.routes.map((r) => r.route),
    [{ name: String(focusYear), data: focus.routes.map((r) => r.transactions), color: "#39765d" }],
    "筆",
    true,
  );
  const lowRoutes = focus.routes.filter((r) => r.transactions < 20000);
  const troughWeekdays = [1, 2, 3].map((i) => focus.weekday_daily_mean[i]);
  const peakFriday = focus.weekday_daily_mean[4];
  const oneTimeCards = Math.round(focus.unique_cards * focus.one_time_card_rate);
  const kpis = [
    { label: "年度刷卡交易", value: nf.format(focus.rows), foot: `${baseYear} ${nf.format(base.rows)} 筆`, trend: deltaPct(focus.rows, base.rows) },
    { label: "實扣票款收入", value: wan(focus.fare.actual), foot: `優惠補貼 ${wan(focus.fare.discount)}`, trend: deltaPct(focus.fare.actual, base.fare.actual) },
    { label: "平均每筆實扣", value: `${focus.fare.avg_actual.toFixed(1)} 元`, foot: `補貼占原價 ${pct(focus.fare.subsidy_share)}`, trend: deltaPct(focus.fare.avg_actual, base.fare.avg_actual) },
    { label: "重複用卡率", value: pct(focus.repeat_card_rate), foot: `一次性卡片約 ${nf.format(oneTimeCards)} 張`, trend: deltaPct(focus.repeat_card_rate, base.repeat_card_rate) },
    { label: "乘車時間中位數", value: `${focus.duration_minutes.median.toFixed(0)} 分`, foot: `p90 ${focus.duration_minutes.p90.toFixed(0)} 分`, trend: deltaPct(focus.duration_minutes.median, base.duration_minutes.median) },
    { label: "假日／平日日均比", value: `${focus.weekend_workday_ratio.toFixed(2)}×`, foot: `Top2 OD 占全年 ${pct(focus.top_od_share)}`, trend: deltaPct(focus.weekend_workday_ratio, base.weekend_workday_ratio) },
  ];
  const decisions = [
    {
      tag: "短期速勝 · 推薦",
      title: "B．尖峰與連假彈性班表",
      why: `週五日均 ${nf.format(peakFriday)} 筆為週二～四低谷（${troughWeekdays.map((x) => nf.format(x)).join("／")}）的 1.5 倍以上；單日最高 ${focus.top_days[0].date} 達 ${nf.format(focus.top_days[0].transactions)} 筆。`,
      gain: "把固定班次改為週五／連假加開、週二～四減班，不增車隊即可吸收爆量並降低空駛。",
      risk: "需駕駛勤務彈性與乘客預告；減班時段投訴風險。",
    },
    {
      tag: "中期結構",
      title: "A．低量分支 feeder 化",
      why: `${focusYear} 年 ${lowRoutes.map((r) => `${r.route}（${nf.format(r.transactions)} 筆）`).join("、")} 等分支運量偏低，而埔里—高鐵走廊占 Top2 OD ${pct(focus.top_od_share)}。`,
      gain: "分支改短程接駁或預約制，車時回流主走廊，提升每車公里收入。",
      risk: "既有乘客轉乘次數增加，需配套轉乘優惠與時刻銜接。",
    },
    {
      tag: "需求側",
      title: "C．高鐵聯票與回程誘因",
      why: `一次性卡片占 ${pct(focus.one_time_card_rate)}（約 ${nf.format(oneTimeCards)} 張），觀光客去回分開購票、無回訪誘因。`,
      gain: "高鐵＋6670 來回聯票提高回載率與票款，降低補貼依賴（現占原價 ${pct(focus.fare.subsidy_share)}）。",
      risk: "需與高鐵及票證公司分潤談判，上架時程不可控。",
    },
  ];
  const kpiTargets = [
    { name: "尖峰四小時載客筆數占比", now: pct(focus.hourly.slice(8, 11).reduce((s, x) => s + x, 0) / focus.rows + focus.hourly.slice(15, 17).reduce((s, x) => s + x, 0) / focus.rows), target: "維持並提升尖峰供給滿足率", owner: "運務課" },
    { name: "週二～四日均交易", now: `${nf.format(troughWeekdays.reduce((s, x) => s + x, 0) / 3)} 筆／日`, target: "90 天內 +5%（離峰行銷／離峰票價）", owner: "行銷課" },
    { name: "一次性卡片占比", now: pct(focus.one_time_card_rate), target: "聯票上線後 −3 個百分點", owner: "票務課" },
    { name: "低量分支每筆乘載成本", now: `${lowRoutes.map((r) => r.route).join("、")}`, target: "feeder 化試辦 1 條分支", owner: "規劃課" },
  ];
  const exportCsv = () => {
    const rows: (string | number)[][] = [["metric", baseYear, focusYear, "delta_pct"]];
    rows.push(["transactions", base.rows, focus.rows, deltaPct(focus.rows, base.rows)]);
    rows.push(["fare_actual", base.fare.actual, focus.fare.actual, deltaPct(focus.fare.actual, base.fare.actual)]);
    rows.push(["fare_discount", base.fare.discount, focus.fare.discount, deltaPct(focus.fare.discount, base.fare.discount)]);
    rows.push(["unique_cards", base.unique_cards, focus.unique_cards, deltaPct(focus.unique_cards, base.unique_cards)]);
    rows.push(["repeat_card_rate", base.repeat_card_rate, focus.repeat_card_rate, deltaPct(focus.repeat_card_rate, base.repeat_card_rate)]);
    rows.push(["duration_median_min", base.duration_minutes.median, focus.duration_minutes.median, deltaPct(focus.duration_minutes.median, base.duration_minutes.median)]);
    for (const o of focus.top_od) rows.push([`od_${o.origin}_${o.destination}`, base.top_od.find((b) => b.origin === o.origin && b.destination === o.destination)?.transactions ?? 0, o.transactions, ""]);
    const blob = new Blob(["﻿" + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `6670_決策儀表板_${baseYear}_${focusYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="exec-dashboard">
      <header className="exec-heading">
        <div>
          <div className="exec-eyebrow"><Gauge size={15} /> EXECUTIVE DECISION BOARD</div>
          <h1>決策儀表板</h1>
          <p>給經理人的一頁決策視圖：走廊結構、產能錯位、痛點量化與方案選項。</p>
        </div>
        <button className="exec-export" onClick={exportCsv}><Download size={16} /> 匯出決策摘要 CSV</button>
      </header>
      <nav className="exec-nav" aria-label="決策儀表板章節">
        {[["exec-kpi", "關鍵數字"], ["exec-corridor", "走廊結構"], ["exec-capacity", "產能錯位"], ["exec-pain", "痛點量化"], ["exec-options", "決策選項"], ["exec-kpi-plan", "執行 KPI"]].map(([id, label]) => (
          <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</button>
        ))}
      </nav>
      <div className="exec-toolbar" id="exec-kpi">
        <label>基準年<select aria-label="基準年" value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label>焦點年<select aria-label="焦點年" value={focusYear} onChange={(e) => setFocusYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <span>6670 全子線 · 電子票證刷卡 · 產製 {dashboard.generated_at.slice(0, 10)}</span>
      </div>
      <div className="exec-kpis">
        {kpis.map((k) => (
          <article key={k.label}>
            <span>{k.label}</span>
            <strong>{k.value}</strong>
            <div><b className={k.trend.startsWith("+") ? "up" : "down"}>{k.trend}</b><small>vs {baseYear}</small></div>
            <p>{k.foot}</p>
          </article>
        ))}
      </div>
      <div className="exec-grid" id="exec-corridor">
        <article className="exec-panel exec-wide">
          <div className="exec-panel-head"><div><h2>月度交易趨勢</h2><p>焦點年 vs 基準年；3 月與 10 月為季節高點，7 月為低谷。</p></div></div>
          <Chart option={monthly} className="exec-chart" />
        </article>
        <article className="exec-panel exec-wide">
          <div className="exec-panel-head">
            <div><h2>這條路靠什麼賺錢：Top OD 走廊</h2><p>埔里—高鐵臺中站為最大走廊；切换占比檢視集中度。</p></div>
            <select aria-label="OD 指標" value={odMetric} onChange={(e) => setOdMetric(e.target.value as "total" | "share")}>
              <option value="total">交易筆數</option>
              <option value="share">占全年 %</option>
            </select>
          </div>
          <Chart option={od} className="exec-chart exec-chart-tall" />
        </article>
        <article className="exec-panel">
          <div className="exec-panel-head"><div><h2>子線運量結構</h2><p>{focusYear} 年各子線刷卡筆數</p></div></div>
          <Chart option={routes} className="exec-chart exec-chart-tall" />
          <p className="exec-note">{lowRoutes.map((r) => r.route).join("、")} 年運量低於 2 萬筆，為 feeder 化候选。</p>
        </article>
        <article className="exec-panel exec-wide" id="exec-capacity">
          <div className="exec-panel-head"><div><h2>產能錯位：24 小時需求</h2><p>09–10 與 15–16 時為雙尖峰；離峰供給是否跟隨？</p></div></div>
          <Chart option={hourly} className="exec-chart" />
        </article>
        <article className="exec-panel">
          <div className="exec-panel-head"><div><h2>星期別日均</h2><p>週五與週末為需求主力</p></div></div>
          <Chart option={weekday} className="exec-chart" />
          <p className="exec-note">假日日均為平日 {focus.weekend_workday_ratio} 倍；單日最高 {focus.top_days[0].date}（{nf.format(focus.top_days[0].transactions)} 筆）。</p>
        </article>
        <article className="exec-panel exec-wide" id="exec-pain">
          <div className="exec-panel-head"><div><h2>痛點量化</h2><p>每個痛點對應一個可追蹤的數字</p></div></div>
          <div className="exec-pain-grid">
            <div><b>留客力不足</b><span>一次性卡片 {pct(focus.one_time_card_rate)}（約 {nf.format(oneTimeCards)} 張）只用一次即流失。</span></div>
            <div><b>尖離峰失衡</b><span>週五日均 {nf.format(peakFriday)} 筆 vs 週二～四平均 {nf.format(troughWeekdays.reduce((s, x) => s + x, 0) / 3)} 筆，車輛產能錯置。</span></div>
            <div><b>分支空轉</b><span>{lowRoutes.map((r) => `${r.route} ${nf.format(r.transactions)} 筆`).join("、")}，占全年不足 {pct(lowRoutes.reduce((s, r) => s + r.transactions, 0) / focus.rows)}。</span></div>
            <div><b>補貼依賴</b><span>平均每筆實扣 {focus.fare.avg_actual} 元，優惠占原價 {pct(focus.fare.subsidy_share)}（{wan(focus.fare.discount)}／年）。</span></div>
            <div><b>乘車時間長</b><span>中位 {focus.duration_minutes.median} 分、p90 {focus.duration_minutes.p90} 分，對自駕競爭力弱。</span></div>
            <div><b>走廊集中風險</b><span>Top2 OD 占 {pct(focus.top_od_share)}，單一走廊事件（封路／競對）衝擊過半運量。</span></div>
          </div>
        </article>
        <article className="exec-panel exec-wide" id="exec-options">
          <div className="exec-panel-head"><div><h2>決策選項</h2><p>三案可並行；B 案為不增資 quickest win</p></div></div>
          <div className="exec-options">
            {decisions.map((d) => (
              <article key={d.title} className={d.tag.includes("推薦") ? "recommended" : ""}>
                <small>{d.tag}</small>
                <b>{d.title}</b>
                <p className="exec-why">{d.why}</p>
                <p><i>效益</i>{d.gain}</p>
                <p><i>風險</i>{d.risk}</p>
              </article>
            ))}
          </div>
        </article>
        <article className="exec-panel exec-wide" id="exec-kpi-plan">
          <div className="exec-panel-head"><div><h2>90 天執行 KPI</h2><p>試辦範圍與成功門檻，覆盤時點：試辦後第 90 日</p></div></div>
          <table className="exec-table">
            <thead><tr><th>指標</th><th>現值（{focusYear}）</th><th>90 天目標</th><th>主責</th></tr></thead>
            <tbody>
              {kpiTargets.map((k) => (
                <tr key={k.name}><td>{k.name}</td><td>{k.now}</td><td>{k.target}</td><td>{k.owner}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="exec-note">口徑：電子票證刷卡交易，不含現金與未刷卡乘客；{pair.join(" 與 ")} 年來源為 {dashboard.sources.join("、")}。交易筆數不等於獨立旅客數。</p>
        </article>
      </div>
    </section>
  );
}
