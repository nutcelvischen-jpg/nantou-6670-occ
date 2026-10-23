import { describe, expect, it, vi } from "vitest";
import bundled from "./data/ticket-aggregates.json";
import timetable from "./data/ntbus-6670-timetable.json";
import tdxSnapshot from "./data/tdx-route-map-6670.json";
import { isAggregatesPayload, isPublicTimetable, isRoadDemoResponse, isTdxRouteMapResponse, isFleetOptimizationResponse, loadAggregates, loadTimetable, loadRoadDemo, loadTdxRouteMap, solveFleetMinimumCost } from "./dataClient";

describe("aggregate data client", () => {
  it("accepts the privacy-safe bundled aggregate contract", () => {
    expect(isAggregatesPayload(bundled)).toBe(true);
  });

  it("uses a validated API response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(bundled), { status: 200 }));
    const result = await loadAggregates(bundled, fetcher);
    expect(result.source).toBe("api");
    expect(result.data.years.length).toBe(bundled.years.length);
  });

  it("falls back to bundled data when the API is unavailable or invalid", async () => {
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    const invalid = vi.fn().mockResolvedValue(new Response(JSON.stringify({ synthetic: true, years: [] }), { status: 200 }));
    expect((await loadAggregates(bundled, down)).source).toBe("bundled");
    expect((await loadAggregates(bundled, invalid)).source).toBe("bundled");
  });

  it("loads and validates the official timetable snapshot without making freshness claims", async () => {
    expect(isPublicTimetable(timetable)).toBe(true);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(timetable), { status: 200 }));
    const result = await loadTimetable(timetable, fetcher);
    expect(result.source).toBe("api");
    expect(result.data).toMatchObject({ effective_from: "2024-11-01", fare_status: "not_joined_unverified" });
  });

  it("rejects a fabricated or structurally incomplete timetable", () => {
    expect(isPublicTimetable({ dataset_id: "ntbus-6670-public-timetable-snapshot", trips: [] })).toBe(false);
  });

  it("validates a Dijkstra response contract and degrades cleanly when its API is offline", async () => {
    const fixture = {
      objective: "operating_cost_min",
      results: ["diesel", "electric"].map((id) => ({
        profile_id: id,
        profile_name: id,
        assumptions: [],
        result: { status: "optimal", algorithm: "dijkstra_operating_cost_v1", cost_minor: 100, edge_ids: ["a"], node_ids: ["S", "T"] },
      })),
    };
    expect(isRoadDemoResponse(fixture)).toBe(true);
    expect(isRoadDemoResponse({ objective: "fare_min", results: [] })).toBe(false);
    expect(await loadRoadDemo(vi.fn().mockRejectedValue(new Error("offline")))).toBeNull();
  });

  it("uses the validated CP-SAT fleet result and falls back when the API is offline", async () => {
    const candidates = [
      { id: "large", label: "08:00", hour: 8, capacity: 40, cost: 1000, vehicle: "L-1", variant: "L" },
      { id: "small", label: "08:00", hour: 8, capacity: 20, cost: 500, vehicle: "S-1", variant: "S" },
    ];
    const payload = {
      status: "optimal", algorithm: "OR-Tools CP-SAT", objective_ntd: 1000,
      best_bound_ntd: 1000, absolute_gap_ntd: 0, selected_ids: ["large"],
      demand: 40, served: 40, unserved: 0, optimality_scope: "fixed synthetic set",
    };
    expect(isFleetOptimizationResponse(payload)).toBe(true);
    expect(isFleetOptimizationResponse({ ...payload, algorithm: "not-a-solver" })).toBe(false);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const result = await solveFleetMinimumCost(candidates, 40, 1, fetcher);
    expect(result).toMatchObject({ status: "optimal", solver: "OR-Tools CP-SAT", objective: 1000, selected: [candidates[0]] });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).candidates[0]).toMatchObject({
      departure_minute: 480, turnaround_minutes: 120, cost_ntd: 1000,
    });
    expect(await solveFleetMinimumCost(candidates, 40, 1, vi.fn().mockRejectedValue(new Error("offline")))).toBeNull();
  });

  it("validates official TDX GIS GeoJSON and surfaces safe API errors", async () => {
    const fixture = {
      source: "TDX MOTC",
      synthetic: false,
      route_prefix: "6670",
      retrieved_at: "2026-10-23T00:00:00Z",
      api_family: "Bus v2 InterCity",
      routes: [{ RouteID: "6670" }],
      route_uids: ["THB6670"],
      shapes: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[120.9, 23.9], [121, 24]] } }] },
      stops: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [120.9, 23.9] } }] },
      warnings: [],
    };
    expect(isTdxRouteMapResponse(fixture)).toBe(true);
    expect(isTdxRouteMapResponse({ ...fixture, synthetic: true })).toBe(false);
    expect(isTdxRouteMapResponse(tdxSnapshot)).toBe(true);
    expect(tdxSnapshot.shapes.features).toHaveLength(18);
    expect(tdxSnapshot.stops.features).toHaveLength(846);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    expect((await loadTdxRouteMap(fetcher)).route_uids).toEqual(["THB6670"]);

    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let stored: string | null = null;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    } });
    try {
      const cachedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
      await loadTdxRouteMap(cachedFetch);
      const downFetch = vi.fn().mockRejectedValue(new Error("should not fetch within cache TTL"));
      expect((await loadTdxRouteMap(downFetch)).route_uids).toEqual(["THB6670"]);
      expect(downFetch).not.toHaveBeenCalled();
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }

    const unavailable = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "invalid_client", message: "TDX 憑證驗證失敗。" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(tdxSnapshot), { status: 200 }));
    const degraded = await loadTdxRouteMap(unavailable);
    expect(degraded.cache_status).toBe("stale");
    expect(degraded.shapes.features).toHaveLength(18);
    expect(degraded.warnings.some((warning) => warning.includes("2026-10-23"))).toBe(true);
  });

  it("shares an in-flight official route request between GIS mounts", async () => {
    const fixture = {
      source: "TDX MOTC", synthetic: false, route_prefix: "6670",
      retrieved_at: "2026-10-23T00:00:00Z", api_family: "Bus v2 InterCity",
      routes: [{ RouteID: "6670" }], route_uids: ["THB6670"],
      shapes: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[120.9, 23.9], [121, 24]] } }] },
      stops: { type: "FeatureCollection", features: [] }, warnings: [],
    };
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    const first = loadTdxRouteMap(fetcher);
    const second = loadTdxRouteMap(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify(fixture), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { route_uids: ["THB6670"] },
      { route_uids: ["THB6670"] },
    ]);
  });
});
