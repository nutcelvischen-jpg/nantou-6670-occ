import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, BarChart3 } from "lucide-react";

export type ScenarioPanel = "ops" | "fc" | "pk" | "viz" | "opt" | "bot";

// Keep one iframe mounted: navigation must not create a second simulation or lose the current run.
export function TimetableScenarioLab({ onMethod, onOverview, initialPanel, active, requestId }: {
  onMethod: () => void; onOptimize: () => void; onOverview: () => void;
  initialPanel?: ScenarioPanel; active: boolean; requestId: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const send = (payload: object) => frame.current?.contentWindow?.postMessage({ channel: "tanxing-workbench", ...payload }, location.origin);
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.channel === "tanxing-workbench" && event.data.type === "ready") setLoaded(true);
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, []);
  useEffect(() => { if (loaded) send({ type: "visibility", active }); }, [loaded, active]);
  useEffect(() => { if (loaded && initialPanel) send({ type: "panel", panel: initialPanel }); }, [loaded, initialPanel, requestId]);
  return <section className="twin-fullscreen" style={active ? undefined : { display: "none" }} aria-hidden={!active}>
    <nav className="twin-toolbar" aria-label="工作台導覽">
      <span className="twin-wordmark">潭行 <b>6670</b><small>數位孿生 · 票證重播</small></span>
      <div>
        <button onClick={onMethod}><BookOpen size={18}/>公式與方法</button>
        <button onClick={() => send({type: "panel", panel: "opt"})}>班次重排 <ArrowUpRight size={18}/></button>
        <button onClick={onOverview}><BarChart3 size={18}/>分析總覽</button>
      </div>
    </nav>
    {!loaded && <p className="twin-loading" role="status">正在載入 3D 場景…</p>}
    <iframe ref={frame} className="twin-fullscreen-frame" title="6670 數位孿生與票證重播工作台" src="/scenario-lab/index.html" />
  </section>;
}
