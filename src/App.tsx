import { UserGuide } from "./components/UserGuide";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  Bus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCheck2,
  Filter,
  Leaf,
  Map as MapIcon,
  MoreHorizontal,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Wind,
  MessageCircleMore,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import { Chart } from "./components/Chart";
import { TourismGuide } from "./components/TourismGuide";
import { PublishedTimetableSearch } from "./components/PublishedTimetableSearch";
import { OperationsAssistant } from "./components/OperationsAssistant";
import { TimetableScenarioLab, type ScenarioPanel } from "./components/TimetableScenarioLab";
import { BaselineDetails } from "./components/BaselineDetails";
import { AnnualComparison } from "./components/AnnualComparison";
import { availableYears } from "./annualComparison";
import { ModelMethodology } from "./components/ModelMethodology";
import aggregatesJson from "./data/ticket-aggregates.json";
import timetableJson from "./data/ntbus-6670-timetable.json";
import { loadAggregates, loadRoadDemo, loadTimetable, loadTdxStatus, solveFleetMinimumCost, type AggregateSource, type RoadDemoResponse, type TdxStatus } from "./dataClient";
import {
  aggregateHours,
  buildDailyForecast,
  estimateCarbon,
  findMinimumFareJourney,
  journeyFixture,
  solveMinimumCost,
  tripCandidates,
  type Aggregates,
  type ScheduleSolution,
} from "./domain";

type Page =
  | "使用說明"
  | "營運總覽"
  | "模擬預測"
  | "行車模擬"
  | "旅遊資訊"
  | "成本最佳化"
  | "模型方法"
  | "智慧小幫手"
  | "旅客行程"
  | "低碳評估"
  | "資料品質";
const bundledData = aggregatesJson as Aggregates;
type PublishedTimetable = typeof timetableJson;
const nav: { name: Page; icon: typeof Activity; group: string }[] = [
  { name: "營運總覽", icon: MapIcon, group: "工作台" },
  { name: "模擬預測", icon: Activity, group: "工作台" },
  { name: "行車模擬", icon: Bus, group: "工作台" },
  { name: "成本最佳化", icon: SlidersHorizontal, group: "規劃" },
  { name: "模型方法", icon: FileCheck2, group: "規劃" },
  { name: "智慧小幫手", icon: MessageCircleMore, group: "智慧服務" },
  { name: "旅遊資訊", icon: Sparkles, group: "智慧服務" },
  { name: "旅客行程", icon: Route, group: "智慧服務" },
  { name: "低碳評估", icon: Leaf, group: "永續與資料" },
  { name: "使用說明", icon: FileCheck2, group: "永續與資料" },
  { name: "資料品質", icon: FileCheck2, group: "永續與資料" },
];

const fmt = (n: number) => new Intl.NumberFormat("zh-TW").format(Math.round(n));
const money = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
const parseClock = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 3600 + minutes * 60
    : 0;
};
const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
const chartBase = {
  animationDuration: 350,
  textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: "#72827e" },
  tooltip: {
    trigger: "axis" as const,
    backgroundColor: "#183632",
    borderWidth: 0,
    textStyle: { color: "#fff" },
    extraCssText: "border-radius:10px;box-shadow:0 12px 32px #18363222",
  },
  grid: { left: 38, right: 18, top: 24, bottom: 30 },
  xAxis: {
    type: "category" as const,
    axisLine: { lineStyle: { color: "#e4e9e5" } },
    axisTick: { show: false },
    axisLabel: { color: "#7d8d88", fontSize: 11 },
  },
  yAxis: {
    type: "value" as const,
    splitLine: { lineStyle: { color: "#edf0ed", type: "dashed" as const } },
    axisLabel: { color: "#87948f", fontSize: 11 },
    axisLine: { show: false },
  },
};
export function App() {
  const [data, setData] = useState<Aggregates>(bundledData);
  const [dataSource, setDataSource] = useState<AggregateSource>("bundled");
  const [roadDemo, setRoadDemo] = useState<RoadDemoResponse | null>(null);
  const [tdxStatus, setTdxStatus] = useState<TdxStatus | null>(null);
  const [publishedTimetable, setPublishedTimetable] = useState<PublishedTimetable>(timetableJson);
  const [timetableSource, setTimetableSource] = useState<AggregateSource>("bundled");
  const [timetableDirection, setTimetableDirection] = useState("taichung_to_sun_moon_lake");
  const [timetableService, setTimetableService] = useState("all");
  useEffect(() => {
    let active = true;
    void loadAggregates(bundledData).then((result) => {
      if (!active) return;
      setData(result.data);
      setDataSource(result.source);
    });
    void loadTimetable(timetableJson).then((result) => {
      if (!active) return;
      setPublishedTimetable(result.data);
      setTimetableSource(result.source);
    });
    void loadRoadDemo().then((result) => {
      if (active) setRoadDemo(result);
    });
    void loadTdxStatus().then((result) => {
      if (active) setTdxStatus(result);
    }).catch(() => {
      if (active) setTdxStatus(null);
    });
    return () => { active = false; };
  }, []);
  const [page, setPage] = useState<Page>("營運總覽");
  const [scenarioPanel, setScenarioPanel] = useState<ScenarioPanel>();
  const [panelRequest, setPanelRequest] = useState(0);
  const [year, setYear] = useState(availableYears(bundledData).at(-1)!);
  const [compareYear, setCompareYear] = useState(availableYears(bundledData).at(-2) ?? availableYears(bundledData)[0]);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [twinVisited, setTwinVisited] = useState(false);
  const inSimulation = page === '模擬預測' || page === '行車模擬';
  useEffect(() => { if (inSimulation) setTwinVisited(true); }, [inSimulation]);
  const openScenario = (panel: ScenarioPanel) => {
    setScenarioPanel(panel); setPanelRequest(n => n + 1);
    setPage(panel === 'ops' ? '行車模擬' : '模擬預測');
  };
  const navigate = (target: Page) => {
    if (target === '模擬預測') openScenario('fc');
    else if (target === '行車模擬') openScenario('ops');
    else setPage(target);
  };
  const [route, setRoute] = useState("全部");
  
  const [solution, setSolution] = useState<ScheduleSolution | null>(null);
  const [optimizerRunning, setOptimizerRunning] = useState(false);
  const [demandBoost, setDemandBoost] = useState(1);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [journeyOrigin, setJourneyOrigin] = useState("埔里轉運站");
  const [journeyDestination, setJourneyDestination] = useState("高鐵臺中站");
  const [journeyDeparture, setJourneyDeparture] = useState("08:00");
  const [journeyDeadline, setJourneyDeadline] = useState("09:30");
  const [transferBufferMinutes, setTransferBufferMinutes] = useState(5);
  const [electricFactor, setElectricFactor] = useState(0.467);
  const [dieselScenario, setDieselScenario] = useState("fuel-reference");
  const dieselFactorPerKm =
    dieselScenario === "sort-low"
      ? 1.585
      : dieselScenario === "sort-high"
        ? 2.123
        : undefined;
  const yearData = data.years.find((x) => x.source.startsWith(String(year)))!;
  
  const totalBoth = data.years.reduce((s, x) => s + x.rows, 0);
  const hourData = useMemo(
    () => aggregateHours(data, year, route),
    [year, route],
  );
  
  
  
  const forecast = buildDailyForecast(yearData.daily);
  
  
  const weightedHour = hourData.reduce((s, x) => s + x.count, 0);
  
  const evening = hourData
    .filter((x) => x.hour >= 15 && x.hour < 19)
    .reduce((s, x) => s + x.count, 0);
  const carbon = estimateCarbon(
    1480,
    2.26,
    0.7,
    electricFactor,
    dieselFactorPerKm,
  );
  const journey = findMinimumFareJourney(
    {
      origin: journeyOrigin,
      destination: journeyDestination,
      departAfterSeconds: parseClock(journeyDeparture),
      latestArrivalSeconds: parseClock(journeyDeadline),
      minTransferSeconds: transferBufferMinutes * 60,
      maxTransfers: 2,
    },
    journeyFixture,
  );
  const publishedTrips = useMemo(() => publishedTimetable.trips
    .filter((trip) => trip.direction === timetableDirection)
    .filter((trip) => timetableService === "all" || trip.service_class === timetableService)
    .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time)),
  [publishedTimetable, timetableDirection, timetableService]);
  const publishedDepartureHours = useMemo(() => Array.from({ length: 24 }, (_, hour) => ({
    hour,
    departures: publishedTrips.filter((trip) => Number(trip.stops[0].time.slice(0, 2)) === hour).length,
  })), [publishedTrips]);
  const runOptimizer = async () => {
    if (optimizerRunning) return;
    setOptimizerRunning(true);
    const demand = Math.max(
      45,
      Math.round((evening / Math.max(1, weightedHour)) * 320 * demandBoost),
    );
    try {
      const cpSatResult = await solveFleetMinimumCost(tripCandidates, demand, 0.9);
      const result = cpSatResult ?? solveMinimumCost(demand, 0.9);
      setSolution(result);
      setNotice(
        result.status === "optimal"
          ? result.solver === "OR-Tools CP-SAT"
            ? "OR-Tools CP-SAT 已找到候選集合內的最優方案。"
            : "後端求解器不可用；已用前端全枚舉找到候選集合內最優方案。"
          : result.status === "feasible"
            ? `求解時間內找到可行解，尚未證明最優；目前 gap NT$${result.gap ?? "—"}。`
            : result.status === "infeasible"
              ? "此服務底線下無可行方案。"
              : "求解器未能確認可行解，請縮小候選集合或重試。",
      );
    } finally {
      setOptimizerRunning(false);
    }
  };
  
  
  
  const forecastTestOption: EChartsOption = {
    ...chartBase,
    grid: { left: 46, right: 18, top: 28, bottom: 34 },
    legend: { top: 0, right: 0, textStyle: { color: "#72827e", fontSize: 10 } },
    xAxis: {
      ...chartBase.xAxis,
      data: forecast.backtest.map((x) => x.date.slice(5)),
    },
    yAxis: { ...chartBase.yAxis, name: "票證交易" },
    series: [
      {
        name: "實際",
        type: "line",
        data: forecast.backtest.map((x) => x.actual),
        symbol: "circle",
        symbolSize: 4,
        lineStyle: { color: "#247c67", width: 2 },
        itemStyle: { color: "#247c67" },
      },
      {
        name: "預測基線",
        type: "line",
        data: forecast.backtest.map((x) => x.prediction),
        symbol: "none",
        lineStyle: { color: "#cc9450", type: "dashed", width: 2 },
        itemStyle: { color: "#cc9450" },
      },
    ],
  };
  const nextForecastOption: EChartsOption = {
    ...chartBase,
    xAxis: {
      ...chartBase.xAxis,
      data: forecast.nextSevenDays.map((x) => x.date.slice(5)),
    },
    yAxis: { ...chartBase.yAxis, name: "預測票證交易" },
    series: [
      {
        name: "7 日前瞻基線",
        type: "bar",
        data: forecast.nextSevenDays.map((x) => x.prediction),
        barMaxWidth: 24,
        itemStyle: { color: "#94b89e", borderRadius: [5, 5, 0, 0] },
        label: { show: true, position: "top", color: "#6b8272", fontSize: 9 },
      },
    ],
  };
  
  
  
  const behaviorData = yearData.card_transaction_frequency;
  const returnData = yearData.same_day_return_interval;
  const behaviorOption: EChartsOption = {
    ...chartBase,
    grid: { left: 82, right: 20, top: 14, bottom: 22 },
    xAxis: {
      type: "value",
      name: "卡號群組數（小樣本抑制）",
      axisLine: { show: false },
      axisLabel: {
        fontSize: 9,
        formatter: (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(0)}k` : String(x)),
      },
      splitLine: { lineStyle: { color: "#edf0ed", type: "dashed" } },
    },
    yAxis: {
      type: "category",
      data: behaviorData.map((x) => x.label).reverse(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#566963", fontSize: 10 },
    },
    series: [
      {
        name: "卡號群組數",
        type: "bar",
        data: behaviorData
          .map((x) => x.card_count)
          .reverse(),
        barWidth: 13,
        itemStyle: { color: "#718f86", borderRadius: [0, 5, 5, 0] },
        label: {
          show: true,
          position: "right",
          formatter: (p: unknown) => {
            const item = behaviorData.slice().reverse()[(p as { dataIndex: number }).dataIndex];
            return item?.suppressed ? "小樣本抑制" : fmt(Number((p as { value: number }).value));
          },
          color: "#87958d",
          fontSize: 8,
        },
      },
    ],
  };
  const returnOption: EChartsOption = {
    ...chartBase,
    grid: { left: 82, right: 26, top: 14, bottom: 22 },
    xAxis: {
      type: "value",
      name: "配對交易筆數（小樣本抑制）",
      axisLine: { show: false },
      axisLabel: { fontSize: 9, formatter: (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(0)}k` : String(x)) },
      splitLine: { lineStyle: { color: "#edf0ed", type: "dashed" } },
    },
    yAxis: {
      type: "category",
      data: returnData.map((x) => x.label).reverse(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#566963", fontSize: 10 },
    },
    series: [{
      name: "回程配對交易",
      type: "bar",
      data: returnData.map((x) => x.return_count ?? 0).reverse(),
      barWidth: 16,
      itemStyle: { color: "#d68a54", borderRadius: [0, 5, 5, 0] },
      label: {
        show: true,
        position: "right",
        formatter: (p: unknown) => {
          const item = returnData.slice().reverse()[(p as { dataIndex: number }).dataIndex];
          return item?.suppressed ? "小樣本抑制" : fmt(Number((p as { value: number }).value));
        },
        color: "#87958d",
        fontSize: 8,
      },
    }],
  };
  const askBaseline = (question:string) => {setAssistantQuestion(question);setRoute('全部');setPage('智慧小幫手');};
  const annualView = () => <AnnualComparison data={data} baseYear={compareYear} targetYear={year}
    onYears={(base,target)=>{setCompareYear(base);setYear(target);}} onAsk={askBaseline} />;
  const content = () => {
    if (page === "使用說明") return <UserGuide onOpenScenario={openScenario} onNavigate={p => {if(nav.some(n=>n.name===p)) navigate(p as Page);}} />;
    if (page === "模型方法") return <ModelMethodology onNavigate={navigate} onOpenScenario={openScenario} />;
    if (page === "智慧小幫手") return <OperationsAssistant year={year} route={route} compareYear={compareYear} initialQuestion={assistantQuestion} years={availableYears(data)} onYears={(b,t)=>{setCompareYear(b);setYear(t);}} onNavigate={setPage} />;
    if (page === "旅遊資訊") return <TourismGuide timetable={publishedTimetable} timetableSource={timetableSource} departAfter={journeyDeparture} onDepartAfterChange={setJourneyDeparture} />;
    if (page === "營運總覽") return <>
      {annualView()}
      <BaselineDetails data={data} baseYear={compareYear} targetYear={year} onAsk={askBaseline}/>
      <details className="annual-legacy"><summary>延伸分析：卡片頻次、回程間隔與需求預測</summary>
      <p className="panel-note">本區使用 {year} 年全部子線；頻次為卡片欄位代理，不能推論觀光、通勤、年齡或身分。預測沿用既有單年基線。</p>
      <div className="grid-2">
            <Panel title="每卡年度刷卡頻次" tag="行為代理指標 · 不代表獨立旅次">
              <Chart option={behaviorOption} className="chart chart-medium" />
              <p className="panel-note">
                以本年度卡號在原始票證列出現次數分桶；卡號只在本機彙總時使用，輸出不含識別碼。少於
                10 個卡號的頻次格隱藏群組數。刷卡交易次數不等同乘客人數或旅次。
              </p>
            </Panel>
            <Panel title="同日反向 OD 回程間隔" tag="匿名卡片配對 · 計費站推估">
              <Chart option={returnOption} className="chart chart-medium" />
              <p className="panel-note">
                同一卡號、同日內，依反向計費站 OD 配對交易，顯示去程刷卡至回程刷卡的間隔；每筆配對只計一次，限 12 小時內。這不是完整旅次或實際上下車站分析，少於 10 筆的區間不顯示。
              </p>
            </Panel>
            <Panel title="日需求預測回測" tag="近 4 個有效同星期日中位數 · 留後 28 日">
              <div className="forecast-summary">
                <b>
                  {forecast.wape === null
                    ? "WAPE —"
                    : `WAPE ${(forecast.wape * 100).toFixed(1)}%`}
                </b>
                <span>
                  MAE{" "}
                  {forecast.mae === null ? "—" : `${fmt(forecast.mae)} 筆／日`}{" "}
                  · 有效回測 {forecast.eligibleDays} 日
                </span>
              </div>
              <Chart
                option={forecastTestOption}
                className="chart chart-medium"
              />
              <p className="panel-note">
                透明統計基線，非已訓練 AI
                模型；僅使用預測日期之前有觀測值的同星期交易日。未觀測日期保留缺值，沒有補成零。
              </p>
            </Panel>
            <Panel title="未來 7 日需求基線" tag="以最後觀測日往後推估">
              <Chart
                option={nextForecastOption}
                className="chart chart-medium"
              />
              <p className="panel-note">
                每個預測日只使用前 28 個日曆日內的有效同星期資料；至少 2 個樣本才取中位數，否則保留空值。
              </p>
            </Panel>
      </div></details>
    </>;
    if (page === "成本最佳化")
      return (
        <>
          <div className="page-intro">
            <div>
              <div className="eyebrow">FLEET PLANNING</div>
              <h1>成本最佳化</h1>
              <p>在服務底線下尋找候選班次集合中的最低營運成本。</p>
            </div>
            <button className="button-primary" onClick={() => void runOptimizer()} disabled={optimizerRunning}>
              <Sparkles size={16} /> {optimizerRunning ? "求解中…" : "求最低成本方案"}
            </button>
          </div>
          <div className="notice-banner">
            <ShieldCheck size={17} />
            <span>
              展示模型使用合成車輛容量、成本及候選班次；不是南投客運排班或實際成本。
            </span>
          </div>
          <div className="grid-main">
            <section className="stack">
              <Panel title="規劃目標" tag="可修改的情境假設">
                <div className="constraint-list">
                  <div>
                    <span>服務需求基準</span>
                    <strong>
                      {fmt(
                        Math.round(
                          (evening / Math.max(1, weightedHour)) *
                            320 *
                            demandBoost,
                        ),
                      )}{" "}
                      人次 <small>估計</small>
                    </strong>
                  </div>
                  <div>
                    <span>最低服務比例</span>
                    <strong>90%</strong>
                  </div>
                  <div>
                    <span>規劃時段</span>
                    <strong>15:00–19:00</strong>
                  </div>
                  <div>
                    <span>可用候選班次</span>
                    <strong>8 班 · 5 輛合成車</strong>
                  </div>
                </div>
                <label className="slider-label">
                  需求情境<span>{demandBoost.toFixed(1)}×</span>
                </label>
                <input
                  type="range"
                  min=".7"
                  max="1.8"
                  step=".1"
                  value={demandBoost}
                  onChange={(e) => setDemandBoost(Number(e.target.value))}
                />
                <div className="slider-ends">
                  <span>低需求 0.7×</span>
                  <span>高需求 1.8×</span>
                </div>
                <div className="inline-explain">
                  成本 = 班次固定示例費用；車輛至少間隔 2
                  小時。尚未包含駕駛勤務與真實迴轉時間。
                </div>
              </Panel>
              <Panel title="演算法狀態" tag={solution?.solver ?? "CP-SAT／精確降級"}>
                <div className="solver-box">
                  <div className="solver-icon">
                    <Activity size={18} />
                  </div>
                  <div>
                    <b>
                      {solution
                        ? solution.status === "optimal"
                          ? "已找到集合內最低成本"
                          : solution.status === "feasible"
                            ? "找到可行解，未證最優"
                            : solution.status === "infeasible"
                              ? "無可行方案"
                              : "求解狀態未知"
                        : "等待執行"}
                    </b>
                    <p>
                      {solution
                        ? solution.scope
                        : "調整需求情境後，執行 CP-SAT 求解；後端不可用時使用前端精確窮舉。"}
                    </p>
                  </div>
                </div>
                {solution && (
                  <div className="constraint-list result-list">
                    <div>
                      <span>方案成本</span>
                      <strong>
                        {solution.objective === null
                          ? "—"
                          : money(solution.objective)}
                      </strong>
                    </div>
                    <div>
                      <span>符合服務底線</span>
                      <strong>
                        {fmt(solution.served)} / {fmt(solution.demand)}
                      </strong>
                    </div>
                    <div>
                      <span>未服務需求</span>
                      <strong>{fmt(solution.unserved)}</strong>
                    </div>
                  </div>
                )}
              </Panel>
            </section>
            <section className="stack">
              <Panel title="候選發車時刻" tag="容量／成本為合成示例">
                <div className="candidate-list">
                  {(solution?.selected ?? tripCandidates).map((t) => (
                    <div
                      className={`candidate-row ${solution?.selected.some((s) => s.id === t.id) ? "selected" : ""}`}
                      key={t.id}
                    >
                      <span
                        className={
                          solution?.selected.some((s) => s.id === t.id)
                            ? "selected-check"
                            : "candidate-dot"
                        }
                      >
                        {solution?.selected.some((s) => s.id === t.id) && (
                          <Check size={13} />
                        )}
                      </span>
                      <b>{t.label}</b>
                      <span>{t.variant}</span>
                      <span>{t.capacity} 席</span>
                      <strong>{money(t.cost)}</strong>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="方案成本—服務位置" tag="選取後檢視班次">
                <Chart
                  option={{
                    ...chartBase,
                    grid: { left: 44, right: 18, top: 20, bottom: 35 },
                    xAxis: { ...chartBase.xAxis, name: "營運成本（元）" },
                    yAxis: {
                      ...chartBase.yAxis,
                      name: "服務人數",
                      nameTextStyle: { fontSize: 10 },
                    },
                    series: [
                      {
                        type: "scatter",
                        data: solution
                          ? [[solution.objective || 0, solution.served]]
                          : [[0, 0]],
                        symbolSize: 20,
                        itemStyle: { color: "#20816b" },
                        label: {
                          show: true,
                          formatter: "目前可行方案",
                          position: "top",
                          color: "#35665a",
                          fontSize: 11,
                        },
                      },
                    ],
                  }}
                />
              </Panel>
            </section>
          </div>
          <Panel title="最低道路營運成本路徑" tag="Dijkstra · 兩種車型成本分開求解">
            <div className="notice-banner road-demo-warning">
              <ShieldCheck size={17} />
              <span>
                {roadDemo
                  ? `${roadDemo.graph_name} · 合成圖最佳解，不是實際 GIS 路網、導航指示或客運成本。能源價格、車輛效率、維護費和駕駛費均為可替換情境假設。`
                  : "道路成本 API 尚不可用；此區不顯示未計算的示意結果。啟動本機 API 後重新整理。"}
              </span>
            </div>
            {roadDemo && (
              <div className="road-demo-grid">
                <Chart
                  className="chart chart-medium"
                  option={{
                    ...chartBase,
                    grid: { left: 50, right: 22, top: 28, bottom: 38 },
                    xAxis: { type: "value", name: "旅行時間（分鐘）", nameTextStyle: { fontSize: 9 }, axisLabel: { color: "#7d8d88", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf0ed", type: "dashed" } } },
                    yAxis: { type: "value", name: "營運成本（元）", nameTextStyle: { fontSize: 9 }, axisLabel: { color: "#7d8d88", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf0ed", type: "dashed" } } },
                    series: roadDemo.results.map((entry, index) => ({
                      type: "scatter",
                      name: entry.profile_name,
                      data: entry.result.cost_ntd === null ? [] : [[(entry.result.travel_time_seconds ?? 0) / 60, entry.result.cost_ntd]],
                      symbolSize: 18,
                      itemStyle: { color: index === 0 ? "#d18c47" : "#21816c" },
                      label: { show: true, formatter: entry.profile_name.replace("成本情境", ""), position: "top", fontSize: 9, color: "#52675d" },
                    })),
                  }}
                />
                <div className="road-route-list">
                  {roadDemo.results.map((entry, index) => {
                    const result = entry.result;
                    const byId = new Map(roadDemo.nodes.map((node) => [node.id, node.name]));
                    const categories: Record<string, string> = { energy: "能源", driver_time: "駕駛時間", maintenance: "維護", toll: "通行費" };
                    return (
                      <article className={`road-result-card ${index === 0 ? "diesel" : "electric"}`} key={entry.profile_id}>
                        <div className="road-result-title"><b>{entry.profile_name}</b><strong>{result.cost_ntd === null ? "無可行路徑" : money(result.cost_ntd)}</strong></div>
                        {result.cost_ntd !== null && <>
                          <div className="road-flow" aria-label={`${entry.profile_name}路徑`}>
                            {result.node_ids.map((nodeId, nodeIndex) => (
                              <div className="road-flow-step" key={`${entry.profile_id}-${nodeId}-${nodeIndex}`}>
                                <span>{byId.get(nodeId) ?? nodeId}</span>
                                {nodeIndex < result.node_ids.length - 1 && <i aria-hidden="true">→</i>}
                              </div>
                            ))}
                          </div>
                          <div className="road-result-meta">{result.distance_km?.toFixed(1)} 車公里 · {Math.round((result.travel_time_seconds ?? 0) / 60)} 分鐘 · {result.optimality_scope === "complete_supplied_graph" ? "完整合成圖最優" : "僅已核對路段最優"}</div>
                          <div className="road-cost-breakdown">
                            {Object.entries(result.cost_breakdown_minor ?? {}).map(([key, value]) => <span key={key}>{categories[key] ?? key}<b>{money(value / 100)}</b></span>)}
                          </div>
                        </>}
                        <p>{entry.assumptions.join(" · ")}</p>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
            {roadDemo && <p className="panel-note">演算法：非負整數分 Dijkstra；最低總營運成本為主，平手依旅行時間、距離、路段數及穩定路段 ID 決定。成本拆分為能源、駕駛時間、維護及通行費。圖中數值以合成示例精確求解，不能當成真實路況最佳路線。</p>}
          </Panel>
        </>
      );
    if (page === "旅客行程")
      return (
        <>
          <div className="page-intro">
            <div>
              <div className="eyebrow">LOWEST FARE ROUTE</div>
              <h1>旅客行程</h1>
              <p>用官網班表查直達班次，並以合成票價圖示範最低票價演算法。</p>
            </div>
            <span className="badge-synthetic">
              <Sparkles size={13} /> 演算法示例
            </span>
          </div>
          <div className="journey-card">
            <div className="journey-fields">
              <label>
                出發地
                <div>
                  <Search size={15} />
                  <select
                    value={journeyOrigin}
                    onChange={(e) => setJourneyOrigin(e.target.value)}
                  >
                    <option>埔里轉運站</option>
                    <option>埔里轉運站-轉乘點</option>
                    <option>高鐵臺中站</option>
                  </select>
                </div>
              </label>
              <button
                className="swap-button"
                aria-label="交換起訖"
                onClick={() => {
                  setJourneyOrigin(journeyDestination);
                  setJourneyDestination(journeyOrigin);
                }}
              >
                <ArrowLeftRight size={16} />
              </button>
              <label>
                目的地
                <div>
                  <Search size={15} />
                  <select
                    value={journeyDestination}
                    onChange={(e) => setJourneyDestination(e.target.value)}
                  >
                    <option>高鐵臺中站</option>
                    <option>埔里轉運站</option>
                    <option>埔里轉運站-轉乘點</option>
                  </select>
                </div>
              </label>
              <label>
                最早出發
                <div>
                  <Clock3 size={15} />
                  <input
                    type="time"
                    value={journeyDeparture}
                    onChange={(e) => setJourneyDeparture(e.target.value)}
                  />
                </div>
              </label>
              <button
                className="button-primary"
                onClick={() =>
                  setNotice(
                    journey.status === "optimal"
                      ? `完整搜尋 ${journey.labelsVisited} 個標籤；合成班表圖最低票價為 ${money(journey.fareNtd ?? 0)}。`
                      : journey.status === "search_limit"
                        ? "搜尋達標籤上限；目前路徑只代表已搜尋部分，不能標為最低票價。"
                        : "在此合成班表圖與時間限制下找不到可行路徑。",
                  )
                }
              >
                搜尋低票價
              </button>
            </div>
            <div className="journey-routing-constraints">
              <label>
                最晚抵達{" "}
                <input
                  type="time"
                  value={journeyDeadline}
                  onChange={(e) => setJourneyDeadline(e.target.value)}
                />
              </label>
              <label>
                最少轉乘緩衝{" "}
                <select
                  value={transferBufferMinutes}
                  onChange={(e) =>
                    setTransferBufferMinutes(Number(e.target.value))
                  }
                >
                  <option value={0}>0 分鐘</option>
                  <option value={5}>5 分鐘</option>
                  <option value={10}>10 分鐘</option>
                </select>
              </label>
              <span>
                目標：票價最低；同票價以較早抵達作次要排序。班次與票價皆為合成資料。
              </span>
            </div>
            <div className="journey-result">
              <div className="journey-result-head">
                <span className="result-kicker">
                  {journey.status === "optimal"
                    ? "LOWEST FARE · COMPLETE FIXTURE SEARCH"
                    : journey.status === "search_limit"
                      ? "PARTIAL SEARCH · NOT PROVEN OPTIMAL"
                      : "NO FEASIBLE ITINERARY"}
                </span>
                <strong>
                  {journey.fareNtd === null ? "—" : money(journey.fareNtd)}
                </strong>
                <span className="result-sub">
                  {journey.arrivalSeconds === null
                    ? "無可行到達時間"
                    : `抵達 ${formatClock(journey.arrivalSeconds)} · ${journey.transfers} 次轉乘 · ${(journey.arrivalSeconds - parseClock(journeyDeparture)) / 60} 分鐘`}
                </span>
              </div>
              {journey.legs.map((leg, index) => (
                <div className="timeline-leg" key={leg.tripId}>
                  <div className="time-col">
                    <b>{formatClock(leg.departSeconds)}</b>
                    <span>{leg.from}</span>
                  </div>
                  <div className="line-col">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="leg-detail">
                    <b>
                      {leg.tripId.startsWith("direct")
                        ? "6670 示意直達班次"
                        : `合成服務段 ${index + 1}`}
                    </b>
                    <span>
                      {formatClock(leg.departSeconds)}–
                      {formatClock(leg.arriveSeconds)} · 車段票價{" "}
                      {money(leg.fareNtd)} · 至 {leg.to}
                    </span>
                  </div>
                </div>
              ))}
              {journey.status !== "optimal" && (
                <div className="panel-note">
                  {journey.status === "search_limit"
                    ? "標籤搜尋預算用盡，請增加搜尋預算或縮小時間範圍。"
                    : "請調整時間限制、方向或資料覆蓋；票價未知時不得以零元替代。"}
                </div>
              )}
              <div className="journey-foot">
                <span>
                  <ShieldCheck size={14} />
                  {journey.searchComplete
                    ? "有限合成班表圖已完整搜尋；不代表真實南投客運最低價"
                    : "搜尋未完成，結果不可宣稱最佳"}
                </span>
                <button
                  className="text-button"
                  onClick={() => setPage("資料品質")}
                >
                  查看資料限制 <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
          <PublishedTimetableSearch
            timetable={publishedTimetable}
            source={timetableSource}
            departAfter={journeyDeparture}
            onDepartAfterChange={setJourneyDeparture}
            initialDirection="sun_moon_lake_to_taichung"
            initialOrigin="埔里站"
            initialDestination="高鐵 台中站"
          />
          <div className="grid-2">
            <Panel title="票價與時間取捨" tag="固定合成例">
              <div className="comparison-row">
                <span>轉乘方案</span>
                <div className="mini-bar">
                  <i style={{ width: "72%" }} />
                </div>
                <b>NT$90</b>
                <small>60 分</small>
              </div>
              <div className="comparison-row">
                <span>直達方案</span>
                <div className="mini-bar muted-bar">
                  <i style={{ width: "100%" }} />
                </div>
                <b>NT$120</b>
                <small>40 分</small>
              </div>
              <p className="panel-note">
                此比較固定使用 08:00 合成班表示例，不隨上方時間與轉乘條件變更。最低票價與最短時間是不同目標。
              </p>
            </Panel>
            <Panel title="真實查詢所需資料">
              <div className="constraint-list">
                <div>
                  <span>TDX 官方路線資料</span>
                  <strong className={tdxStatus?.state === "connected" ? "state-good" : "state-pending"}>
                    {tdxStatus?.state === "connected" ? "API 已驗證" : tdxStatus?.state === "not_configured" ? "未設定憑證" : tdxStatus?.state === "not_connected" ? "尚未連線" : "狀態未知"}
                  </strong>
                </div>
                <div>
                  <span>6670 官網班表</span>
                  <strong className="state-pending">歷史快照 · 非即時</strong>
                </div>
                <div>
                  <span>有效票價版本</span>
                  <strong className="state-pending">待人工核對</strong>
                </div>
                <div>
                  <span>即時餘位</span>
                  <strong>目前未取得</strong>
                </div>
              </div>
            </Panel>
          </div>
          <Panel
            title="南投客運 6670 國道線班表主表"
            tag={timetableSource === "api" ? "本機 API · 官網快照" : "內嵌官網快照"}
          >
            <div className="notice-banner timetable-warning">
              <ShieldCheck size={17} />
              <span>
                班表快照標示自 {publishedTimetable.effective_from} 實施；不是即時班次，也不含頁面另列的九人座班表。中間站時間為業者估時，當日有效性與特殊營運日仍須核對。來源未提供已核對票價，因此此表不參與上方最低票價求解。
              </span>
            </div>
            <div className="timetable-controls">
              <label>
                行駛方向
                <select value={timetableDirection} onChange={(event) => setTimetableDirection(event.target.value)}>
                  <option value="taichung_to_sun_moon_lake">臺中 → 日月潭</option>
                  <option value="sun_moon_lake_to_taichung">日月潭 → 臺中</option>
                </select>
              </label>
              <label>
                班次日別標記
                <select value={timetableService} onChange={(event) => setTimetableService(event.target.value)}>
                  <option value="all">全部班次</option>
                  <option value="daily_unmarked">原表未標週別</option>
                  <option value="mon_thu">週一至週四</option>
                  <option value="fri_sun">週五至週日</option>
                  <option value="unspecified">原表標記待確認</option>
                </select>
              </label>
              <span>{publishedTrips.length} 班 · {timetableDirection === "taichung_to_sun_moon_lake" ? "往日月潭" : "往臺中"}</span>
            </div>
            <Chart
              className="chart chart-medium"
              option={{
                ...chartBase,
                grid: { left: 38, right: 18, top: 22, bottom: 34 },
                xAxis: { ...chartBase.xAxis, data: publishedDepartureHours.map((item) => `${String(item.hour).padStart(2, "0")}:00`) },
                yAxis: { ...chartBase.yAxis, minInterval: 1, name: "班次" },
                series: [{ type: "bar", name: "表列發車數", data: publishedDepartureHours.map((item) => item.departures), itemStyle: { color: "#32806b", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 24 }],
              }}
            />
            <div className="published-timetable-list">
              <table>
                <thead><tr><th>發車</th><th>路線</th><th>逐站表列時間</th><th>原表日別標記</th></tr></thead>
                <tbody>
                  {publishedTrips.map((trip) => (
                    <tr key={trip.trip_id}>
                      <td><strong>{trip.stops[0].time}</strong></td>
                      <td>{trip.route_code}</td>
                      <td className="published-stop-times">{trip.stops.map((stop, index) => (
                        <span key={`${trip.trip_id}-${index}`} className="published-stop-time">
                          <strong>{stop.time}</strong> {stop.name.replace(/\s+/g, " ")}
                          {index < trip.stops.length - 1 && <i aria-hidden="true">→</i>}
                        </span>
                      ))}</td>
                      <td>{trip.service_class === "daily_unmarked" ? "未標週別" : trip.service_class === "mon_thu" ? "週一至週四" : trip.service_class === "fri_sun" ? "週五至週日" : "待確認"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {publishedTrips.length === 0 && <p className="panel-note">此篩選條件沒有表列班次。</p>}
            </div>
            <div className="journey-foot">
              <span><FileCheck2 size={14} />快照擷取日 {publishedTimetable.snapshot_captured_at} · 資料狀態：未驗證今日有效性 · 票價未加入</span>
              <a className="text-button" href={publishedTimetable.source_url} target="_blank" rel="noreferrer">開啟業者來源 <ChevronRight size={14} /></a>
            </div>
          </Panel>
        </>
      );
    if (page === "低碳評估")
      return (
        <>
          <div className="page-intro">
            <div>
              <div className="eyebrow">ENERGY & CARBON</div>
              <h1>低碳評估</h1>
              <p>以車公里和能源效率估算柴油／電巴營運排放。</p>
            </div>
            <div className="carbon-selects">
              <label className="select-inline">
                柴油排放情境
                <select
                  value={dieselScenario}
                  onChange={(e) => setDieselScenario(e.target.value)}
                >
                  <option value="fuel-reference">燃油推估 · 1.173 kg/km</option>
                  <option value="sort-low">柴油區間低值 · 1.585 kg/km</option>
                  <option value="sort-high">柴油區間高值 · 2.123 kg/km</option>
                </select>
              </label>
              <label className="select-inline">
                電力係數情境
                <select
                  value={electricFactor}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setElectricFactor(value);
                    const c = estimateCarbon(
                      1480,
                      2.26,
                      0.7,
                      value,
                      dieselFactorPerKm,
                    );
                    setNotice(
                      "每 1,480 車公里示例：柴油 " +
                        c.dieselKg.toFixed(1) +
                        " kg CO₂e；電巴 " +
                        c.evKg.toFixed(1) +
                        " kg CO₂e。",
                    );
                  }}
                >
                  <option value="0.467">2025 公用售電業 · 0.467</option>
                  <option value="0.474">2024 公用售電業 · 0.474</option>
                  <option value="0.466">2025 產業盤查 · 0.466</option>
                  <option value="0.509">歷史比較組 · 0.509</option>
                </select>
              </label>
            </div>
          </div>
          <div className="notice-banner">
            <Leaf size={17} />
            <span>
              估算參數非南投車隊實測。電巴0.7 km/kWh與柴油2.26 km/L為參考情境。
            </span>
          </div>
          <div className="metric-row four">
            <Metric
              label="比較車公里"
              value="1,480 km"
              icon={Bus}
              foot="示例服務距離，相同里程比較"
            />
            <Metric
              label="柴油車排放"
              value={carbon.dieselKg.toFixed(0) + " kg"}
              icon={Wind}
              foot={
                dieselScenario === "fuel-reference"
                  ? "2.65 kg/L · 2.26 km/L"
                  : "使用者提供的SORT區間輸入"
              }
            />
            <Metric
              label="電動車排放"
              value={carbon.evKg.toFixed(0) + " kg"}
              icon={Leaf}
              foot={`0.7 km/kWh · ${electricFactor} kg/kWh`}
            />
            <Metric
              label="估計差異"
              value={carbon.savedKg.toFixed(0) + " kg"}
              icon={TrendingDown}
              foot="僅作同里程假設比較"
            />
          </div>
          <div className="grid-2">
            <Panel title="每公里排放比較" tag="kg CO₂e / 車公里">
              <Chart
                option={{
                  ...chartBase,
                  xAxis: { ...chartBase.xAxis, data: ["柴油公車", "電動公車"] },
                  yAxis: { ...chartBase.yAxis, name: "kg CO₂e / km" },
                  series: [
                    {
                      type: "bar",
                      barWidth: 38,
                      data: [carbon.dieselKg / 1480, electricFactor / 0.7],
                      itemStyle: {
                        borderRadius: [6, 6, 0, 0],
                        color: (p: unknown) =>
                          (p as { dataIndex: number }).dataIndex === 0
                            ? "#bc7353"
                            : "#398b73",
                      },
                      label: {
                        show: true,
                        position: "top",
                        formatter: (p: unknown) =>
                          Number((p as { value: number }).value).toFixed(3) +
                          " kg",
                      },
                    },
                  ],
                }}
              />
            </Panel>
            <Panel title="參數來源與邊界">
              <div className="source-block">
                <b>柴油情境：{carbon.dieselBasis}</b>
                <p>
                  {dieselScenario === "fuel-reference"
                    ? "2.650 kgCO₂e/L ÷ 2.26 km/L = 1.173 kg/km。"
                    : "採你提供的 1.585–2.123 kg/km 範圍作敏感度；SORT 週期、車型及載客條件尚待原始文件核對，不能當成已驗證 SORT 實測。"}
                </p>
                <b>電巴參考情境</b>
                <p>
                  {electricFactor} kgCO₂e/kWh ÷ 0.7 km/kWh ={" "}
                  {(electricFactor / 0.7).toFixed(3)} kgCO₂e/km。0.7 km/kWh
                  為歷史比較參數，不是車隊實測。
                </p>
                <b>歷史比較數字的換算差異</b>
                <p>
                  0.727 kg/km 對應 0.509 kg/kWh ÷ 0.7 km/kWh；若採你提供的
                  0.474 係數，同能耗結果為 0.677 kg/km，兩者不可混用。
                </p>
                <b>排除項目</b>
                <p>車輛與電池製造、能源上游、充電損失尚未納入。</p>
              </div>
            </Panel>
          </div>
        </>
      );
    if (page === "資料品質")
      return (
        <>
          <div className="page-intro">
            <div>
              <div className="eyebrow">DATA PROVENANCE</div>
              <h1>資料品質</h1>
              <p>檢視真實票證、官方來源、合成參數與目前尚缺資料。</p>
            </div>
          </div>
          <div className="notice-banner">
            <ShieldCheck size={17} />
            <span>
              目前畫面中的歷史票證圖表來自原始 Excel
              匯總；候選班次／旅客示例使用合成參數。
            </span>
          </div>
          <div className="quality-grid">
            <QualityCard
              title="電子票證資料"
              status="已彙總"
              detail={
                "2024 + 2025 年共 " + fmt(totalBoth) + " 筆原始非空交易列"
              }
              kind="good"
            />
            <QualityCard
              title="MapTiler 底圖"
              status="瀏覽器已驗收"
              detail="已設定 MapLibre Vite worker；本機瀏覽器可顯示 MapTiler 街道圖磚與 TDX 官方路線。部署仍需限制網域與額度。"
              kind="good"
            />
            <QualityCard
              title="TDX 官方路線資料"
              status={tdxStatus?.state === "connected" ? "API 已驗證" : tdxStatus?.state === "not_configured" ? "未設定" : tdxStatus?.state === "not_connected" ? "尚未連線" : "狀態未知"}
              detail={tdxStatus?.state === "connected"
                ? "可讀官方 route／stop／shape 靜態資料；不代表有班表、即時 GPS、ETA、餘位或核定票價。"
                : `${tdxStatus?.message ?? "目前無法讀取連線狀態。"} 尚未確認可用的 TDX 路線資料。`}
              kind={tdxStatus?.state === "connected" ? "good" : "warn"}
            />
            <QualityCard
              title="站點座標與線形"
              status="官方線形可用"
              detail="營運地圖可切換 TDX 官方 shape／站序；票證計費站尚未映射到實體站牌，不可直接做 OD join 或導航。"
              kind="warn"
            />
            <QualityCard
              title="車輛容量與營運成本"
              status="未取得"
              detail="最佳化使用明確標示的合成候選車輛／成本"
              kind="warn"
            />
            <QualityCard
              title="即時餘位／GPS"
              status="未接通"
              detail="沒有即時車輛位置、GPS、預約庫存或剩餘座位"
              kind="warn"
            />
            <QualityCard
              title="2025-07-07"
              status="公告停駛"
              detail="刷卡缺日與官方颱風全線停駛公告吻合"
              kind="good"
            />
            <QualityCard
              title="2024 五個缺日"
              status="原因未知"
              detail="07-24、07-25、10-02、10-03、10-31，不能補為零需求"
              kind="warn"
            />
          </div>
          <Panel title="資料來源清單">
            <div className="data-table">
              <div className="table-head">
                <span>資料集</span>
                <span>範圍</span>
                <span>使用方式</span>
                <span>品質</span>
              </div>
              {data.years.map((x, i) => (
                <div className="table-row" key={x.source}>
                  <b>6670 刷卡資料 {2024 + i}</b>
                  <span>{fmt(x.rows)} 筆</span>
                  <span>上車時間、路線、計費站起訖</span>
                  <span className="state-good">原始資料</span>
                </div>
              ))}
              <div className="table-row">
                <b>南投客運官網</b>
                <span>80 個網址</span>
                <span>班次與服務規則研究</span>
                <span className="state-pending">歷史版本混合</span>
              </div>
              <div className="table-row">
                <b>候選車隊／費率</b>
                <span>6 班／2 條路徑</span>
                <span>演算法合成 fixture</span>
                <span className="state-assumed">合成資料</span>
              </div>
            </div>
          </Panel>
        </>
      );
    return null;
  };
  return (
    <>
      {(twinVisited || inSimulation) && <TimetableScenarioLab active={inSimulation} initialPanel={scenarioPanel} requestId={panelRequest}
        page={page === '行車模擬' ? '行車模擬' : '模擬預測'} onNavigate={navigate}
        onPanelChange={panel => { if (panel !== 'bot') setPage(panel === 'ops' ? '行車模擬' : '模擬預測'); }}
        onMethod={() => setPage("模型方法")} />}
      {!inSimulation && <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">
            <Route size={21} />
          </div>
          <div>
            <b>潭行 Twin</b>
            <small>NANTOU TRANSIT LAB</small>
          </div>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">NT</div>
          <div>
            <b>南投運輸決策</b>
            <small>本機工作區</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          {["工作台", "規劃", "智慧服務", "永續與資料"].map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-label">{group}</span>
              {nav
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    className={
                      "nav-item " + (page === item.name ? "active" : "")
                    }
                    key={item.name}
                    aria-label={item.name}
                    title={item.name}
                    onClick={() => navigate(item.name)}
                  >
                    <item.icon size={17} />
                    <span>{item.name}</span>
                    {page === item.name && <i />}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" aria-label="工作區設定" title="工作區設定">
            <Settings2 size={17} />
            <span>工作區設定</span>
          </button>
          <div className="sidebar-user">
            <div className="user-avatar">NT</div>
            <div>
              <b>分析工作區</b>
              <small>資料模式 · 本機</small>
            </div>
            <MoreHorizontal size={16} />
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>南投運輸決策</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
          <div className="top-actions">
            <span className="data-status">
              <i />
              {dataSource === "api" ? "本機資料 API" : "離線彙總資料"}
            </span>
            <button className="icon-button" title="搜尋">
              <Search size={17} />
            </button>
            <button className="assistant-top-button" onClick={() => setPage("智慧小幫手")} aria-label="開啟智慧小幫手">
              <MessageCircleMore size={15} /><span>問小幫手</span>
            </button>
            <button className="avatar-small">NT</button>
          </div>
        </header>
        <div className="page-content">
          {notice && (
            <div className="toast" role="status">
              {notice}
              <button onClick={() => setNotice("")}>關閉</button>
            </div>
          )}
          {content()}
          <footer>
            潭行 Twin · 資料模式依功能標記 ·
            車輛、候選班次與票價示例均非實際營運數據
            <span>SPEC v1.0 · 本機展示</span>
          </footer>
        </div>
      </main>
    </div>}
    </>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
  foot,
  trend,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  foot: string;
  trend?: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      <div className="metric-foot">
        {trend && (
          <span
            className={trend.startsWith("+") ? "trend-up" : "trend-neutral"}
          >
            {trend}
          </span>
        )}
        {foot}
      </div>
    </div>
  );
}
function Panel({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {tag && <span>{tag}</span>}
        </div>
        {title.includes("時段") && (
          <button className="icon-button tiny">
            <Filter size={14} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
function QualityCard({
  title,
  status,
  detail,
  kind,
}: {
  title: string;
  status: string;
  detail: string;
  kind: "good" | "warn";
}) {
  return (
    <div className="quality-card">
      <div className={"quality-symbol " + kind}>
        {kind === "good" ? <Check size={16} /> : <Activity size={16} />}
      </div>
      <div className="quality-copy">
        <b>{title}</b>
        <span>{detail}</span>
      </div>
      <small className={kind === "good" ? "state-good" : "state-pending"}>
        {status}
      </small>
    </div>
  );
}

