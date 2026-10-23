import type { Aggregates, ScheduleSolution, TripCandidate } from "./domain";
import { buildAnnualComparison, comparisonSelection, isAnnualQuestion } from "./annualComparison";
import { solveMinimumCost } from "./domain";
import tdxRouteSnapshotUrl from "./data/tdx-route-map-6670.json?url";
import aggregateFallback from "./data/ticket-aggregates.json";

export type AggregateSource = "api" | "bundled";
export type RoadDemoResponse = {
  graph_id: string;
  graph_name: string;
  source_status: string;
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  objective: string;
  objective_unit: string;
  algorithm: string;
  nodes: Array<{ id: string; name: string }>;
  results: Array<{
    profile_id: string;
    profile_name: string;
    assumptions: string[];
    result: {
      status: string;
      algorithm: string;
      cost_minor: number | null;
      cost_ntd: number | null;
      distance_km: number | null;
      travel_time_seconds: number | null;
      edge_ids: string[];
      node_ids: string[];
      optimality_scope: string;
      cost_breakdown_minor: Record<string, number> | null;
      warnings: string[];
    };
  }>;
  warnings: string[];
};

export type TdxStatus = {
  state: "not_configured" | "not_checked" | "connected" | "not_connected";
  reason_code: string | null;
  message: string;
  token_expires_at?: string;
};

export type AssistantReply = {
  answer: string;
  mode: "operations";
  engine: "openrouter" | "opencode" | "demo" | "demo_fallback";
  data_status: string;
  as_of: string;
  sources: Array<{ id: string; title: string; status: string; status_label: string; as_of: string | null; url: string | null }>;
  tool_calls: string[];
  suggested_actions: string[];
  provider_notice?: string;
  request_id: string;
};

export async function askTransitAssistant(
  input: { message: string; year: number; route: string; compare_year?:number },
  fetcher: typeof fetch = fetch,
): Promise<AssistantReply> {
  const inScope = /年度|年增|同比|去年|前年|比較.*20\d{2}|20\d{2}.*20\d{2}|預測|尖峰|離峰|運量|交易|票證|回程|頻次|od|乘載|載客率|需求|班次|班距|配置|最佳化|成本|情境|候選|車隊|營運|儀表板|即時|延誤|誤點|gps|eta|車況|資料狀態|資料品質|來源|回測|wape|mae|碳排|排放|最多|最高|時段|查需求|查運量/i.test(input.message);
  if (!inScope) return localAssistantFallback(input, "scope");
  let response: Response;
  try {
    response = await fetcher("/api/v1/assistant/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, mode: "operations" }),
    });
  } catch {
    return localAssistantFallback(input, "offline");
  }
  if (response.status === 404 || response.status === 405) return localAssistantFallback(input, "offline");
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? (payload as Record<string, unknown>).error : null;
    const message = error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string"
      ? String((error as Record<string, unknown>).message)
      : `助理服務暫時無法使用（${response.status}）`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object") throw new Error("助理回應格式無效");
  const row = payload as Record<string, unknown>;
  if (typeof row.answer !== "string" || !Array.isArray(row.sources) || !Array.isArray(row.suggested_actions) || typeof row.request_id !== "string") {
    throw new Error("助理回應缺少答案或來源資訊");
  }
  const sources = row.sources.map((source) => {
    const item = source as Record<string, unknown>;
    const status = String(item.status ?? "unknown");
    return {
      id: String(item.id ?? "source"),
      title: String(item.title ?? "資料來源"),
      status,
      status_label: ({ observed_aggregate: "歷史彙總", published_snapshot_unverified_for_today: "公開快照待核實", assumed: "情境假設" } as Record<string, string>)[status] ?? status,
      as_of: typeof item.as_of === "string" ? item.as_of : null,
      url: typeof item.url === "string" ? item.url : null,
    };
  });
  return {
    answer: row.answer,
    mode: "operations",
    engine: row.engine === "openrouter" || row.engine === "opencode" || row.engine === "demo_fallback" ? row.engine : "demo",
    data_status: String(row.data_status ?? "unknown"),
    as_of: String(row.as_of ?? ""),
    sources,
    tool_calls: Array.isArray(row.tool_calls) ? row.tool_calls.map(String) : [],
    suggested_actions: row.suggested_actions.filter((value): value is string => typeof value === "string"),
    provider_notice: typeof row.provider_notice === "string" ? row.provider_notice : undefined,
    request_id: row.request_id,
  };
}

function localAssistantFallback(input: { message: string; year: number; route: string; compare_year?:number }, kind: "scope" | "offline"): AssistantReply {
  const dataset = aggregateFallback as Aggregates;
  const year = dataset.years.find((row) => row.source.startsWith(String(input.year))) ?? dataset.years[dataset.years.length - 1];
  const text = input.message.toLowerCase();
  const sourceDate = year.source.slice(0, 4);
  const source = { id: `ticket-aggregate-${sourceDate}`, title: `${sourceDate}年6670票證安全彙總`, status: "observed_aggregate", status_label: "歷史彙總", as_of: dataset.generated_at ?? null, url: null };
  let answer = "";
  let status = "demo";
  let sources: AssistantReply["sources"] = [];
  let suggested_actions = ["查看尖離峰票證交易", "檢視班次最低成本情境", "確認即時資料來源狀態"];
  if (kind === "scope") {
    answer = "我目前是內部營運分析助理，只支援需求預測、尖離峰、票證彙總與行為、班次配置與成本情境，以及儀表板資料狀態。旅遊行程、旅客客服與一般問題不在支援範圍。";
  } else if (isAnnualQuestion(input.message)) {
    const selected=comparisonSelection(dataset,input);
    if(selected.missing.length) { answer=`尚無 ${selected.missing.join('、')} 年的聚合資料，無法計算該年度差異。`; status='missing'; }
    else {
      const c=buildAnnualComparison(dataset,selected.baseYear,selected.targetYear,input.route);
      const f=(v:number|null)=>v===null?'無資料':v.toLocaleString('zh-TW',{maximumFractionDigits:1});
      answer=`${c.baseYear} → ${c.targetYear} 年 ${c.route}：票證交易由 ${f(c.total.base)} 變為 ${f(c.total.target)} 筆，差異 ${f(c.total.delta)} 筆（${f(c.total.percent)}%）。有紀錄日為 ${c.base.observedDays}／${c.target.observedDays} 日；日均 ${f(c.dailyMean.base)} → ${f(c.dailyMean.target)} 筆。缺日不能補零，子線沒有逐日分布時不提供日均；交易數不是獨立人數，增減不證明因果。`;
      sources=[c.base,c.target].map(y=>({...source,id:`ticket-aggregate-${y.year}`,title:`${y.year}年6670票證聚合`}));status='sourced';
    }
  } else if (/即時|延誤|誤點|gps|eta|車況|車在哪|有沒有來/.test(text)) {
    answer = "目前這個公開靜態展示沒有連接即時 GPS／ETA 服務，無法確認車輛位置、到站時間或是否延誤。請將此狀態視為資料來源限制，不要解讀為準點。";
    status = "missing";
  } else if (/回程|頻次|od|票證行為|交易頻次|乘載行為/.test(text)) {
    const bins = year.same_day_return_interval.filter((item) => !item.suppressed && item.return_count != null);
    const top = bins.sort((a, b) => (b.return_count ?? 0) - (a.return_count ?? 0))[0];
    const freq = year.card_transaction_frequency.filter((item) => !item.suppressed && item.card_count != null).slice(0, 3);
    answer = `${input.year} 年同日反向 OD 回程間隔中，${top ? `「${top.label}」最多（${top.return_count?.toLocaleString("zh-TW")} 對）` : "目前沒有可公開的有效區間"}。票證頻次最高的前三個交易次數分組為 ${freq.map((item) => `${item.label} ${item.card_count?.toLocaleString("zh-TW")} 張卡`).join("、") || "無"}。這些是匿名群體代理：同卡、同日、反向計費站 OD、間隔不超過 12 小時，不代表確定旅程或實際上下車。`;
    status = "sourced";
    sources = [source];
    suggested_actions = ["在運量分析查看回程間隔圖", "查看資料品質與隱私門檻"];
  } else if (/最佳化|配置|需求.*(增加|提高|上升)|增加.*%|提高.*%|情境|候選/.test(text)) {
    const match = text.match(/(\d{1,3})\s*%|百分之\s*(\d{1,3})/);
    const increase = Math.min(100, Number(match?.[1] ?? match?.[2] ?? 15));
    const demand = Math.max(45, Math.round(320 * (1 + increase / 100)));
    const result = solveMinimumCost(demand, 0.9);
    const selected = result.selected.map((trip) => trip.label).join("、") || "無可行班次";
    answer = result.status === "optimal"
      ? `離線候選班次情境：需求基數 320 人次 × (1 + ${increase}%)，估計 ${demand} 人次；在服務至少 90% 下，前端全枚舉選出 ${selected}，示例成本 NT$${result.objective?.toLocaleString("zh-TW")}，容量服務 ${result.served}/${demand}。車輛、成本、容量與需求基數都是合成假設，這不是實際排班或即時 API 求解結果。`
      : `需求提高 ${increase}% 後，這組離線合成候選班次無法滿足 90% 服務底線；不代表真實車隊無解。`;
    status = "assumed";
    sources = [{ id: "synthetic-fleet-candidates", title: "合成候選班次／車輛／成本", status: "assumed", status_label: "情境假設", as_of: null, url: null }];
    suggested_actions = ["前往班次最佳化查看限制", "查看需求分析與歷史分布"];
  } else {
    const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, transactions: year.hour_by_route.filter((row) => row.hour === hour && (input.route === "全部" || row.route === input.route)).reduce((sum, row) => sum + row.transactions, 0) }));
    const peak = counts.reduce((best, row) => row.transactions > best.transactions ? row : best, counts[0]);
    answer = `${input.year} 年 ${input.route} 票證交易最高時段為 ${String(peak.hour).padStart(2, "0")}:00–${String(peak.hour + 1).padStart(2, "0")}:00，共 ${peak.transactions.toLocaleString("zh-TW")} 筆。這是公開彙總交易，不等於完整乘客數或目前候車量。${kind === "offline" ? "目前網站的營運 API 尚未連接，因此使用頁面內安全彙總資料提供示範回答。" : ""}`;
    status = "sourced";
    sources = [source];
    suggested_actions = ["在需求分析查看24小時曲線", "切換年度或子線"];
  }
  return {
    answer,
    mode: "operations",
    engine: "demo",
    data_status: status,
    as_of: dataset.generated_at ?? new Date().toISOString(),
    sources,
    tool_calls: [],
    suggested_actions,
    ...(kind === "offline" ? { provider_notice: "離線示範模式：目前無法連接營運 API／OpenRouter，以下為本機資料回覆。" } : {}),
    request_id: `local-${Date.now().toString(36)}`,
  };
}

export function isFleetOptimizationResponse(value: unknown): value is {
  status: "optimal" | "feasible" | "infeasible" | "unknown";
  algorithm: "OR-Tools CP-SAT";
  objective_ntd: number | null;
  best_bound_ntd: number | null;
  absolute_gap_ntd: number | null;
  selected_ids: string[];
  demand: number;
  served: number;
  unserved: number;
  optimality_scope: string;
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["optimal", "feasible", "infeasible", "unknown"].includes(String(row.status)) &&
    row.algorithm === "OR-Tools CP-SAT" &&
    (row.objective_ntd === null || Number.isInteger(row.objective_ntd)) &&
    (row.best_bound_ntd === null || Number.isInteger(row.best_bound_ntd)) &&
    (row.absolute_gap_ntd === null || Number.isInteger(row.absolute_gap_ntd)) &&
    Array.isArray(row.selected_ids) && row.selected_ids.every((id) => typeof id === "string") &&
    Number.isInteger(row.demand) && Number.isInteger(row.served) && Number.isInteger(row.unserved) &&
    typeof row.optimality_scope === "string";
}

export async function solveFleetMinimumCost(
  candidates: TripCandidate[],
  demand: number,
  minServedRatio: number,
  fetcher: typeof fetch = fetch,
): Promise<ScheduleSolution | null> {
  try {
    const response = await fetcher("/api/v1/optimizations/fleet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidates: candidates.map((candidate) => {
          const [hours, minutes] = candidate.label.split(":").map(Number);
          return {
            id: candidate.id,
            label: candidate.label,
            departure_minute: hours * 60 + minutes,
            capacity: candidate.capacity,
            cost_ntd: candidate.cost,
            vehicle: candidate.vehicle,
            turnaround_minutes: 120,
          };
        }),
        demand,
        min_served_ratio: minServedRatio,
        max_time_seconds: 5,
      }),
    });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    if (!isFleetOptimizationResponse(raw)) return null;
    const row = raw;
    const selected = row.selected_ids.map((id) => candidates.find((candidate) => candidate.id === id));
    if (selected.some((candidate) => !candidate)) return null;
    return {
      status: row.status,
      objective: row.objective_ntd,
      selected: selected as TripCandidate[],
      served: row.served,
      unserved: row.unserved,
      demand: row.demand,
      bound: row.best_bound_ntd,
      gap: row.absolute_gap_ntd,
      scope: row.optimality_scope,
      solver: row.algorithm,
    };
  } catch {
    return null;
  }
}

export type TdxRouteMapResponse = {
  source: "TDX MOTC";
  synthetic: false;
  route_prefix: string;
  retrieved_at: string;
  api_family: string;
  routes: Array<Record<string, unknown>>;
  route_uids: string[];
  shapes: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: Record<string, unknown>;
      geometry: { type: "LineString"; coordinates: number[][] };
    }>;
  };
  stops: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: Record<string, unknown>;
      geometry: { type: "Point"; coordinates: [number, number] };
    }>;
  };
  warnings: string[];
  cache_status?: "fresh" | "stale";
};

const TDX_ROUTE_CACHE_KEY = "nantou-transit-tdx-route-map-v1";
const TDX_ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let tdxRouteRequest: Promise<TdxRouteMapResponse> | null = null;

export function isTdxRouteMapResponse(value: unknown): value is TdxRouteMapResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.source !== "TDX MOTC" || candidate.synthetic !== false || typeof candidate.route_prefix !== "string") return false;
  const shapes = candidate.shapes as Record<string, unknown> | undefined;
  const stops = candidate.stops as Record<string, unknown> | undefined;
  if (!Array.isArray(candidate.routes) || !Array.isArray(candidate.route_uids) || !Array.isArray(candidate.warnings)) return false;
  if (shapes?.type !== "FeatureCollection" || !Array.isArray(shapes.features) || stops?.type !== "FeatureCollection" || !Array.isArray(stops.features)) return false;
  return shapes.features.every((feature) => {
    if (!feature || typeof feature !== "object") return false;
    const row = feature as Record<string, unknown>;
    const geometry = row.geometry as Record<string, unknown> | undefined;
    return row.type === "Feature" && geometry?.type === "LineString" && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2;
  }) && stops.features.every((feature) => {
    if (!feature || typeof feature !== "object") return false;
    const row = feature as Record<string, unknown>;
    const geometry = row.geometry as Record<string, unknown> | undefined;
    return row.type === "Feature" && geometry?.type === "Point" && Array.isArray(geometry.coordinates) && geometry.coordinates.length === 2;
  });
}

export async function loadTdxStatus(fetcher: typeof fetch = fetch): Promise<TdxStatus> {
  const response = await fetcher("/api/v1/integrations/tdx/status");
  if (!response.ok) throw new Error(`TDX 狀態 API 回傳 ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>).state !== "string") {
    throw new Error("TDX 狀態 API 回應格式無效");
  }
  return payload as TdxStatus;
}

export async function validateTdxCredentials(fetcher: typeof fetch = fetch): Promise<TdxStatus> {
  const response = await fetcher("/api/v1/integrations/tdx/validate", { method: "POST" });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).message === "string"
      ? String((payload as Record<string, unknown>).message)
      : `TDX 認證失敗（${response.status}）`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>).state !== "string") throw new Error("TDX 驗證回應格式無效");
  return payload as TdxStatus;
}

export async function loadTdxRouteMap(fetcher: typeof fetch = fetch): Promise<TdxRouteMapResponse> {
  let cached: { saved_at: number; payload: TdxRouteMapResponse } | null = null;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(TDX_ROUTE_CACHE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object") {
        const row = value as Record<string, unknown>;
        if (typeof row.saved_at === "number" && isTdxRouteMapResponse(row.payload)) cached = { saved_at: row.saved_at, payload: row.payload };
      }
    }
  } catch { /* Private browsing or storage quota must not block route loading. */ }
  if (cached && Date.now() - cached.saved_at < TDX_ROUTE_CACHE_TTL_MS) return cached.payload;
  if (tdxRouteRequest) return tdxRouteRequest;
  const request = (async () => {
    try {
      const response = await fetcher("/api/v1/integrations/tdx/route-map?route_prefix=6670");
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail = payload && typeof payload === "object" ? (payload as Record<string, unknown>).error : null;
        const message = detail && typeof detail === "object" && typeof (detail as Record<string, unknown>).message === "string"
          ? String((detail as Record<string, unknown>).message)
          : `TDX 路線資料讀取失敗（${response.status}）`;
        throw new Error(message);
      }
      if (!isTdxRouteMapResponse(payload)) throw new Error("TDX 路線資料回應格式無效");
      try { if (typeof localStorage !== "undefined") localStorage.setItem(TDX_ROUTE_CACHE_KEY, JSON.stringify({ saved_at: Date.now(), payload })); } catch { /* Rendering continues without persistent cache. */ }
      return payload;
    } catch (error) {
      if (cached) return { ...cached.payload, cache_status: "stale" as const, warnings: [...cached.payload.warnings, "TDX 暫不可用；使用瀏覽器快取的官方路線快照。"] };
      try {
        const snapshotResponse = await fetcher(tdxRouteSnapshotUrl);
        if (!snapshotResponse.ok) throw new Error(`內嵌 TDX 路線快照讀取失敗（${snapshotResponse.status}）`);
        const snapshot: unknown = await snapshotResponse.json();
        if (!isTdxRouteMapResponse(snapshot)) throw new Error("內嵌 TDX 路線快照格式無效");
        return {
          ...snapshot,
          cache_status: "stale" as const,
          warnings: [...snapshot.warnings, "TDX API 暫不可用；使用 2026-10-23 擷取的官方 6670 路線快照，非即時資料。"],
        };
      } catch {
        throw error;
      }
    }
  })();
  tdxRouteRequest = request;
  try {
    return await request;
  } finally {
    if (tdxRouteRequest === request) tdxRouteRequest = null;
  }
}

export function isPublicTimetable(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.dataset_id !== "ntbus-6670-public-timetable-snapshot" ||
    candidate.dataset_status !== "published_snapshot_unverified_for_today" ||
    !Array.isArray(candidate.trips) ||
    candidate.trips.length === 0
  ) return false;
  return candidate.trips.every((item) => {
    if (!item || typeof item !== "object") return false;
    const trip = item as Record<string, unknown>;
    return typeof trip.trip_id === "string" &&
      typeof trip.route_code === "string" &&
      ["taichung_to_sun_moon_lake", "sun_moon_lake_to_taichung"].includes(String(trip.direction)) &&
      Array.isArray(trip.stops) && trip.stops.length >= 2 &&
      trip.stops.every((stop) => !!stop && typeof stop === "object" &&
        typeof (stop as Record<string, unknown>).name === "string" &&
        typeof (stop as Record<string, unknown>).time === "string");
  });
}

export function isAggregatesPayload(value: unknown): value is Aggregates {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.synthetic !== false || !Array.isArray(candidate.years) || candidate.years.length === 0) return false;
  return candidate.years.every((year) => {
    if (!year || typeof year !== "object") return false;
    const row = year as Record<string, unknown>;
    return typeof row.source === "string" && Number.isInteger(row.rows) &&
      Number.isInteger(row.parsed_rows) && ["hour_by_route", "daily", "routes", "top_od", "top_stations", "ticket_types", "card_transaction_frequency", "same_day_return_interval"].every((key) => Array.isArray(row[key]));
  });
}

export async function loadAggregates(
  fallback: Aggregates,
  fetcher: typeof fetch = fetch,
): Promise<{ data: Aggregates; source: AggregateSource }> {
  try {
    const response = await fetcher("/api/v1/datasets/aggregates");
    if (!response.ok) throw new Error(`Aggregate API returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!isAggregatesPayload(payload)) throw new Error("Aggregate API response failed validation");
    return { data: payload, source: "api" };
  } catch {
    return { data: fallback, source: "bundled" };
  }
}

export async function loadTimetable<T extends object>(
  fallback: T,
  fetcher: typeof fetch = fetch,
): Promise<{ data: T; source: AggregateSource }> {
  try {
    const response = await fetcher("/api/v1/timetables/6670");
    if (!response.ok) throw new Error(`Timetable API returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!isPublicTimetable(payload)) throw new Error("Timetable API response failed validation");
    return { data: payload as T, source: "api" };
  } catch {
    return { data: fallback, source: "bundled" };
  }
}

export function isRoadDemoResponse(value: unknown): value is RoadDemoResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.objective !== "operating_cost_min" || !Array.isArray(candidate.results) || candidate.results.length !== 2) return false;
  return candidate.results.every((item) => {
    if (!item || typeof item !== "object") return false;
    const profile = item as Record<string, unknown>;
    if (!profile.result || typeof profile.result !== "object") return false;
    const result = profile.result as Record<string, unknown>;
    return typeof profile.profile_id === "string" &&
      typeof profile.profile_name === "string" &&
      ["optimal", "infeasible", "incomplete_data"].includes(String(result.status)) &&
      result.algorithm === "dijkstra_operating_cost_v1" &&
      (result.cost_minor === null || Number.isInteger(result.cost_minor)) &&
      Array.isArray(result.edge_ids) && Array.isArray(result.node_ids) &&
      Array.isArray(profile.assumptions);
  });
}

export async function loadRoadDemo(fetcher: typeof fetch = fetch): Promise<RoadDemoResponse | null> {
  try {
    const response = await fetcher("/api/v1/road-routes/demo");
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return isRoadDemoResponse(payload) ? payload : null;
  } catch {
    return null;
  }
}
