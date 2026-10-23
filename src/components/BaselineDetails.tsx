import {useState} from 'react';
import type {EChartsOption} from 'echarts';
import snapshot from '../data/baseline-dashboard.json';
import type {Aggregates} from '../domain';
import {annualSummary} from '../annualComparison';
import {pairChart} from './AnnualComparison';
import {Chart} from './Chart';
const n=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('zh-TW',{maximumFractionDigits:1});
const category=(s:string)=>s==='定期／TPASS'?'定期類（關鍵字分組）':s;
export function BaselineDetails({data,baseYear,targetYear,onAsk}:{data:Aggregates;baseYear:number;targetYear:number;onAsk:(q:string)=>void}){
 const [route,setRoute]=useState('6670D');
 const [stationMode,setStationMode]=useState<'boardings'|'alightings'>('boardings');
 const [categoryMode,setCategoryMode]=useState<'transactions'|'actual_sum'>('transactions');
 const [showOD,setShowOD]=useState(false);
 const b=snapshot.years.find(y=>y.year===baseYear),t=snapshot.years.find(y=>y.year===targetYear);
 const pair=[baseYear,targetYear];
 const routes=[...new Set(data.years.flatMap(y=>y.routes.map(r=>r.route)))].sort();
 const hours=[annualSummary(data,baseYear,route),annualSummary(data,targetYear,route)];
 const horiz=(labels:string[],a:(number|null)[],z:(number|null)[],unit:string):EChartsOption=>({color:['#849caf','#39765d'],tooltip:{trigger:'axis',valueFormatter:v=>typeof v==='number'?`${n(v)} ${unit}`:'未列入此年摘要'},legend:{top:0},grid:{left:125,right:28,top:44,bottom:35},xAxis:{type:'value',splitNumber:3,axisLabel:{hideOverlap:true,formatter:v=>v>=10000?`${v/10000}萬`:String(v)}},yAxis:{type:'category',inverse:true,data:labels,axisLabel:{fontSize:12}},series:[a,z].map((values,i)=>({name:String(pair[i]),type:'bar',data:values,barMaxWidth:15}))});
 const rows=t?.routes??[];
 const labels=t?.stations.slice(0,6).map(s=>s.name)??[];
 const cats=t?.categories.map(c=>c.category)??[];
 const od=t?.od.slice(0,6)??[];
 const months=(y:typeof b)=>Array.from({length:12},(_,i)=>{if(!y)return null;const key=`${route}|${y.year}-${String(i+1).padStart(2,'0')}`;return (y.route_month as Record<string,number|null|undefined>)[key]??null;});
 return <div className="baseline-details annual-dashboard">
 <section id="baseline-routes" className="baseline-section"><div className="baseline-heading"><div><span>02 / 子線</span><h2>交易量往哪些子線移動？</h2><p>以下選單只影響本區的單線月趨勢與時段圖，其餘章節維持全部子線。</p></div><label>探索子線<select aria-label="探索單一子線" value={route} onChange={e=>setRoute(e.target.value)}>{routes.map(r=><option key={r}>{r}</option>)}</select></label></div>
 <div className="annual-grid"><article className="annual-panel"><h3>{route} · 每月交易</h3><Chart className="annual-chart" option={pairChart(Array.from({length:12},(_,i)=>`${i+1}月`),months(b),months(t),pair,'筆')}/><p className="annual-note">未列入的子線月份保留缺值；少於 10 筆不顯示但仍計入年總量，不能據此判定停駛或開通日期。</p></article><article className="annual-panel"><h3>{route} · 24 小時交易</h3><Chart className="annual-chart" option={pairChart(Array.from({length:24},(_,i)=>String(i).padStart(2,'0')),hours[0].hourly.map(h=>h.total),hours[1].hourly.map(h=>h.total),pair,'筆')}/><p className="annual-note">各年度按上車刷卡小時加總；不是單班人數。</p></article></div>
 {b&&t&&<details><summary>六個子線的總量、占比與差異</summary><div className="annual-table-wrap"><table><thead><tr><th>子線</th><th>{baseYear} 筆數</th><th>{targetYear} 筆數</th><th>差異</th><th>{targetYear} 占比</th></tr></thead><tbody>{rows.map(r=>{const prev=b.routes.find(x=>x.route===r.route);return <tr key={r.route}><th>{r.route}</th><td>{n(prev?.transactions)}</td><td>{n(r.transactions)}</td><td>{prev?n(r.transactions-prev.transactions):'—'}</td><td>{(r.transactions/t.rows*100).toFixed(2)}%</td></tr>})}</tbody></table></div><p>小基期子線應同看絕對筆數。票證增加不能單獨證明加班、分流或政策效果。</p></details>}
 </section>
 {!b||!t?<section className="annual-panel"><h2>補充基線尚未匯入此比較年度</h2><p>上方交易比較仍依原資料計算。站點、OD 與實扣金額需要該年度相同格式的基線聚合，不能拿其他年份替代。</p></section>:<>
 <section id="baseline-flows" className="baseline-section"><div className="baseline-heading"><div><span>03 / 站點與起訖</span><h2>旅次集中在哪裡？</h2><p>沿用原始計費站名；「臺中」不直接改稱特定火車站，站群亦不等於實體站牌。</p></div><button onClick={()=>onAsk(`比較 ${baseYear} 與 ${targetYear} 年主要計費站與 OD 的交易差異，請說明資料涵蓋與限制。`)}>詢問站點差異 ↗</button></div>
 <div className="annual-grid"><article className="annual-panel"><div className="annual-panel-head"><h3>主要計費站 · 年度比較</h3><select aria-label="計費站統計口徑" value={stationMode} onChange={e=>setStationMode(e.target.value as typeof stationMode)}><option value="boardings">上車交易</option><option value="alightings">下車交易</option></select></div><Chart className="annual-chart" option={horiz(labels,labels.map(name=>b.stations.find(s=>s.name===name)?.[stationMode]??null),labels.map(name=>t.stations.find(s=>s.name===name)?.[stationMode]??null),'筆')}/><p className="annual-note">以 {targetYear} 上車量前六站固定排序；各年度站點摘要外的資料顯示缺值。</p></article>
 <article className="annual-panel"><h3>主要 OD · 年度比較</h3><Chart className="annual-chart" option={{...horiz(od.map(o=>`${o.origin} → ${o.destination}`),od.map(o=>b.od.find(x=>x.origin===o.origin&&x.destination===o.destination)?.transactions??null),od.map(o=>o.transactions),'筆'),grid:{left:180,right:22,top:44,bottom:35}}}/><p className="annual-note">以 {targetYear} 前六大起訖排序，跨年查找各年前十大摘要。上車多於下車不能單憑票證判定騎車、纜車或觀光目的。</p></article></div>
 <button className="baseline-detail-toggle" aria-expanded={showOD} onClick={()=>setShowOD(!showOD)}>{showOD?'收起':'查看'} {targetYear} 前十大 OD 與刷卡時間差</button>
 {showOD&&<div className="annual-table-wrap annual-panel"><table><thead><tr><th>計費起訖</th><th>交易筆數</th><th>占比</th><th>時間差中位數</th><th>P85</th><th>實扣中位數</th></tr></thead><tbody>{t.od.map(o=><tr key={o.origin+o.destination}><th>{o.origin} → {o.destination}</th><td>{n(o.transactions)}</td><td>{o.share_pct}%</td><td>{n(o.median_duration_min)} 分</td><td>{n(o.p85_duration_min)} 分</td><td>{n(o.median_actual_fare)} 元</td></tr>)}</tbody></table><p className="annual-note">{snapshot.duration_definition} 交易筆數包含所有原始紀錄，時間差分位數使用上述範圍內的子集合；實扣中位數不是現行公告票價，也不能保證高鐵轉乘。</p></div>}
 </section>
 <section id="baseline-fares" className="baseline-section"><div className="baseline-heading"><div><span>04 / 票種與金額</span><h2>交易結構與實扣金額一起看</h2><p>金額是資料欄位加總，不等於完整營收、已核付補貼或獲利。</p></div></div>
 <div className="annual-grid"><article className="annual-panel"><h3>年度金額欄位比較</h3><Chart className="annual-chart" option={pairChart(['交易實扣','原始票價','優惠額度'],[b.actual_sum,b.original_sum,b.discount_quota_sum],[t.actual_sum,t.original_sum,t.discount_quota_sum],pair,'元','bar')}/><div className="baseline-fare-summary"><strong>{targetYear} 平均每筆實扣 {n(t.actual_sum/t.rows)} 元</strong><span>{baseYear}：{n(b.actual_sum/b.rows)} 元 · 分母為原始交易筆數</span></div><p className="annual-note">三個欄位不相加成營收；差額不能直接解釋為政府清分。實扣超過原始票價的紀錄：{baseYear} {b.quality.actual_gt_original} 筆、{targetYear} {t.quality.actual_gt_original} 筆，留待業務核對。</p></article>
 <article className="annual-panel"><div className="annual-panel-head"><h3>票種文字分組</h3><select aria-label="票種比較指標" value={categoryMode} onChange={e=>setCategoryMode(e.target.value as typeof categoryMode)}><option value="transactions">交易筆數</option><option value="actual_sum">實扣金額</option></select></div><Chart className="annual-chart" option={horiz(cats.map(category),cats.map(c=>b.categories.find(x=>x.category===c)?.[categoryMode]??null),cats.map(c=>t.categories.find(x=>x.category===c)?.[categoryMode]??null),categoryMode==='transactions'?'筆':'元')}/><p className="annual-note">按原始票種文字分組，非身分辨識；定期類不全等於 TPASS，增減不直接證明政策效果。</p></article></div>
 <details><summary>檢視金額數值與票種分組規則</summary><div className="annual-table-wrap"><table><thead><tr><th>年度</th><th>交易實扣</th><th>原始票價</th><th>優惠額度</th></tr></thead><tbody>{[b,t].map((y,i)=><tr key={i}><th>{y.year}</th><td>{n(y.actual_sum)} 元</td><td>{n(y.original_sum)} 元</td><td>{n(y.discount_quota_sum)} 元</td></tr>)}</tbody></table></div><p>{snapshot.category_definition}</p></details>
 </section>
 <section id="baseline-quality" className="baseline-section baseline-quality"><div className="baseline-heading"><div><span>05 / 解讀與品質</span><h2>哪些是資料，哪些仍待確認？</h2></div></div><div className="baseline-quality-grid"><div><b>保留交易口徑</b><p>原始交易尚未去重。{baseYear}／{targetYear} 疑似重複為 {b.quality.duplicate_rows}／{t.quality.duplicate_rows} 筆，依卡號、上車時間、子線、上下站與實扣組合判定，並非已證實錯誤。</p></div><div><b>車程異常分開處理</b><p>超過六小時：{b.quality.over_6h}／{t.quality.over_6h} 筆；同計費站上下車：{n(b.quality.same_station)}／{n(t.quality.same_station)} 筆。這些紀錄仍納入交易總量；不擅自解釋原因。</p></div><div><b>尚不能回答的問題</b><p>缺日原因、真正班次數、同時在車人數、滿載率與政策因果，不能由這一頁直接證明。歷史票證與模擬車況分開解讀。</p></div></div>
 <details><summary>資料來源與計算依據</summary><p>來源：{b.source}、{t.source}。交易核心聚合與 EDA 摘要交叉對帳；只輸出允許的彙總欄位。補充摘要版本：{snapshot.source_sha256.slice(0,12)}。</p><p>基線報告提供分析題目；畫面數值以原始資料聚合為準。無紀錄日不當作已證實營運日或停駛日；卡片頻次不代表旅客身分。</p></details></section>
 </>}
 </div>;
}
