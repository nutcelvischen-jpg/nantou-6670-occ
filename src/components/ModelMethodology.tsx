import { ArrowRight, BarChart3, Bus, CheckCircle2, CircleHelp, Database, Leaf, MessageCircle, Route, ShieldCheck, Workflow } from "lucide-react";
import type { ScenarioPanel } from "./TimetableScenarioLab";

type MethodPage = "營運總覽" | "成本最佳化" | "模擬預測" | "行車模擬" | "智慧小幫手" | "資料品質";

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
        <h2>AI 旅運需求預測</h2><p className="method-lead">目前模擬預測頁使用對數 Ridge 迴歸估計每日、每方向刷卡量，並保留同星期中位數作為比較基準。可解釋的特徵與回測，讓模型好壞有依據可查。</p>
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
        <div className="method-card-top"><div className="method-icon teal"><Bus size={18}/></div><span className="method-status simulated">歷史票證重播</span></div>
        <h2>行車模擬：票證重播與班次重排</h2><p className="method-lead">3D、站線圖、甘特圖與指標共用同一天的票證重播。換頁暫停背景，回來保留時間、選車與鏡頭；可定位時間或重播 06:30。</p>
        <Formula>刷卡資料 → 時間品質篩選 → 同車／日期／方向切班 → 站點事件 → 在車量與沿線位置內插</Formula>
        <p>旅次時間 ≤0 或超過 240 分鐘先排除；同車同方向在所有票證下車後 30 分鐘，或相鄰上車間隔超過 3 小時才切段，再合併 ≤4 筆的重疊小片段。2024 年 35,005 段、2025 年 37,520 段；都是票證推估車次，非班次識別碼驗證結果。</p>
        <Formula>票證在車量 Lₖ = Lₖ₋₁ + 上車筆數 Bₖ − 下車筆數 Aₖ</Formula>
        <p>每站事件時刻採最早上車刷卡，無上車採最早下車，並依站序調整為非遞減。兩站間位置沿線形內插；不重建候車、實際延誤或空車移動。行車模擬的站線圖按子線使用 TDX 站序快照；無可用站序的子線退回計費站序。現行站序不是歷史每班停站證明，票價站不能拆成各實體站的旅客數。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>尚有同車推估車次重疊及負在車量，不能據此證明實際滿載；程序地形及部分子線有近似。容量與成本屬情境假設，未接 GPS。</span></div>
        <button className="method-cta" onClick={() => onOpenScenario("ops")}>操作行車模擬 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card method-card-assistant">
        <div className="method-card-top"><div className="method-icon purple"><MessageCircle size={18}/></div><span className="method-status privacy">內部營運限定</span></div>
        <h2>營運小幫手的回答範圍</h2><p className="method-lead">小幫手只支援內部人員理解營運資料與模型，不提供旅遊規劃、對外客服或無關一般問答。</p>
        <div className="method-assistant-scopes"><span>需求預測與尖離峰</span><span>票證 OD、頻次與回程代理</span><span>班次配置與成本情境</span><span>儀表板資料狀態與限制</span></div>
        <p>目前使用 OpenRouter 的 deepseek/deepseek-v4.1-flash-1017。伺服器先提供核准的唯讀彙總及受限的情境計算，再由模型整理。3D 小幫手會傳送經白名單過濾的數值快照，可回答「B03 現在在哪」及票證推估在車量，並標示重播日期、時間與來源；候車及實際延誤沒有觀測值。</p>
        <p>問真實車況時，因未接 GPS／ETA 而明示無法確認；不能把模擬當實況。範圍外問題不呼叫模型，不執行任意程式或實際派車。服務失敗時明確標示本機規則降級，金鑰只放後端。</p>
        <button className="method-cta" onClick={() => onOpenScenario("bot")}>詢問目前的 3D 模擬狀態 <ArrowRight size={15}/></button>
      </article>
    </div>

    <article className="method-card" style={{ marginTop: 20 }}>
      <div className="method-card-top"><div className="method-icon teal"><Workflow size={18}/></div><span className="method-status simulated">潭行 3D · 共用營運情境</span></div>
      <h2>票證重播與班次重排：方法與限制</h2>
      <p className="method-lead">重播採用歷史票證切班資料；預測與重排是獨立分析，調整情境不會改寫原始重播。全站年度總覽保留原始交易口徑，重播先排除時間異常，兩者總筆數不可直接互換。</p>
      <div className="method-subhead">① 方向需求與可驗證回測</div>
      <Formula>{"z = log(1+y)；β* = argmin Σ(zᵢ−xᵢᵀβ)² + 0.3Σⱼ₌₁ βⱼ²；ŷ = max(0, exp(xᵀβ*)−1)"}</Formula>
      <p>y 是每日、每方向刷卡筆數；x 含截距、年度趨勢、星期、月份、假日與連假特徵（共 24 維），截距不正則化。先擬合後以殘差的 1.4826 × MAD 偵測超過 3.5 倍的異常，移除後重擬合；低運量日不會只因少於 50 筆便遭排除。異常可能是資料缺漏或真實事件，需要人工覆核。</p>
      <Formula>{"WAPE = Σ|y−ŷ| / Σy；MAE = Σ|y−ŷ| / 有效比較日數"}</Formula>
      <p>2025 年 11–12 月採逐日滾動回測：迴歸與近四週同星期中位數基準都只能讀取預測日前資料；基準至少有兩筆歷史值才納入同日評分。另以全資料擬合展示情境，歷史日期的擬合值不能當作當時可得的預測。exp(μ ± 1.2816σ)−1 為訓練殘差參考帶，截零且未校準，不宣稱 80% 預測涵蓋率。</p>
      <div className="method-subhead">② 最少車輛：有向無環圖的路徑覆蓋</div>
      <Formula>{"若 depⱼ ≥ arrᵢ + 折返分鐘 + 空駛估計分鐘，建立 i→j；最少車輛 = 車次數 N − 最大二分匹配數 |M|"}</Formula>
      <p>先試同端點銜接，再加入估計空駛可達的銜接。對這張銜接圖，最大匹配求得最少車輛；這不是總成本最低，空駛公里亦未保證最少。空駛時間使用兩年票證站間時間差 P85／中位數作代理，樣本不足退回距離÷45 km/h＋5 分，並非實測空駛。</p>
      <div className="method-subhead">③ 同需求的三欄比較：B／A／H</div>
      <Formula>{"歷史票證基準 → 固定車次重排 → 子線調度方案；已分配 + 未分配 = 原始觀測需求"}</Formula>
      <p>04內有現況診斷、方案比較、方法與假設。B比較43／21座；A以壓力班模板加1班或調時±15分；H在指定方向時窗加0／1／2班。新增班只複製停站與時間，不複製乘客或實扣。需求依OD、原班上車計費站事件時間±窗口、逐段容量貪婪分配；同站或無相容班次保留為未安排，不代表實際拒載。</p>
      <Formula>{"L(j,s)=L(j,s−1)+B(j,s)−A(j,s)；P(j)=max L(j,s)；分配實扣+未分配實扣=原始實扣"}</Formula>
      <p>B換小車不改原始峰值小於10人的比例；應看容量利用與未安排。達到43人與超過43人分開。車型在整條車鏈固定，按車型分區最大匹配；車隊上限與車型台數為硬性檢核，未證明混合車型全域最優。司機含估計空駛駕車、折返不作休息，按端點切分值勤；仍是啟發式，不保證最少司機。</p>
      <div className="method-subhead">④ 成本、服務底線與可追溯參數</div>
      <Formula>{"成本 = Σ車型[(營運+空駛公里)×每公里費率+使用車輛×每日固定費] + 司機試算"}</Formula>
      <p>固定重排與方案採相同成本邊界；方案差額只對固定重排計算。歷史空駛未知，不混稱已實現節省。車型與成本均為假設，預設服務底線100%；未通過時列出時段、端點、車型上限或門檻原因。有限候選的最低試算成本不代表全域最優，找不到配置不等於數學不可行證明。</p>
      <p>車輛甘特圖展示載客、新增班、空駛、折返及可休息區間；方法頁可下載參數、需求版本、源檔SHA與守恆結果。版本dispatch-v1-2026-10-24。舊版crew-reference結果未含空駛駕車，僅作舊版追溯。此版不做E預約、D分段、F截短、CP-SAT或即時派車。</p>
      <p>2025 品質檢查：同車相鄰推估車次重疊 178／25,742 組（0.69%），負在車量 29／37,520 段。全部數值都受切班與站序規則影響。將異常列為查核線索，比直接當成營運缺失更可靠。</p>
      <button className="method-cta" onClick={() => onOpenScenario("opt")}>操作班次情境與方案比較 <ArrowRight size={15}/></button>
    </article>

    <div className="method-footer-note"><Leaf size={15}/><span>每個頁面都會保留資料來源、資料日期與情境假設標示。若真實 GPS、班次、乘載或營運成本資料尚未提供，結果就只能解讀為公開資料或合成情境的分析。</span><button onClick={() => onNavigate("資料品質")}>查看資料品質 <ArrowRight size={13}/></button></div>
  </section>;
}
