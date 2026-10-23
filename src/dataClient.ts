import type { Aggregates, ScheduleSolution, TripCandidate } from "./domain";
import tdxRouteSnapshotUrl from "./data/tdx-route-map-6670.json?url";

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

export type AssistantMode = "operations" | "traveler";
export type AssistantReply = {
  answer: string;
  mode: AssistantMode;
  engine: "opencode" | "demo" | "demo_fallback";
  data_status: string;
  as_of: string;
  sources: Array<{ id: string; title: string; status: string; status_label: string; as_of: string | null; url: string | null }>;
  tool_calls: string[];
  suggested_actions: string[];
  provider_notice?: string;
  request_id: string;
};

export async function askTransitAssistant(
  input: { message: string; mode: AssistantMode; year: number; route: string },
  fetcher: typeof fetch = fetch,
): Promise<AssistantReply> {
  const response = await fetcher("/api/v1/assistant/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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
    mode: row.mode === "traveler" ? "traveler" : "operations",
    engine: row.engine === "opencode" || row.engine === "demo_fallback" ? row.engine : "demo",
    data_status: String(row.data_status ?? "unknown"),
    as_of: String(row.as_of ?? ""),
    sources,
    tool_calls: Array.isArray(row.tool_calls) ? row.tool_calls.map(String) : [],
    suggested_actions: row.suggested_actions.filter((value): value is string => typeof value === "string"),
    provider_notice: typeof row.provider_notice === "string" ? row.provider_notice : undefined,
    request_id: row.request_id,
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
