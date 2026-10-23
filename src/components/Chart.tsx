import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CanvasRenderer,
]);
// Apply a single readable scale to Canvas labels as well as HTML text.
function readableOption(option: EChartsOption): EChartsOption {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === "fontSize" && typeof item === "number" ? Math.max(16, item) : visit(item),
    ]));
  };
  const result = visit(option) as EChartsOption;
  result.textStyle = { ...result.textStyle, fontSize: 16 };
  for (const key of ["xAxis", "yAxis"] as const) {
    const axes = result[key];
    if (!axes) continue;
    const list = Array.isArray(axes) ? axes : [axes];
    for (const axis of list) {
      axis.axisLabel = { ...axis.axisLabel, fontSize: 16, hideOverlap: true };
      axis.nameTextStyle = { ...axis.nameTextStyle, fontSize: 16 };
    }
  }
  if (result.grid) {
    const grids = Array.isArray(result.grid) ? result.grid : [result.grid];
    for (const grid of grids) grid.containLabel = true;
  }
  return result;
}
export function Chart({
  option,
  className = "chart",
}: {
  option: EChartsOption;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const optionRef = useRef(option);
  optionRef.current = readableOption(option);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: "canvas" });
    chart.setOption(optionRef.current);
    const resize = () => chart.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, []);
  useEffect(() => {
    const c = ref.current ? echarts.getInstanceByDom(ref.current) : undefined;
    c?.setOption(readableOption(option), { notMerge: true });
  }, [option]);
  return (
    <div ref={ref} className={className} role="img" aria-label="資料圖表" />
  );
}
