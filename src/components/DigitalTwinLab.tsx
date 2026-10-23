import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Activity,
  Bus,
  CirclePause,
  CirclePlay,
  Clock3,
  Leaf,
  RotateCcw,
  Route,
  Users,
  Zap,
} from "lucide-react";
import { Chart } from "./Chart";
import { TransitMap } from "./TransitMap";
import { ThreeTwinScene } from "./ThreeTwinScene";
import {
  advanceTwin,
  createTwinState,
  deriveTwinMetrics,
  setTwinConfig,
  type TwinConfig,
  type TwinState,
} from "../simulation";

const panelChart = {
  animationDuration: 250,
  textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: "#72827e" },
  tooltip: {
    trigger: "axis" as const,
    backgroundColor: "#183632",
    borderWidth: 0,
    textStyle: { color: "#fff" },
  },
  grid: { left: 46, right: 18, top: 20, bottom: 30 },
  xAxis: {
    type: "category" as const,
    axisLine: { lineStyle: { color: "#e4e9e5" } },
    axisTick: { show: false },
    axisLabel: { color: "#7d8d88", fontSize: 10 },
  },
  yAxis: {
    type: "value" as const,
    splitLine: { lineStyle: { color: "#edf0ed", type: "dashed" as const } },
    axisLabel: { color: "#87948f", fontSize: 10 },
  },
};
const format = (n: number, d = 0) =>
  new Intl.NumberFormat("zh-TW", { maximumFractionDigits: d }).format(n);
const ntd = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);

export function DigitalTwinLab() {
  const [state, setState] = useState<TwinState>(() => ({ ...createTwinState(), paused: false }));
  const [selectedStop, setSelectedStop] = useState("puli");
  const metrics = deriveTwinMetrics(state);
  const stopQueueIndex: Record<string, number> = {
    "taichung-hsr": 0, puli: 1, ncnu: 2, nine: 3, sml: 4, xiangshan: 5,
  };
  const selectedQueue = state.queueByStop[stopQueueIndex[selectedStop] ?? 0] ?? 0;
  const peakQueue = Math.max(0, ...state.queueByStop);
  const loadHint = peakQueue >= 45
    ? `單站最大候車 ${peakQueue} 人，已超過示例單車 45 席；可比較縮短間距或增加一輛車。`
    : metrics.loadFactor >= 0.8
      ? `車上平均載客率 ${format(metrics.loadFactor * 100, 1)}%，接近示例容量上緣；可測試增加運能。`
      : metrics.loadFactor < 0.25
        ? "目前平均載客率偏低；可比較減少一輛車或維持供給並觀察尖峰隊列。"
        : "目前模擬負載在中間區間；試跑不同需求倍率與發車間距，查看乘客與成本變化。";
  useEffect(() => {
    const timer = window.setInterval(
      () => setState((s) => advanceTwin(s, 250)),
      250,
    );
    return () => window.clearInterval(timer);
  }, []);
  const apply = (changes: Partial<TwinConfig>) =>
    setState((s) => setTwinConfig(s, changes));
  const setSpeed = (speed: 1 | 2 | 4) => setState((s) => ({ ...s, speed }));
  const reset = () => setState((s) => ({ ...createTwinState(s.config), paused: false }));
  const scenario = (
    name: "平日基準" | "尖峰加壓" | "離峰調度" | "觀光假日",
  ) => {
    const demandMultiplier =
      name === "尖峰加壓"
        ? 1.5
        : name === "離峰調度"
          ? 0.72
          : name === "觀光假日"
            ? 1.28
            : 1;
    const electricShare =
      name === "觀光假日" ? 0.5 : state.config.electricShare;
    setState((s) => ({
      ...createTwinState({ ...s.config, demandMultiplier, electricShare }),
      paused: false,
    }));
  };
  const history = state.history.slice(-40);
  const x = history.map(
    (p) =>
      `${String(6 + Math.floor(p.metrics.simSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((p.metrics.simSeconds % 3600) / 60)).padStart(2, "0")}`,
  );
  const waitingOption: EChartsOption = useMemo(
    () => ({
      ...panelChart,
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: "#72827e", fontSize: 10 },
      },
      xAxis: { ...panelChart.xAxis, data: x },
      series: [
        {
          name: "候車隊列",
          type: "line",
          smooth: 0.3,
          symbol: "none",
          data: history.map((p) => p.metrics.waiting),
          lineStyle: { color: "#cf9350", width: 2.3 },
          areaStyle: { color: "#cf935022" },
        },
        {
          name: "車上人數",
          type: "line",
          smooth: 0.3,
          symbol: "none",
          data: history.map((p) => p.metrics.onboard),
          lineStyle: { color: "#21816b", width: 2.3 },
        },
      ],
    }),
    [history],
  );
  const emissionsOption: EChartsOption = useMemo(
    () => ({
      ...panelChart,
      xAxis: { ...panelChart.xAxis, data: ["柴油 Scope 1", "電力 Scope 2"] },
      yAxis: { ...panelChart.yAxis, name: "kg CO₂e" },
      series: [
        {
          type: "bar",
          data: [metrics.dieselKg, metrics.electricKg],
          barWidth: 34,
          itemStyle: {
            color: (p: unknown) =>
              (p as { dataIndex: number }).dataIndex === 0
                ? "#be7756"
                : "#348a73",
            borderRadius: [5, 5, 0, 0],
          },
          label: {
            show: true,
            position: "top",
            formatter: (p: unknown) =>
              format(Number((p as { value: number }).value), 1),
          },
        },
      ],
    }),
    [metrics.dieselKg, metrics.electricKg],
  );
  const elapsed = `${String(6 + Math.floor(state.simSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((state.simSeconds % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(state.simSeconds % 60)).padStart(2, "0")}`;
  return (
    <div className="twin-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">GIS · DIGITAL TWIN</div>
          <h1>南投公運數位孿生</h1>
          <p>
            以同一組模擬狀態同步推演車輛、候車隊列、服務、成本與營運能源排放。
          </p>
        </div>
        <div className="twin-actions">
          <span className="badge-synthetic">
            <Activity size={13} /> 合成模擬 · 非即時車機
          </span>
          <button className="button-secondary" onClick={reset}>
            <RotateCcw size={15} /> 重設情境
          </button>
        </div>
      </div>
      <div className="scenario-toolbar">
        <div className="scenario-presets">
          <span>情境：</span>
          {(["平日基準", "尖峰加壓", "離峰調度", "觀光假日"] as const).map(
            (s) => (
              <button
                key={s}
                className="scenario-chip"
                onClick={() => scenario(s)}
              >
                {s}
              </button>
            ),
          )}
        </div>
        <div className="twin-clock">
          <Clock3 size={15} />
          <b>{elapsed}</b>
          <span>模擬時間</span>
          <button
            aria-label={state.paused ? "開始模擬" : "暫停模擬"}
            className="play-toggle"
            onClick={() => setState((s) => ({ ...s, paused: !s.paused }))}
          >
            {state.paused ? (
              <CirclePlay size={20} />
            ) : (
              <CirclePause size={20} />
            )}
            <span>{state.paused ? "開始" : "暫停"}</span>
          </button>
          <div className="speed-buttons">
            {([1, 2, 4] as const).map((n) => (
              <button
                key={n}
                className={state.speed === n ? "selected-speed" : ""}
                onClick={() => setSpeed(n)}
              >
                {n}×
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="twin-controls panel">
        <div className="control-block">
          <label htmlFor="vehicles">
            投入車輛 <b>{state.config.vehicleCount} 輛</b>
          </label>
          <input
            id="vehicles"
            type="range"
            min="0"
            max="20"
            value={state.config.vehicleCount}
            onChange={(e) => apply({ vehicleCount: Number(e.target.value) })}
          />
          <small>合成車隊規模</small>
        </div>
        <div className="control-block">
          <label htmlFor="demand">
            需求倍率 <b>{state.config.demandMultiplier.toFixed(2)}×</b>
          </label>
          <input
            id="demand"
            type="range"
            min=".5"
            max="2"
            step=".05"
            value={state.config.demandMultiplier}
            onChange={(e) =>
              apply({ demandMultiplier: Number(e.target.value) })
            }
          />
          <small>
            基準 {format(state.config.basePassengersPerHour)} 人次／小時
          </small>
        </div>
        <div className="control-block">
          <label htmlFor="electric-share">
            電動車占比 <b>{format(state.config.electricShare * 100)}%</b>
          </label>
          <input
            id="electric-share"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={state.config.electricShare}
            onChange={(e) => apply({ electricShare: Number(e.target.value) })}
          />
          <small>
            {state.vehicles.filter((v) => v.electric).length} 電動 ·{" "}
            {state.vehicles.filter((v) => !v.electric).length} 柴油
          </small>
        </div>
        <div className="control-block">
          <label htmlFor="headway">
            發車間隔 <b>{state.config.headwayMinutes} 分</b>
          </label>
          <input
            id="headway"
            type="range"
            min="5"
            max="30"
            step="5"
            value={state.config.headwayMinutes}
            onChange={(e) => apply({ headwayMinutes: Number(e.target.value) })}
          />
          <small>依往返時間估算所需車輛 · 班表未校準</small>
        </div>
      </div>
      <div className="twin-visual-grid">
        <section className="panel twin-scene-panel">
          <div className="panel-head">
            <div>
              <h3>6670 公車路線數位孿生</h3>
              <span>官方 TDX 路線線形 · 模擬車隊沿實際路線行駛 · 點選巴士查看車況</span>
            </div>
            <span className="scene-label">
              <i />
              3D TWIN
            </span>
          </div>
          <ThreeTwinScene
            vehicles={state.vehicles}
            routeLengthKm={state.config.routeLengthKm}
            speedKph={state.config.speedKph}
            paused={state.paused}
            summary={
              <div className="twin-kpis twin-kpis-summary">
                <Kpi
                  icon={Users}
                  label="候車隊列"
                  value={`${format(metrics.waiting)} 人`}
                  sub={`累計抵達 ${format(metrics.arrivals)} · 上車 ${format(metrics.boardings)}`}
                  tone="amber"
                />
                <Kpi
                  icon={Bus}
                  label="平均載客率"
                  value={`${format(metrics.loadFactor * 100, 1)}%`}
                  sub={`車上 ${format(metrics.onboard)} / ${metrics.activeVehicles * 45} 席 · 在線 ${metrics.activeVehicles}/${state.vehicles.length}`}
                  tone="green"
                />
                <Kpi
                  icon={Route}
                  label="累積車公里"
                  value={`${format(metrics.vehicleKm, 2)} km`}
                  sub={`車輛完成端點 ${state.vehicles.reduce((a, v) => a + v.tripsCompleted, 0)} 次`}
                  tone="blue"
                />
                <Kpi
                  icon={Activity}
                  label="估算營運成本"
                  value={ntd(metrics.operatingCostNtd)}
                  sub="能源＋示例維護＋在線車輛工時"
                  tone="slate"
                />
                <Kpi
                  icon={Leaf}
                  label="能源排放"
                  value={`${format(metrics.dieselKg + metrics.electricKg, 1)} kg`}
                  sub={`柴油 ${format(metrics.dieselKg, 1)} · 電力 ${format(metrics.electricKg, 1)} kg`}
                  tone="green"
                />
              </div>
            }
          />
        </section>
        <section className="panel twin-map-panel">
          <div className="panel-head">
            <div>
              <h3>地理脈絡 GIS</h3>
              <span>點選站點 · 底圖為第三方圖資</span>
            </div>
            <span className="scene-label map-label">
              <i />
              GIS
            </span>
          </div>
          <TransitMap selected={selectedStop} onSelect={setSelectedStop} />
          <div className="twin-selected-stop">
            <span>所選計費站群／站點</span>
            <b>
              {selectedStop === "puli"
                ? "埔里轉運站"
                : selectedStop === "sml"
                  ? "日月潭站"
                  : selectedStop === "ncnu"
                    ? "暨南大學"
                    : selectedStop === "nine"
                      ? "九族文化村"
                      : selectedStop === "xiangshan"
                        ? "向山遊客中心"
                        : "高鐵臺中站"}
            </b>
            <small>未核對實體站牌；僅供空間情境導覽</small>
            <small className="selected-queue">目前模擬候車 {format(selectedQueue)} 人</small>
          </div>
        </section>
      </div>
      <section className="panel load-strategy-panel">
        <div className="panel-head">
          <div>
            <h3>載客率與候車改善試算</h3>
            <span>依目前合成狀態提供可比較的調度方向，不是自動派車建議</span>
          </div>
          <Users size={16} />
        </div>
        <div className="load-strategy-content">
          <p>{loadHint}</p>
          <div>
            <button className="button-secondary" disabled={state.config.vehicleCount >= 20} onClick={() => apply({ vehicleCount: Math.min(20, state.config.vehicleCount + 1) })}>測試加 1 輛車</button>
            <button className="button-secondary" disabled={state.config.headwayMinutes <= 5} onClick={() => apply({ headwayMinutes: Math.max(5, state.config.headwayMinutes - 5) })}>測試縮短 5 分鐘間隔</button>
            <button className="button-secondary" disabled={state.config.vehicleCount <= 0} onClick={() => apply({ vehicleCount: Math.max(0, state.config.vehicleCount - 1) })}>測試減 1 輛車</button>
          </div>
        </div>
      </section>
      <div className="twin-charts-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>模擬服務負載</h3>
              <span>每 30 秒模型取樣 · 人數</span>
            </div>
          </div>
          <Chart option={waitingOption} className="chart chart-medium" />
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>累積營運能源排放</h3>
              <span>柴油 Scope 1 · 電力 Scope 2 · kg CO₂e</span>
            </div>
            <Zap size={16} />
          </div>
          <Chart option={emissionsOption} className="chart chart-medium" />
          <div className="carbon-footnote">
            排放係數：柴油 2.650 kg/L、2.26 km/L；電力{" "}
            {state.config.electricityKgPerKwh} kg/kWh、0.7
            km/kWh。均為參考情境，非車隊實測。
          </div>
        </section>
      </div>
      <div className="twin-disclosure">
        <b>模型邊界</b>
        <span>
          固定步長 0.5
          秒、無隨機數；TDX 可用時車輛沿官方線形模擬往返，TDX 不可用時退回示意廊道；站點需求依平／尖峰情境規則生成。場景地形、聚落和水面是視覺情境，不是 DEM 測量值。未模擬壅塞、道路通行、車機定位、實際班表、駕駛勤務、充電排程與乘客個別
          OD。成本使用本機可改的示例能源／維護／工時費率；所有結果只支持方案比較，不是調度指令或正式碳盤查。
        </span>
      </div>
    </div>
  );
}
function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="twin-kpi">
      <div className={"kpi-icon " + tone}>
        <Icon size={16} />
      </div>
      <div>
        <span>{label}</span>
        <b>{value}</b>
        <small>{sub}</small>
      </div>
    </div>
  );
}
