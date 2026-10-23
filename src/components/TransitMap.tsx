import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type {
  GeoJSONSource,
  Map as MLMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, LineString, Point } from "geojson";
import { loadTdxRouteMap, loadTdxStatus, type TdxRouteMapResponse, type TdxStatus } from "../dataClient";
maplibregl.setWorkerUrl(maplibreWorkerUrl);
const emptyPoints: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };
const stops = [
  {
    id: "taichung-hsr",
    name: "高鐵臺中站",
    coord: [120.615, 24.112] as [number, number],
    kind: "hub",
  },
  {
    id: "puli",
    name: "埔里轉運站",
    coord: [120.969, 23.966] as [number, number],
    kind: "transfer",
  },
  {
    id: "ncnu",
    name: "暨南大學",
    coord: [120.932, 23.948] as [number, number],
    kind: "stop",
  },
  {
    id: "nine",
    name: "九族文化村",
    coord: [120.934, 23.873] as [number, number],
    kind: "poi",
  },
  {
    id: "sml",
    name: "日月潭站",
    coord: [120.918, 23.866] as [number, number],
    kind: "hub",
  },
  {
    id: "xiangshan",
    name: "向山遊客中心",
    coord: [120.908, 23.853] as [number, number],
    kind: "poi",
  },
];
const line: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { route: "6670 示意拓樸" },
      geometry: { type: "LineString", coordinates: stops.map((s) => s.coord) },
    },
  ],
};
const point: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: stops.map((s) => ({
    type: "Feature",
    properties: { ...s },
    geometry: { type: "Point", coordinates: s.coord },
  })),
};
type ProjectedOverlay = {
  width: number;
  height: number;
  paths: string[];
  stops: Array<{ x: number; y: number; name: string; kind: string; selectId: string | null }>;
};

const knownStopId = (name: string, sourceId?: string) => {
  if (sourceId && ["taichung-hsr", "puli", "ncnu", "nine", "sml", "xiangshan"].includes(sourceId)) return sourceId;
  if (name.includes("埔里")) return "puli";
  if (name.includes("暨南")) return "ncnu";
  if (name.includes("九族")) return "nine";
  if (name.includes("向山")) return "xiangshan";
  if (name.includes("日月潭")) return "sml";
  if (name.includes("高鐵") || name.includes("臺中站")) return "taichung-hsr";
  return null;
};
export function TransitMap({
  selected,
  onSelect,
  showDemand = true,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  showDemand?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<MLMap | null>(null),
    onSelectRef = useRef(onSelect);
  const tdxRouteRef = useRef<TdxRouteMapResponse | null>(null);
  const [tdxRoute, setTdxRoute] = useState<TdxRouteMapResponse | null>(null);
  const [tdxStatus, setTdxStatus] = useState<TdxStatus | null>(null);
  const [tdxLoading, setTdxLoading] = useState(false);
  const [tdxError, setTdxError] = useState<string | null>(null);
  const [mapRenderState, setMapRenderState] = useState<"loading" | "ready" | "error">("loading");
  const [mapFallback, setMapFallback] = useState(false);
  const [projectedOverlay, setProjectedOverlay] = useState<ProjectedOverlay | null>(null);
  onSelectRef.current = onSelect;
  tdxRouteRef.current = tdxRoute;
  useEffect(() => {
    let active = true;
    void loadTdxStatus().then((status) => { if (active) setTdxStatus(status); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const loadOfficialRoute = async () => {
    setTdxLoading(true);
    setTdxError(null);
    try {
      const result = await loadTdxRouteMap();
      if (!result.shapes.features.length) throw new Error("TDX 沒有回傳 6670 線形；示意地圖仍保留。");
      setTdxRoute(result);
      setTdxStatus({ state: "connected", reason_code: null, message: "已載入 TDX 官方路線資料。" });
    } catch (error) {
      setTdxError(error instanceof Error ? error.message : "TDX 路線資料目前無法載入。");
      try { setTdxStatus(await loadTdxStatus()); } catch { /* Keep the last known status. */ }
    } finally {
      setTdxLoading(false);
    }
  };
  // The public official route is cached for six hours by loadTdxRouteMap. Load it
  // as soon as the GIS panel mounts so the first view shows the real corridor;
  // the schematic remains visible if the service is unavailable.
  useEffect(() => {
    void loadOfficialRoute();
  }, []);
  useEffect(() => {
    if (!el.current) return;
    const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
    let style: maplibregl.StyleSpecification | string =
      "https://demotiles.maplibre.org/style.json";
    if (key)
      style =
        "https://api.maptiler.com/maps/streets-v4/style.json?key=" +
        encodeURIComponent(key);
    const m = new maplibregl.Map({
      container: el.current,
      style,
      center: [120.87, 23.94],
      zoom: 9.45,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = m;
    let mapHasLoaded = false;
    let triedDemoFallback = false;
    m.on("error", () => {
      // Never surface raw MapTiler URLs: they may contain the browser map key.
      if (!mapHasLoaded && key && !triedDemoFallback) {
        triedDemoFallback = true;
        setMapFallback(true);
        setMapRenderState("loading");
        m.setStyle("https://demotiles.maplibre.org/style.json");
        return;
      }
      setMapRenderState("error");
    });
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    m.on("style.load", () => {
      mapHasLoaded = true;
      setMapRenderState("ready");
      const initialLine = tdxRouteRef.current?.shapes as FeatureCollection<LineString> | undefined;
      const initialStops = tdxRouteRef.current?.stops as FeatureCollection<Point> | undefined;
      m.addSource("route-schematic", { type: "geojson", data: initialLine ?? line });
      m.addLayer({
        id: "route-schematic-line",
        type: "line",
        source: "route-schematic",
        paint: {
          "line-color": "#167861",
          "line-width": 4,
          "line-dasharray": initialLine ? [1, 0.0001] : [2, 1],
          "line-opacity": 0.72,
        },
      });
      m.addSource("stops", { type: "geojson", data: initialStops ?? point });
      m.addLayer({
        id: "stop-circles",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["match", ["get", "kind"], "hub", 8, "poi", 6, 5],
          "circle-color": [
            "match",
            ["get", "kind"],
            "hub",
            "#137d65",
            "poi",
            "#d59a43",
            "#fff",
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.98,
        },
      });
      m.addLayer({
        id: "stop-labels",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#213b37",
          "text-halo-color": "#f4f5f1",
          "text-halo-width": 2,
        },
      });
      m.addSource("tdx-stops", { type: "geojson", data: initialStops ?? emptyPoints });
      m.addLayer({
        id: "tdx-stop-circles",
        type: "circle",
        source: "tdx-stops",
        layout: { visibility: initialStops ? "visible" : "none" },
        paint: { "circle-radius": 4, "circle-color": "#3d8aa1", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
      });
      m.addLayer({
        id: "tdx-stop-labels",
        type: "symbol",
        source: "tdx-stops",
        layout: { visibility: initialStops ? "visible" : "none", "text-field": ["get", "stop_name"], "text-size": 10, "text-offset": [0, 1.15], "text-anchor": "top", "text-allow-overlap": false },
        paint: { "text-color": "#246679", "text-halo-color": "#fff", "text-halo-width": 2 },
      });
      if (initialStops) {
        m.setLayoutProperty("stop-circles", "visibility", "none");
        m.setLayoutProperty("stop-labels", "visibility", "none");
      }
      m.on("click", "stop-circles", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(String(id));
      });
      m.on(
        "mouseenter",
        "stop-circles",
        () => (m.getCanvas().style.cursor = "pointer"),
      );
      m.on(
        "mouseleave",
        "stop-circles",
        () => (m.getCanvas().style.cursor = ""),
      );
      if (!initialLine && line.features.length) {
        const coordinates = line.features.flatMap((feature) => feature.geometry.coordinates);
        const bounds = coordinates.reduce(
          (current, coordinate) => current.extend(coordinate as [number, number]),
          new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]),
        );
        m.fitBounds(bounds, { padding: 55, maxZoom: 8.7, duration: 0 });
      }
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const routeSource = m.getSource("route-schematic") as GeoJSONSource | undefined;
    const stopSource = m.getSource("tdx-stops") as GeoJSONSource | undefined;
    if (!routeSource || !stopSource) return;
    const official = tdxRoute?.shapes as FeatureCollection<LineString> | undefined;
    const officialStops = tdxRoute?.stops as FeatureCollection<Point> | undefined;
    routeSource.setData(official ?? line);
    stopSource.setData(officialStops ?? emptyPoints);
    m.setPaintProperty("route-schematic-line", "line-dasharray", official ? [1, 0.0001] : [2, 1]);
    m.setLayoutProperty("stop-circles", "visibility", official ? "none" : "visible");
    m.setLayoutProperty("stop-labels", "visibility", official ? "none" : "visible");
    m.setLayoutProperty("tdx-stop-circles", "visibility", official ? "visible" : "none");
    m.setLayoutProperty("tdx-stop-labels", "visibility", official ? "visible" : "none");
    if (official && official.features.length) {
      const coordinates = official.features.flatMap((feature) => feature.geometry.coordinates);
      const bounds = coordinates.reduce(
        (current, coordinate) => current.extend(coordinate as [number, number]),
        new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]),
      );
      m.fitBounds(bounds, { padding: 45, maxZoom: 11, duration: 500 });
    }
  }, [tdxRoute]);
  useEffect(() => {
    const m = map.current;
    const container = el.current;
    if (!m || !container) return;
    let frame = 0;
    const updateProjection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const activeLines = tdxRouteRef.current?.shapes ?? line;
        const activeStops = tdxRouteRef.current?.stops ?? point;
        const paths = activeLines.features.map((feature) => {
          const coords = feature.geometry.coordinates;
          return coords.map((coord, index) => {
            const px = m.project(coord as [number, number]);
            return `${index === 0 ? "M" : "L"}${px.x.toFixed(1)},${px.y.toFixed(1)}`;
          }).join(" ");
        }).filter(Boolean);
        const stopFeatures = [...activeStops.features];
        if (tdxRouteRef.current) {
          stopFeatures.sort((a, b) => Number(a.properties?.stop_sequence ?? 0) - Number(b.properties?.stop_sequence ?? 0));
        }
        const stopStride = Math.max(1, Math.ceil(stopFeatures.length / (tdxRouteRef.current ? 42 : 12)));
        const projectedStops = stopFeatures.filter((_, index) => index % stopStride === 0 || index === stopFeatures.length - 1).map((feature) => {
          const px = m.project(feature.geometry.coordinates as [number, number]);
          const properties = feature.properties as Record<string, unknown>;
          const name = String(properties.stop_name ?? properties.name ?? "站點");
          return {
            x: px.x,
            y: px.y,
            name,
            kind: String(properties.kind ?? "stop"),
            selectId: knownStopId(name, typeof properties.id === "string" ? properties.id : undefined),
          };
        });
        setProjectedOverlay({ width: rect.width, height: rect.height, paths, stops: projectedStops });
      });
    };
    m.on("move", updateProjection);
    m.on("moveend", updateProjection);
    m.on("zoomend", updateProjection);
    m.on("resize", updateProjection);
    m.on("style.load", updateProjection);
    const observer = new ResizeObserver(updateProjection);
    observer.observe(container);
    updateProjection();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      m.off("move", updateProjection);
      m.off("moveend", updateProjection);
      m.off("zoomend", updateProjection);
      m.off("resize", updateProjection);
      m.off("style.load", updateProjection);
    };
  }, [tdxRoute]);
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource("stops") as GeoJSONSource | undefined;
    if (source && !tdxRoute) source.setData(point);
  }, [selected, showDemand, tdxRoute]);
  return (
    <div className="map-shell">
      <div ref={el} className="map-canvas" />
      {projectedOverlay && (
        <svg
          className={`map-schematic-overlay ${tdxRoute ? "is-official" : "is-schematic"}`}
          viewBox={`0 0 ${projectedOverlay.width} ${projectedOverlay.height}`}
          role="img"
          aria-label={tdxRoute ? "TDX 官方公車路線與代表站點" : "公車路線與代表站點示意"}
        >
          {projectedOverlay.paths.map((path, index) => (
            <path key={`route-${index}`} d={path} />
          ))}
          {projectedOverlay.stops.map((stop, index) => (
            <g
              key={`stop-${index}`}
              className={stop.selectId ? "map-stop-hit-area" : undefined}
              role={stop.selectId ? "button" : undefined}
              tabIndex={stop.selectId ? 0 : undefined}
              aria-label={stop.selectId ? `選取${stop.name}` : undefined}
              onClick={stop.selectId ? (event) => { event.stopPropagation(); onSelectRef.current(stop.selectId!); } : undefined}
              onKeyDown={stop.selectId ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectRef.current(stop.selectId!);
                }
              } : undefined}
            >
              <circle cx={stop.x} cy={stop.y} r={stop.kind === "hub" ? 7 : 5} />
              {(!tdxRoute || index % 3 === 0 || index === projectedOverlay.stops.length - 1) && <text x={stop.x + 8} y={stop.y - 8}>{stop.name}</text>}
            </g>
          ))}
        </svg>
      )}
      <div className="map-caption">
        <span className="caption-dot" />
        {tdxRoute ? "TDX 官方 6670 線形與站牌" : "6670 路線拓樸示意"} <span className="caption-sep">·</span>{" "}
        {tdxRoute ? `${tdxRoute.routes.length} 路線 · ${tdxRoute.shapes.features.length} 線段` : "地理點位未經業者核對"}
      </div>
      <div className="map-tdx-control">
        <button onClick={() => void loadOfficialRoute()} disabled={tdxLoading}>
          {tdxLoading ? "載入 TDX 中…" : tdxRoute ? "重新載入官方線形" : "載入 TDX 官方線形"}
        </button>
        <span>{tdxStatus?.state === "not_configured" ? "後端尚未設定憑證" : tdxStatus?.state === "not_checked" ? "OAuth 尚未驗證" : tdxStatus?.state === "not_connected" ? "TDX 未連線" : tdxStatus?.state === "connected" ? "TDX 已驗證" : "僅點擊時連線"}</span>
        {tdxError && <small role="status">{tdxError}</small>}
      </div>
      {!import.meta.env.VITE_MAPTILER_KEY && (
        <div className="map-provider">MapTiler 金鑰未設定，使用示範底圖</div>
      )}
      {mapRenderState === "loading" && (
        <div className="map-provider map-render-state" role="status">地圖底圖載入中…</div>
      )}
      {mapRenderState === "error" && (
        <div className="map-provider map-render-warning" role="status">
          地圖底圖或圖層載入異常；請檢查網路與 MapTiler 金鑰網域限制。
        </div>
      )}
      {mapFallback && mapRenderState === "ready" && (
        <div className="map-provider map-render-fallback" role="status">
          MapTiler 無法載入，已改用示範底圖；請確認金鑰網域限制。
        </div>
      )}
    </div>
  );
}
