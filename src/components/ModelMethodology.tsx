import { ArrowRight, BarChart3, Bus, CheckCircle2, CircleHelp, Database, Leaf, MessageCircle, Route, ShieldCheck, Workflow } from "lucide-react";
import type { ScenarioPanel } from "./TimetableScenarioLab";

type MethodPage = "營運總覽" | "成本最佳化" | "數位孿生" | "智慧小幫手" | "資料品質";

const stages = [
  { title: "資料與情境", body: "票證彙總、公開路線快照、使用者設定", icon: Database },
  { title: "清理與分群", body: "按日期、時段、路線、OD 聚合；保留缺值與品質標記", icon: BarChart3 },
  { title: "預測與方案", body: "迴歸與基線比較；班次情境與有限候選成本求解", icon: Workflow },
  { title: "孿生情境回放", body: "固定步進模擬車輛、排隊、載客率與情境指標", icon: Bus },
  { title: "決策與追溯", body: "比較方案、查看來源與假設，再由人員採取行動", icon: CheckCircle2 },
];

function Formula({ children }: { children: string }) { return <code className="method-formula">{children}</code>; }

export function ModelMethodology({ onNavigate, onOpenScenario }: { onNavigate: (page: MethodPage) => void; onOpenScenario: (panel: ScenarioPanel) => void }) {
  return <section className="method-page">
    <header className="page-intro method-hero">
      <div><div className="eyebrow">MODEL LOGIC / DECISION GUIDE</div><h1>模型方法與決策依據</h1><p>從資料如何形成指標，到最佳化如何選方案、孿生如何回放，每一步都列出公式、條件、限制與可操作入口。</p></div>
      <div className="method-trust"><ShieldCheck size={17}/><span><b>公開資料情境示範</b><small>不代表即時 GPS、完整乘客量或真實車隊成本</small></span></div>
    </header>

    <div className="method-flow panel">
      <div className="method-section-heading"><div><div className="eyebrow">END-TO-END LOGIC</div><h2>決策流程</h2></div><span>每個建議都要能回到資料與假設</span></div>
      <div className="method-flow-track">{stages.map(({title, body, icon: Icon}, i) => <div className="method-flow-step" key={title}><div className="method-flow-icon"><Icon size={17}/></div><b>{title}</b><p>{body}</p>{i < stages.length - 1 && <ArrowRight className="method-flow-arrow" size={15}/>}</div>)}</div>
      <div className="method-flow-foot"><span className="method-dot observed"/>觀測資料 <span className="method-dot assumption"/>情境假設 <span className="method-dot derived"/>模型推導 <small>模型輸出是決策參考；執行前需由營運人員覆核。</small></div>
    </div>

    <div className="method-grid">
      <article className="method-card">
        <div className="method-card-top"><div className="method-icon green"><BarChart3 size={18}/></div><span className="method-status implemented">迴歸＋基線回測</span></div>
        <h2>AI 旅運需求預測</h2><p className="method-lead">目前首頁的 3D 工作台使用對數 Ridge 迴歸估計每日、每方向刷卡量，並保留同星期中位數作為比較基準。可解釋的特徵與回測，讓模型好壞有依據可查。</p>
        <div className="method-subhead">3D 工作台的迴歸模型</div><Formula>{"z = log(1+y)；min Σ(z−xᵀβ)² + 0.3Σⱼ≠截距 βⱼ²；ŷ = max(0, exp(xᵀβ)−1)"}</Formula>
        <p>24 個特徵包含趨勢、星期、月份、假日與連假；以 MAD 殘差檢查異常後重估。正則化抑制過大係數，但特徵效果不代表因果關係。</p>
        <div className="method-subhead">比較基準與驗證</div><Formula>ŷ基準(d) = median &#123; y(d−7k) : k=1…4，資料有效 &#125;</Formula><Formula>MAE = Σ|y−ŷ| / n　·　WAPE = Σ|y−ŷ| / Σy</Formula>
        <p>基準少於 2 筆有效樣本時不產生預測。3D 面板以 2025 年 11–12 月逐日回測，兩模型使用相同有效比較日且只訓練此前資料。歷史曲線的全資料擬合與回測分開；分析總覽另保留 28 日基線回測，兩者評分期間不同，不直接混比。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>票證不涵蓋完整乘客量；未納入天氣與即時刷卡。殘差參考帶未校準覆蓋率，2026 假日尚待核對。下方列出完整情境生成公式與假設。</span></div>
        <button className="method-cta" onClick={() => onOpenScenario("fc")}>操作需求預測 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card">
        <div className="method-card-top"><div className="method-icon blue"><Database size={18}/></div><span className="method-status privacy">隱私聚合</span></div>
        <h2>尖離峰與電子票證行為</h2><p className="method-lead">先統一交易口徑，再觀察時段、路線、上下車站、票種與卡片交易頻次；所有結果以群體統計呈現。</p>
        <div className="method-subhead">尖離峰衡量</div><Formula>Hₕ = Σᵢ 1(hourᵢ = h)　·　Shareₕ = Hₕ / ΣₕHₕ</Formula>
        <p>每小時交易 Hₕ 由可解析上車時間的交易列計算。晨間尖峰目前定義 06:00–11:59，回程尖峰 15:00–18:59；這是分析切片，不代表所有路線的營運尖峰已校準。</p>
        <div className="method-subhead">行為與回程代理</div><Formula>Fₖ = 該卡有效交易數；　Δt = t回程 − t去程</Formula>
        <p>同卡、同日、反向 OD 且間隔不超過 12 小時的交易配對，作為回程時間代理。配對不等於確定同一旅程或同一乘客行程。</p>
        <div className="method-limits"><ShieldCheck size={14}/><span>卡號只在建置彙總時使用，公開輸出不含卡號；群組小於 k=10 的數值抑制。電子票證不涵蓋完整現金、套票、拒載與未刷卡旅客。</span></div>
        <button className="method-cta" onClick={() => onOpenScenario("pk")}>操作尖離峰分析 <ArrowRight size={15}/></button>
        <button className="method-cta" onClick={() => onOpenScenario("viz")}>操作票證 OD 視覺化 <ArrowRight size={15}/></button>
        <button className="method-cta" onClick={() => onNavigate("營運總覽")}>查看卡片頻次與回程代理 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card">
        <div className="method-card-top"><div className="method-icon orange"><Route size={18}/></div><span className="method-status assumed">限定候選集合</span></div>
        <h2>車輛與班次最佳化</h2><p className="method-lead">將需求、車輛、班次、服務底線寫成明確限制式；營運成本與旅客票價分成不同目標，避免混成一個分數。</p>
        <div className="method-subhead">營運端：有限候選班次選取</div><Formula>min Σᵢ cᵢxᵢ</Formula><Formula>xᵢ∈&#123;0,1&#125;；Σᵢ capᵢxᵢ ≥ ceil(ρD)</Formula>
        <p>若同車候選班次在往返時間與整備時間內重疊，加入 <Formula>xᵢ+xⱼ≤1</Formula>。目前示範服務底線 ρ=0.9，候選車輛、容量、成本及需求映射均為合成值；不含司機工時法規、車庫、充電、路段載客與真實成本。</p>
        <div className="method-subhead">路線端：最小營運成本路徑</div><Formula>Cₑ = km·(能耗·能源單價 + 維修/km) + 時數·工時單價 + 通行費</Formula>
        <p>以 Dijkstra 在可通行圖上最小化 ΣCₑ；同成本時依序偏好較短時間、距離、路段數。只有狀態已驗證且符合車種限制的邊可用。票價則單獨以最低票價路徑計算，受出發時間、轉乘時間、轉乘上限與最晚抵達限制。</p>
        <p>公開站以全枚舉求有限候選集合內的最低成本；本機 FastAPI 可用 OR-Tools CP-SAT 解同類問題。Dijkstra 道路求解僅在本機 API 可用，公開站尚未部署。3D 班次建議另採啟發式串接，沒有金額成本目標，兩者不可混稱最低成本。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>目前路網與候選班次是示範資料；最佳解只對輸入的候選集合成立，不等同全域真實排班最優。</span></div>
        <button className="method-cta" onClick={() => onNavigate("成本最佳化")}>開啟最佳化工作台 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card">
        <div className="method-card-top"><div className="method-icon teal"><Bus size={18}/></div><span className="method-status simulated">離散情境模擬</span></div>
        <h2>數位孿生與班表情境：同一個工作台</h2><p className="method-lead">3D 車輛、班表、候車與載客指標共用同一個模擬狀態。切換六個分頁不換模型；前往公式或成本分析時暫停背景模擬，返回後保留時間、參數、選車與鏡頭。</p>
        <div className="method-subhead">從需求到車隊的閉環</div><Formula>日期與需求倍率 → 每分鐘旅客 → 班次與 FIFO 上車 → 車輛位置與 KPI → 建議班表 → 同一場景驗證</Formula>
        <p>一分鐘固定步進，每車 43 人、端點整備至少 10 分鐘。需求情境提供 1.00／1.50／0.72／1.28 倍假設，也可在 0.5–2 倍間調整。倍率同步用於旅客生成、班次建議和雙方案比較，不改寫歷史票證圖表與回測。重播保留設定，以相同種子從當日重新計算到 06:30 並暫停；跳時會計算中間事件。</p>
        <div className="method-subhead">狀態與碳排</div><Formula>載客率 = 車上人數 / 43　·　CO₂ = 車公里 × 排放係數</Formula>
        <p>工作台柴油假設 1.585 kg/km；電巴假設 1.25 kWh/km × 0.474 kg/kWh ≈ 0.593 kg/km。這些是固定示範參數，非業者實測或當年度官方係數聲明。其他低碳頁的獨立試算不可直接當作本情境的排放成果。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>這是可互動的模擬場景，不是即時監控。未接入 GPS／ETA、實際班次與即時載客資料前，不會顯示成已驗證的現況或預測到站時間。</span></div>
        <button className="method-cta" onClick={() => onOpenScenario("ops")}>操作目前的 3D 營運工作台 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card method-card-assistant">
        <div className="method-card-top"><div className="method-icon purple"><MessageCircle size={18}/></div><span className="method-status privacy">內部營運限定</span></div>
        <h2>營運小幫手的回答範圍</h2><p className="method-lead">小幫手只支援內部人員理解營運資料與模型，不提供旅遊規劃、對外客服或無關一般問答。</p>
        <div className="method-assistant-scopes"><span>需求預測與尖離峰</span><span>票證 OD、頻次與回程代理</span><span>班次配置與成本情境</span><span>儀表板資料狀態與限制</span></div>
        <p>目前使用 OpenRouter 的 deepseek/deepseek-v4.1-flash-1017。伺服器先提供核准的唯讀彙總及受限的情境計算，再由模型整理。3D 小幫手會傳送經白名單過濾的數值快照，可回答「B03 現在在哪」及排隊、載客、延誤等模擬問題，並標示模擬時間與來源。</p>
        <p>問真實車況時，因未接 GPS／ETA 而明示無法確認；不能把模擬當實況。範圍外問題不呼叫模型，不執行任意程式或實際派車。服務失敗時明確標示本機規則降級，金鑰只放後端。</p>
        <button className="method-cta" onClick={() => onOpenScenario("bot")}>詢問目前的 3D 模擬狀態 <ArrowRight size={15}/></button>
      </article>
    </div>

    <article className="method-card" style={{ marginTop: 20 }}>
      <div className="method-card-top"><div className="method-icon teal"><Workflow size={18}/></div><span className="method-status simulated">潭行 3D · 共用營運情境</span></div>
      <h2>班表情境：從票證需求到可回放的車隊</h2>
      <p className="method-lead">這個進階工作台使用 2024–2025 年票證彙總與 6670 公開班表快照；班表快照套用到選定日期測試供需，不代表當天真實班表。所有操作連回同一個數位孿生；班次建議套用後立即以相同日期與需求重新計算。</p>
      <div className="method-subhead">① 方向需求與可驗證回測</div>
      <Formula>{"z = log(1+y)；β* = argmin Σ(zᵢ−xᵢᵀβ)² + 0.3Σⱼ₌₁ βⱼ²；ŷ = max(0, exp(xᵀβ*)−1)"}</Formula>
      <p>y 是每日、每方向刷卡筆數；x 含截距、年度趨勢、星期、月份、假日與連假特徵（共 24 維），截距不正則化。先擬合後以殘差的 1.4826 × MAD 偵測超過 3.5 倍的異常，移除後重擬合；低運量日不會只因少於 50 筆便遭排除。異常可能是資料缺漏或真實事件，需要人工覆核。</p>
      <Formula>{"WAPE = Σ|y−ŷ| / Σy；MAE = Σ|y−ŷ| / 有效比較日數"}</Formula>
      <p>2025 年 11–12 月採逐日滾動回測：迴歸與近四週同星期中位數基準都只能讀取預測日前資料；基準至少有兩筆歷史值才納入同日評分。另以全資料擬合展示情境，歷史日期的擬合值不能當作當時可得的預測。exp(μ ± 1.2816σ)−1 為訓練殘差參考帶，截零且未校準，不宣稱 80% 預測涵蓋率。</p>
      <div className="method-subhead">② 需求如何進入模擬</div>
      <Formula>{"q(d,h,o,dst) = 需求倍率 m × Y(d,dir) × 時段占比(h|星期,dir) × OD占比(o,dst|dir)；Nminute ~ Poisson(λminute)"}</Formula>
      <p>歷史日使用當日刷卡總數，其他日期使用模型估計；時段與 OD 占比來自聚合資料，因此歷史日回放是事後情境分析。以一分鐘步進處理班表、排隊、上下車、端點整備與空車調度；畫面逐幀沿路線插值。旅客先到先上，每車 43 人，等待超過 90 分鐘離隊。停站時間為 0.4 + 0.05 ×（上車＋下車）分鐘；端點至少整備 10 分鐘。壅塞情境在指定假日方向／時段的國道速度降低 40%。以上均為可檢視的示範假設，尚未經業者校準。</p>
      <div className="method-subhead">③ 班次建議的目標與限制</div>
      <Formula>{"n(h,dir) = max(nmin, ceil(q(h,dir) × rpeak × (1+b) / (43 × Ltarget)))"}</Formula>
      <p>rpeak 是推估車次的最大區段在車量／上車量加權比；b 是需求緩衝，Ltarget 是目標載客率，nmin 是每小時服務底線。僅在現行首末班發車時間內配置，依候選子線模板安排班次；用貪婪串接計算車輛數。若超過車隊上限，優先刪減每班預期負載最低時段，但不低於服務底線。仍不符合上限時明示不可行並禁止套用。</p>
      <p>這是降低閒置供給的啟發式方案，沒有金額成本目標，也不保證最少車輛。目標載客率是計算班數的參數，減班後未必達標；必須查看候車、流失與高載班次。未涵蓋司機工時、車種、車庫、保養、充電及逐 OD 最低服務。要以成本為首要目標，請使用「成本最佳化」頁；其最優性仍限於輸入的示範候選集合。</p>
      <div className="method-subhead">④ 方案比較與資料邊界</div>
      <Formula>{"全日載客率 = 乘客公里 / 座位公里；碳排 = 車公里 × 車型排放係數"}</Formula>
      <p>兩方案各從 05:00 模擬到次日 01:00，比較車公里、候車、未能登車人次與 90 分鐘流失。滿載未上車為重複嘗試人次，不能視為獨立旅客。比較固定現行班表的 OD 服務時窗（首班前 20 分至末班前 5 分）與需求亂數；到站串流獨立於行車，兩方案使用相同生成旅客，減班不會刪掉需求。時窗外未生成的需求不計入，總生成量可能小於日刷卡量。單次結果不構成統計顯著或真實節省效益。</p>
      <p>官網主班表未含完整九人座／加班車；票證以車輛、日期、方向與刷卡間隔重建車次，不能當作實際班次。OD 僅公開至少 10 筆的聚合；刷卡實扣中位數不是公告票價。程序地形並非 DEM；A 線借用線形、F 線延伸與九族定位有近似。示範柴油係數 1.585 kg/km，電巴 1.25 kWh/km × 0.474 kg/kWh，與主站另一組示範參數分開，不跨頁直接比較。2026 年假日尚待核對。</p>
      <button className="method-cta" onClick={() => onOpenScenario("opt")}>操作班次情境與方案比較 <ArrowRight size={15}/></button>
    </article>

    <div className="method-footer-note"><Leaf size={15}/><span>每個頁面都會保留資料來源、資料日期與情境假設標示。若真實 GPS、班次、乘載或營運成本資料尚未提供，結果就只能解讀為公開資料或合成情境的分析。</span><button onClick={() => onNavigate("資料品質")}>查看資料品質 <ArrowRight size={13}/></button></div>
  </section>;
}
