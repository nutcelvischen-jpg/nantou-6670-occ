import { useState } from "react";
import { ArrowUpRight, BookOpen, BarChart3 } from "lucide-react";

export type ScenarioPanel = "ops" | "fc" | "pk" | "viz" | "opt" | "bot";

export function TimetableScenarioLab({ onMethod, onOptimize, onOverview, initialPanel }: {
  onMethod: () => void; onOptimize: () => void; onOverview?: () => void; initialPanel?: ScenarioPanel;
}) {
  const [loaded, setLoaded] = useState(false);
  return <section className="twin-fullscreen">
    <nav className="twin-toolbar" aria-label="工作台導覽">
      <span className="twin-wordmark">潭行 <b>6670</b><small>營運情境工作台</small></span>
      <div>
        <button onClick={onMethod}><BookOpen size={18}/>公式與方法</button>
        <button onClick={onOptimize}>最低成本求解 <ArrowUpRight size={18}/></button>
        {onOverview && <button onClick={onOverview}><BarChart3 size={18}/>分析總覽</button>}
      </div>
    </nav>
    {!loaded && <p className="twin-loading" role="status">正在載入 3D 場景…</p>}
    <iframe className="twin-fullscreen-frame" title="6670 班表情境與三維模擬工作台" src={`/scenario-lab/index.html${initialPanel ? `?panel=${initialPanel}` : ""}`} onLoad={() => setLoaded(true)} />
  </section>;
}
