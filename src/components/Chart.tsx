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
export function Chart({
  option,
  className = "chart",
}: {
  option: EChartsOption;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const optionRef = useRef(option);
  optionRef.current = option;
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
    c?.setOption(option, { notMerge: true });
  }, [option]);
  return (
    <div ref={ref} className={className} role="img" aria-label="資料圖表" />
  );
}
