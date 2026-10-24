import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Database } from 'lucide-react';
import type { ScenarioPanel } from './TimetableScenarioLab';
import './design-logic.css';

const dataFlow = `flowchart TD
 Y24["2024 年票證資料"]:::core --> Q["01 檢查資料品質與統計口徑"]
 Y25["2025 年票證資料"]:::core --> Q
 Q --> F["02 聚合：日期 × 子線 × 時段 × 起訖站"]
 F --> A["03 看懂差異\n年度・尖離峰・票種"]
 F --> B["04 預測需求\n時間特徵・歷史回測"]
 F --> C["05 還原行程\n推估車次・在車量"]
 S["補充：公開路線與站序"]:::extra -.-> C
 A --> D["06 提出方案，再比較成本與服務"]:::result
 B --> D
 C --> D
 D --> H["07 說明依據與限制，由人員核對決策"]:::result
 classDef core fill:#dce9d8,stroke:#3d6651,color:#203f31,stroke-width:2px
 classDef extra fill:#f8eee0,stroke:#99784f,color:#644823
 classDef result fill:#e8eeeb,stroke:#577d70,color:#203f31`;
const scenarioFlow = `flowchart TD
 D["固定同一日、同一批觀測需求"] --> B["歷史票證基準／固定車次重排"]
 B --> S["產生候選：B 換車型・A 調時或加班・H 加班"]
 S --> C["檢查：起訖、時間、容量、車隊與司機門檻"]
 C --> R["比較成本、已安排與未安排需求"]
 R --> E["呈現代價與未滿足條件，人工核對"]`;
function MermaidDiagram({code, label, summary}: {code:string;label:string;summary:string}) {
  const host=useRef<HTMLDivElement>(null),id=useId().replace(/[^a-zA-Z0-9]/g,'');
  const [status,setStatus]=useState('loading');
  useEffect(()=>{let cancelled=false;
    void import('mermaid').then(async({default:mermaid})=>{
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:'system-ui, sans-serif',themeVariables:{fontSize:'18px',primaryColor:'#f4f6f0',primaryTextColor:'#243f32',primaryBorderColor:'#829586',lineColor:'#718579'},flowchart:{htmlLabels:false,curve:'linear',useMaxWidth:false,nodeSpacing:28,rankSpacing:36,padding:16}});
      const {svg}=await mermaid.render('logic'+id,code);
      if(!cancelled&&host.current){host.current.innerHTML=svg;setStatus('ready');}
    }).catch(()=>{if(!cancelled)setStatus('error');});
    return()=>{cancelled=true;};
  },[code,id]);
  return <figure className="logic-figure">
    <div className="logic-diagram-scroll" tabIndex={0} role="region" aria-label={label+'，窄螢幕可左右捲動'}>
      <div ref={host} className="logic-diagram" role="img" aria-label={label}/>
      {status!=='ready'&&<p role="status">{status==='loading'?'正在繪製流程圖…':'流程圖暫時無法載入，請閱讀下方文字流程。'}</p>}
    </div>
    <figcaption>{summary}</figcaption>
    <details><summary>查看 Mermaid 原始碼（課堂可重用）</summary><pre>{code}</pre></details>
  </figure>;
}
export function DesignLogic({onNavigate,onOpenScenario}:{onNavigate:(page:'營運總覽'|'使用說明'|'模型方法'|'智慧小幫手'|'資料品質')=>void;onOpenScenario:(p:ScenarioPanel)=>void}) {
 return <article className="design-logic">
  <header className="logic-hero">
   <p className="logic-eyebrow"><BookOpen size={19}/> 學生導覽 · 設計邏輯</p>
   <h1>從兩年的票證資料，<br/>長出有依據的營運服務。</h1>
   <p className="logic-lead">這個專案的起點，是 2024、2025 年臺灣好行 6670 電子票證資料。我們先問資料能回答什麼，再選擇分析、預測與模擬方法，最後讓使用者看懂方案的代價與取捨。</p>
   <div className="logic-actions"><button onClick={()=>onNavigate('營運總覽')}>進入營運總覽 <ArrowRight size={18}/></button><a href="#data-to-service">從資料走到服務 ↓</a></div>
  </header>
  <section className="logic-data" aria-labelledby="core-data">
   <div><p className="logic-eyebrow"><Database size={18}/> 核心資料</p><h2 id="core-data">同一路線，兩個年度。</h2><p>範圍為 6670 系列與 A／B／D／E／F／H 子線；不能代表全南投公車。</p></div>
   <div className="logic-year"><span>2024</span><strong>875,149 <small>筆交易</small></strong><p>有紀錄 361／366 日</p></div>
   <div className="logic-year"><span>2025</span><strong>925,761 <small>筆交易</small></strong><p>有紀錄 364／365 日</p></div>
   <p className="logic-source">來源：2024年_6670刷卡資料.xlsx、2025年_6670刷卡資料.xlsx；畫面使用專案聚合資料。交易筆數不等於獨立旅客，缺日不自動補零。原始逐筆資料與卡號不在此頁提供下載。</p>
  </section>
  <section className="logic-section" id="data-to-service">
   <p className="logic-eyebrow">01 / 整體流程</p><h2>資料先行，方法跟著問題走。</h2>
   <p>實線是主要處理流程，虛線是補充資料。3D 用來幫助理解路線與時間；預測與最佳化仍要靠明確的資料、演算法和檢核。</p>
   <MermaidDiagram code={dataFlow} label="兩年票證資料延伸到營運決策的流程" summary="讀圖順序：兩年資料 → 品質檢查 → 聚合 → 差異分析／預測／行程還原 → 方案比較 → 人工核對。"/>
  </section>
  <section className="logic-section">
   <p className="logic-eyebrow">02 / 從欄位延伸服務</p><h2>每項服務，都要能回頭找到資料。</h2>
   <div className="logic-services">
   {[
    {n:'01',title:'年度差異與尖離峰',input:'日期、上車時間、子線、票種、實扣金額',method:'按年、月、星期與小時聚合；比較總量、占比及有紀錄日均量。',value:'辨識需求集中時段與子線變化，作為進一步調查的起點。',limit:'看見差異不等於知道原因；票種增減不能直接證明政策效果。',action:'查看營運總覽',go:()=>onNavigate('營運總覽')},
    {n:'02',title:'AI 旅運需求預測',input:'每日、方向別刷卡需求，加上星期、月份與假日特徵',method:'使用迴歸模型預測，與歷史基準比較；逐日回測只用當日前的資料。',value:'協助預先辨識需求高低，以 WAPE、MAE 檢查是否值得採用。',limit:'預測是估計；參考帶尚未校準，不能保證未來結果。',action:'開啟需求預測',go:()=>onOpenScenario('fc')},
    {n:'03',title:'GIS 與行車重播',input:'刷卡時間、上下車計費站與車輛代碼，補充路線及站序',method:'依規則切分推估車次，累積上下車量，將時間沿路線內插成位置。',value:'把抽象紀錄轉成地圖、站線圖與甘特圖，方便理解車輛與時間的關係。',limit:'票證在車量不涵蓋所有支付方式；內插位置不是即時 GPS。',action:'開啟行車模擬',go:()=>onOpenScenario('ops')},
    {n:'04',title:'車輛與班次方案比較',input:'同一營運日的觀測需求，加上容量、車隊及成本假設',method:'產生少量候選班表，分配需求並檢查服務、車輛串接與司機門檻。',value:'讓使用者同時看到成本與未安排需求，理解方案取捨。',limit:'候選比較不等於全域最優；所有數字需附日期及參數。',action:'比較班次方案',go:()=>onOpenScenario('opt')},
   ].map(s=><section className="logic-service" key={s.n}><div className="logic-service-title"><span>{s.n}</span><h3>{s.title}</h3></div><dl><dt>資料</dt><dd>{s.input}</dd><dt>方法</dt><dd>{s.method}</dd><dt>好處</dt><dd>{s.value}</dd><dt>限制</dt><dd>{s.limit}</dd></dl><button onClick={s.go}>{s.action} <ArrowRight size={17}/></button></section>)}
   </div>
  </section>
  <section className="logic-section">
   <p className="logic-eyebrow">03 / 把「最佳化」說清楚</p><h2>同一批需求，才能公平比較。</h2>
   <div className="logic-comparison"><MermaidDiagram code={scenarioFlow} label="班次候選比較與限制檢核流程" summary="第一版枚舉少量候選，以相同需求與成本邊界比較；無法安排的需求必須保留。"/>
   <div className="logic-explain"><h3>先定限制，再談成本最低。</h3><p>班次要涵蓋起訖站、符合允許改搭時間，且每個路段都要有剩餘容量。車輛還要能接續下一班，司機必須通過設定門檻。</p><div className="logic-equation">觀測需求<br/>＝ 已安排需求 ＋ 未安排需求</div><p><strong>例子：B 線換成 21 座。</strong>若人數與班次不變，「少於 10 人」的比例不變。應該比較座位利用率、容量不足與成本；成本參數也要有來源或標示假設。</p><p><strong>例子：H 線加一班。</strong>固定需求分到更多班，平均每班人數可能下降；新增班次不能連同原班旅客與實扣金額一起複製。</p><p>方案增量成本優先與「固定車次重排」比較。排不出來就說明原因，不把「不增車」當成預先保證的成果。</p><button onClick={()=>onOpenScenario('opt')}>帶著問題實際比較 <ArrowRight size={17}/></button></div></div>
  </section>
  <section className="logic-section">
   <p className="logic-eyebrow">04 / 正確解讀</p><h2>看到一個數字，先問它是哪一種。</h2>
   <div className="logic-levels">{[['觀測','原始刷卡欄位及其聚合','例如：年度交易筆數'],['推估','依規則還原未直接記錄的狀態','例如：車次、在車量、位置'],['預測','模型對未來需求的估計','例如：未來每日刷卡需求'],['情境','指定參數下的候選結果','例如：換車型後的成本']].map(([a,b,c])=><div key={a}><h3>{a}</h3><p>{b}</p><span>{c}</span></div>)}</div>
   <div className="logic-assistant"><h3>內部小幫手：讓使用者問得懂、查得到。</h3><p>小幫手協助解釋網站的資料、公式、年度差異與方案條件，回答必須依據可查詢資料和既有計算。它不能把未知的 GPS、候車人數或延誤狀態編成答案。</p><button onClick={()=>onNavigate('智慧小幫手')}>問小幫手資料怎麼來 <ArrowRight size={17}/></button></div>
  </section>
  <section className="logic-section">
   <p className="logic-eyebrow">05 / 學生延伸題</p><h2>想做新服務，先列出還缺什麼資料。</h2>
   <div className="logic-table-wrap"><table><thead><tr><th>服務構想</th><th>目前資料可支持</th><th>下一步需要補充</th></tr></thead><tbody>
    <tr><th>尖峰運能提醒</th><td>歷史時段分布、需求預測、推估容量壓力</td><td>實際班表、車型容量與候車／未上車紀錄</td></tr>
    <tr><th>即時到站與異常提醒</th><td>路線結構與歷史行程參考</td><td>即時 GPS、到站預估、營運事件與更新頻率</td></tr>
    <tr><th>觀光接駁建議</th><td>計費站間 OD 與時間分布</td><td>景點、開放時間、轉乘班表及旅遊意圖調查</td></tr>
    <tr><th>低碳車隊評估</th><td>車次與里程推估</td><td>實際油耗／耗電、能源係數及車型成本</td></tr>
   </tbody></table></div>
   <p className="logic-note">以上是服務延伸方向，不代表已具備完整資料或已證明成效。新增年度也要先確認欄位與口徑一致，才能加入跨年比較。</p>
  </section>
  <section className="logic-assignment"><p className="logic-eyebrow">動手做 / 一個問題，一條證據鏈</p><h2>選一條子線，提出一個可驗證的改善方案。</h2><ol><li>先指出哪個年度、時段或站點有值得調查的差異。</li><li>列出用到的欄位，區分觀測、推估與假設。</li><li>設定一個候選方案，以及不能犧牲的服務條件。</li><li>比較前後結果，解釋代價、限制與需要補的資料。</li></ol><div className="logic-actions"><button onClick={()=>onNavigate('營運總覽')}>開始探索資料 <ArrowRight size={18}/></button><button className="logic-secondary" onClick={()=>onNavigate('使用說明')}>閱讀操作手冊</button><button className="logic-secondary" onClick={()=>onNavigate('模型方法')}>查閱公式與方法</button></div></section>
 </article>;
}
