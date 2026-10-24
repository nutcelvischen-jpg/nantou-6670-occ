import { useEffect, useRef, useState } from "react";
import { Activity, BookOpen, BarChart3, Bus } from "lucide-react";

export type ScenarioPanel = "ops" | "fc" | "pk" | "viz" | "opt" | "bot";
type WorkbenchPage = "營運總覽" | "模擬預測" | "行車模擬";
const workbench = [
  { name: "營運總覽", icon: BarChart3 },
  { name: "模擬預測", icon: Activity },
  { name: "行車模擬", icon: Bus },
] as const;

// Both pages share one mounted engine, so moving between them preserves the current run.
export function TimetableScenarioLab({ onMethod, onNavigate, onPanelChange, page, initialPanel, active, requestId }: {
  onMethod: () => void; onNavigate: (page: WorkbenchPage) => void;
  onPanelChange: (panel: ScenarioPanel) => void; page: Exclude<WorkbenchPage, "營運總覽">;
  initialPanel?: ScenarioPanel; active: boolean; requestId: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ active, onPanelChange });
  latest.current = { active, onPanelChange };
  const send = (payload: object) => frame.current?.contentWindow?.postMessage({ channel: "tanxing-workbench", ...payload }, location.origin);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== "tanxing-workbench") return;
      if (event.data.type === "ready") setLoaded(true);
      if (event.data.type === "panelChanged" && latest.current.active && ["ops", "fc", "pk", "viz", "opt", "bot"].includes(event.data.panel)) latest.current.onPanelChange(event.data.panel);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => { if (loaded) send({ type: "visibility", active }); }, [loaded, active]);
  useEffect(() => { if (loaded && initialPanel) send({ type: "panel", panel: initialPanel }); }, [loaded, initialPanel, requestId]);
  return <section className="twin-fullscreen" style={active ? undefined : { display: "none" }} aria-hidden={!active}>
    <nav className="twin-toolbar" aria-label="工作台導覽">
      <span className="twin-wordmark">潭行 <b>6670</b><small>{page}</small></span>
      <div className="workbench-pages">
        {workbench.map(({name, icon: Icon}) => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => onNavigate(name)}><Icon size={18}/>{name}</button>)}
        <button className="workbench-method" onClick={onMethod}><BookOpen size={18}/>公式與方法</button>
      </div>
    </nav>
    {!loaded && <p className="twin-loading" role="status">正在載入工作台…</p>}
    <iframe ref={frame} className="twin-fullscreen-frame" title="6670 模擬預測與行車模擬工作台" src="/scenario-lab/index.html" />
  </section>;
}
