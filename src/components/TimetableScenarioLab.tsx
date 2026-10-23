import { useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";

export function TimetableScenarioLab({ onMethod, onOptimize }: { onMethod: () => void; onOptimize: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return <section className="scenario-workspace">
    <header className="page-intro">
      <div><div className="eyebrow">6670 / TIMETABLE SCENARIO LAB</div><h1>班表情境 · 潭行 3D</h1><p>把方向需求、班表與候車放進同一場景，觀察每一次調整的影響。</p></div>
      <a className="secondary-button" href="/scenario-lab/index.html" target="_blank" rel="noreferrer">全螢幕工作台 <ExternalLink size={14}/></a>
    </header>
    <div className="scenario-guide panel">
      <span><b>01</b> 選日期與壅塞情境</span><ArrowRight size={14}/><span><b>02</b> 看方向需求與排隊</span><ArrowRight size={14}/><span><b>03</b> 比較班次建議</span><ArrowRight size={14}/><span><b>04</b> 通過車隊檢查後套用</span>
      <button onClick={onMethod}>公式與假設</button>
    </div>
    <p className="scenario-disclosure">歷史刷卡聚合 × 公開班表快照 × 合成旅客到站。這裡是模擬車況；班次建議採啟發式，未證明最低成本。<button onClick={onOptimize}>進入最低成本求解器 →</button></p>
    {!loaded && <p role="status">正在載入 3D 場景；首次載入需取得 Three.js 繪圖模組。</p>}
    <iframe className="scenario-frame" title="6670 班表情境與三維模擬工作台" src="/scenario-lab/index.html" onLoad={() => setLoaded(true)} />
    <p className="scenario-disclosure">模型、圖表及小幫手共用本工作台的模擬狀態；主站原有數位孿生為另一組情境，設定不互相同步。地形為程序生成，A 線借用線形、F 線延伸與九族位置含近似處理。</p>
  </section>;
}
