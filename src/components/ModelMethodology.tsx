import { ArrowRight, BarChart3, Bus, CheckCircle2, CircleHelp, Database, Leaf, MessageCircle, Route, ShieldCheck, Workflow } from "lucide-react";

type MethodPage = "班表情境" | "運量分析" | "成本最佳化" | "數位孿生" | "智慧小幫手" | "資料品質";

const stages = [
  { title: "資料與情境", body: "票證彙總、公開路線快照、使用者設定", icon: Database },
  { title: "清理與分群", body: "按日期、時段、路線、OD 聚合；保留缺值與品質標記", icon: BarChart3 },
  { title: "預測與最佳化", body: "同星期中位數基線；在服務限制下求最低成本", icon: Workflow },
  { title: "孿生情境回放", body: "固定步進模擬車輛、排隊、載客率與情境指標", icon: Bus },
  { title: "決策與追溯", body: "比較方案、查看來源與假設，再由人員採取行動", icon: CheckCircle2 },
];

function Formula({ children }: { children: string }) { return <code className="method-formula">{children}</code>; }

export function ModelMethodology({ onNavigate }: { onNavigate: (page: MethodPage) => void }) {
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
        <div className="method-card-top"><div className="method-icon green"><BarChart3 size={18}/></div><span className="method-status implemented">已實作基線</span></div>
        <h2>AI 旅運需求預測</h2><p className="method-lead">現階段使用可解釋的同星期中位數基線，為後續引入節慶、天氣、活動與即時客流特徵保留清楚比較基準。</p>
        <div className="method-subhead">預測公式</div><Formula>ŷ(d) = median &#123; y(d−7k) : k=1…4，資料有效 &#125;</Formula>
        <p>對每個目標日，取前 28 個日曆日中相同星期的票證交易數中位數。有效樣本少於 2 筆時不產生預測；資料缺漏保留為缺值，不補成 0。</p>
        <div className="method-subhead">驗證與情境</div><Formula>MAE = Σ|y−ŷ| / n　·　WAPE = Σ|y−ŷ| / Σy</Formula>
        <p>以最後 28 個日曆日作回測集，只用預測日以前資料；MAE 衡量平均筆數誤差，WAPE 衡量相對總量誤差（Σy=0 時不定義）。情境需求為 <Formula>round(ŷ × m)</Formula>，倍率 m 由使用者設定，不由模型臆測。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>票證交易不是完整載客人數。尚未納入節假日、天氣、活動、班次供給及即時刷卡，因此目前是基線模型，不宣稱已訓練 AI。</span></div>
        <button className="method-cta" onClick={() => onNavigate("運量分析")}>開啟運量分析 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card">
        <div className="method-card-top"><div className="method-icon blue"><Database size={18}/></div><span className="method-status privacy">隱私聚合</span></div>
        <h2>尖離峰與電子票證行為</h2><p className="method-lead">先統一交易口徑，再觀察時段、路線、上下車站、票種與卡片交易頻次；所有結果以群體統計呈現。</p>
        <div className="method-subhead">尖離峰衡量</div><Formula>Hₕ = Σᵢ 1(hourᵢ = h)　·　Shareₕ = Hₕ / ΣₕHₕ</Formula>
        <p>每小時交易 Hₕ 由可解析上車時間的交易列計算。晨間尖峰目前定義 06:00–11:59，回程尖峰 15:00–18:59；這是分析切片，不代表所有路線的營運尖峰已校準。</p>
        <div className="method-subhead">行為與回程代理</div><Formula>Fₖ = 該卡有效交易數；　Δt = t回程 − t去程</Formula>
        <p>同卡、同日、反向 OD 且間隔不超過 12 小時的交易配對，作為回程時間代理。配對不等於確定同一旅程或同一乘客行程。</p>
        <div className="method-limits"><ShieldCheck size={14}/><span>卡號只在建置彙總時使用，公開輸出不含卡號；群組小於 k=10 的數值抑制。電子票證不涵蓋完整現金、套票、拒載與未刷卡旅客。</span></div>
        <button className="method-cta" onClick={() => onNavigate("運量分析")}>查看票證視覺化 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card">
        <div className="method-card-top"><div className="method-icon orange"><Route size={18}/></div><span className="method-status assumed">限定候選集合</span></div>
        <h2>車輛與班次最佳化</h2><p className="method-lead">將需求、車輛、班次、服務底線寫成明確限制式；營運成本與旅客票價分成不同目標，避免混成一個分數。</p>
        <div className="method-subhead">營運端：CP-SAT 選班次</div><Formula>min Σᵢ cᵢxᵢ</Formula><Formula>xᵢ∈&#123;0,1&#125;；Σᵢ capᵢxᵢ ≥ ceil(ρD)</Formula>
        <p>若同車候選班次在往返時間與整備時間內重疊，加入 <Formula>xᵢ+xⱼ≤1</Formula>。目前示範服務底線 ρ=0.9，候選車輛、容量、成本及需求映射均為合成值；不含司機工時法規、車庫、充電、路段載客與真實成本。</p>
        <div className="method-subhead">路線端：最小營運成本路徑</div><Formula>Cₑ = km·(能耗·能源單價 + 維修/km) + 時數·工時單價 + 通行費</Formula>
        <p>以 Dijkstra 在可通行圖上最小化 ΣCₑ；同成本時依序偏好較短時間、距離、路段數。只有狀態已驗證且符合車種限制的邊可用。票價則單獨以最低票價路徑計算，受出發時間、轉乘時間、轉乘上限與最晚抵達限制。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>目前路網與候選班次是示範資料；最佳解只對輸入的候選集合成立，不等同全域真實排班最優。</span></div>
        <button className="method-cta" onClick={() => onNavigate("成本最佳化")}>開啟最佳化工作台 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card">
        <div className="method-card-top"><div className="method-icon teal"><Bus size={18}/></div><span className="method-status simulated">離散情境模擬</span></div>
        <h2>即時營運儀表板與數位孿生</h2><p className="method-lead">將車輛、站點排隊、班距與需求假設放進同一模擬時鐘；地圖與 KPI 從同一份狀態更新。</p>
        <div className="method-subhead">車隊與需求規則</div><Formula>Nrequired = ceil((2L/v × 60) / h)　·　λstop = (q/3600 × m × s(hour)) / Nstop</Formula>
        <p>L 為單程長度、v 為平均速度、h 為班距；q 為基礎需求率、m 為情境倍率、s(hour) 為時段係數。每 0.5 秒固定步進一次，模擬時間倍率為 1×/2×/4×；站點採 FIFO 排隊，載客不超過容量，通過中間站依設定比例下車。</p>
        <div className="method-subhead">狀態與碳排</div><Formula>載客率 = 車上人數 / 車輛容量　·　CO₂ = 柴油 km·EFdiesel + 電動 km·kWh/km·EFgrid</Formula>
        <p>車輛位置、排隊與載客 KPI 都由相同的模擬狀態推導。依目前提供的情境參數，柴油公車約 1.172 kg CO₂e/km（一般估算），SORT 1–3 約 1.585–2.123 kg/km；電動公車以 1.53 kWh/km × 臺灣電力係數 0.474 kg/kWh，估為 0.727 kg/km。以 1.172 kg/km 為柴油基準，每公里減量約 0.445 kg；若採 SORT 範圍，減量約 0.858–1.396 kg/km。請依車型、載客、能耗測試及年度電力係數校正後再作正式 ESG 揭露。</p>
        <div className="method-limits"><CircleHelp size={14}/><span>這是可互動的模擬場景，不是即時監控。未接入 GPS／ETA、實際班次與即時載客資料前，不會顯示成已驗證的現況或預測到站時間。</span></div>
        <button className="method-cta" onClick={() => onNavigate("數位孿生")}>進入 3D 數位孿生 <ArrowRight size={15}/></button>
      </article>

      <article className="method-card method-card-assistant">
        <div className="method-card-top"><div className="method-icon purple"><MessageCircle size={18}/></div><span className="method-status privacy">內部營運限定</span></div>
        <h2>營運小幫手的回答範圍</h2><p className="method-lead">小幫手只支援內部人員理解營運資料與模型，不提供旅遊規劃、對外客服或無關一般問答。</p>
        <div className="method-assistant-scopes"><span>需求預測與尖離峰</span><span>票證 OD、頻次與回程代理</span><span>班次配置與成本情境</span><span>儀表板資料狀態與限制</span></div>
        <p>資料型問題先由伺服器選取核准的唯讀彙總，再交由模型整理；最佳化情境使用明確參數與求解器。問題超出範圍時直接說明支援範圍，不呼叫模型或執行任意程式。即時車況因無 GPS／ETA 來源，只會回覆目前無法確認。</p>
        <button className="method-cta" onClick={() => onNavigate("智慧小幫手")}>開啟內部營運小幫手 <ArrowRight size={15}/></button>
      </article>
    </div>

    <article className="method-card" style={{ marginTop: 20 }}>
      <div className="method-card-top"><div className="method-icon teal"><Workflow size={18}/></div><span className="method-status simulated">潭行 3D · 獨立情境工作台</span></div>
      <h2>班表情境：從票證需求到可回放的車隊</h2>
      <p className="method-lead">這個進階工作台使用 2024–2025 年票證彙總與 6670 公開班表快照；班表快照套用到選定日期測試供需，不代表當天真實班表。與上方簡化孿生的步進及參數不同。</p>
      <div className="method-subhead">① 方向需求與可驗證回測</div>
      <Formula>{"z = log(1+y)；β* = argmin Σ(zᵢ−xᵢᵀβ)² + 0.3Σⱼ₌₁ βⱼ²；ŷ = max(0, exp(xᵀβ*)−1)"}</Formula>
      <p>y 是每日、每方向刷卡筆數；x 含截距、年度趨勢、星期、月份、假日與連假特徵（共 24 維），截距不正則化。先擬合後以殘差的 1.4826 × MAD 偵測超過 3.5 倍的異常，移除後重擬合；低運量日不會只因少於 50 筆便遭排除。異常可能是資料缺漏或真實事件，需要人工覆核。</p>
      <Formula>{"WAPE = Σ|y−ŷ| / Σy；MAE = Σ|y−ŷ| / 有效比較日數"}</Formula>
      <p>2025 年 11–12 月採逐日滾動回測：迴歸與近四週同星期中位數基準都只能讀取預測日前資料；基準至少有兩筆歷史值才納入同日評分。另以全資料擬合展示情境，歷史日期的擬合值不能當作當時可得的預測。exp(μ ± 1.2816σ)−1 為訓練殘差參考帶，截零且未校準，不宣稱 80% 預測涵蓋率。</p>
      <div className="method-subhead">② 需求如何進入模擬</div>
      <Formula>{"q(d,h,o,dst) = Y(d,dir) × 時段占比(h|星期,dir) × OD占比(o,dst|dir)；Nminute ~ Poisson(λminute)"}</Formula>
      <p>歷史日使用當日刷卡總數，其他日期使用模型估計；時段與 OD 占比來自聚合資料，因此歷史日回放是事後情境分析。以一分鐘步進處理班表、排隊、上下車、端點整備與空車調度；畫面逐幀沿路線插值。旅客先到先上，每車 43 人，等待超過 90 分鐘離隊。停站時間為 0.4 + 0.05 ×（上車＋下車）分鐘；端點至少整備 10 分鐘。壅塞情境在指定假日方向／時段的國道速度降低 40%。以上均為可檢視的示範假設，尚未經業者校準。</p>
      <div className="method-subhead">③ 班次建議的目標與限制</div>
      <Formula>{"n(h,dir) = max(nmin, ceil(q(h,dir) × rpeak × (1+b) / (43 × Ltarget)))"}</Formula>
      <p>rpeak 是推估車次的最大區段在車量／上車量加權比；b 是需求緩衝，Ltarget 是目標載客率，nmin 是每小時服務底線。僅在現行首末班發車時間內配置，依候選子線模板安排班次；用貪婪串接計算車輛數。若超過車隊上限，優先刪減每班預期負載最低時段，但不低於服務底線。仍不符合上限時明示不可行並禁止套用。</p>
      <p>這是降低閒置供給的啟發式方案，沒有金額成本目標，也不保證最少車輛。目標載客率是計算班數的參數，減班後未必達標；必須查看候車、流失與高載班次。未涵蓋司機工時、車種、車庫、保養、充電及逐 OD 最低服務。要以成本為首要目標，請使用「成本最佳化」頁；其最優性仍限於輸入的示範候選集合。</p>
      <div className="method-subhead">④ 方案比較與資料邊界</div>
      <Formula>{"全日載客率 = 乘客公里 / 座位公里；碳排 = 車公里 × 車型排放係數"}</Formula>
      <p>兩方案各從 05:00 模擬到次日 01:00，比較車公里、候車、未能登車人次與 90 分鐘流失。滿載未上車為重複嘗試人次，不能視為獨立旅客。比較固定現行班表的 OD 服務時窗（首班前 20 分至末班前 5 分）與需求亂數；到站串流獨立於行車，兩方案使用相同生成旅客，減班不會刪掉需求。時窗外未生成的需求不計入，總生成量可能小於日刷卡量。單次結果不構成統計顯著或真實節省效益。</p>
      <p>官網主班表未含完整九人座／加班車；票證以車輛、日期、方向與刷卡間隔重建車次，不能當作實際班次。OD 僅公開至少 10 筆的聚合；刷卡實扣中位數不是公告票價。程序地形並非 DEM；A 線借用線形、F 線延伸與九族定位有近似。示範柴油係數 1.585 kg/km，電巴 1.25 kWh/km × 0.474 kg/kWh，與主站另一組示範參數分開，不跨頁直接比較。2026 年假日尚待核對。</p>
      <button className="method-cta" onClick={() => onNavigate("班表情境")}>依這套方法開始模擬 <ArrowRight size={15}/></button>
    </article>

    <div className="method-footer-note"><Leaf size={15}/><span>每個頁面都會保留資料來源、資料日期與情境假設標示。若真實 GPS、班次、乘載或營運成本資料尚未提供，結果就只能解讀為公開資料或合成情境的分析。</span><button onClick={() => onNavigate("資料品質")}>查看資料品質 <ArrowRight size={13}/></button></div>
  </section>;
}
