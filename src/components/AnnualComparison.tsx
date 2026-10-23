import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { ArrowRight, ArrowLeftRight, MessageCircleMore, Download } from 'lucide-react';
import type { Aggregates } from '../domain';
import { availableYears, buildAnnualComparison } from '../annualComparison';
import { Chart } from './Chart';
import './annual-comparison.css';
const nf=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
const num=(v:number|null)=>v===null?'—':nf.format(v);
const signed=(v:number|null)=>v===null?'無法比較':`${v>0?'+':''}${nf.format(v)}`;
const pct=(v:number|null)=>v===null?'基期為零或無資料':`${v>0?'+':''}${v.toFixed(1)}%`;
const colors=['#849caf','#39765d'];
function pairChart(labels:string[], a:(number|null)[], b:(number|null)[], years:number[], unit:string, type:'line'|'bar'='line'): EChartsOption {
  return {color:colors,animationDuration:300,textStyle:{fontFamily:'system-ui',fontSize:13},tooltip:{trigger:'axis',valueFormatter:v=>typeof v==='number'?`${v.toLocaleString('zh-TW',{maximumFractionDigits:1})} ${unit}`:'無紀錄'},legend:{top:0,data:years.map(String),textStyle:{fontSize:14}},grid:{top:48,left:65,right:25,bottom:40},xAxis:{type:'category',data:labels,axisLine:{lineStyle:{color:'#dbe4df'}},axisLabel:{fontSize:12}},yAxis:{type:'value',min:0,name:unit,nameTextStyle:{align:'left'},axisLabel:{formatter:v=>v>=10000?`${v/10000}萬`:String(v)},splitLine:{lineStyle:{color:'#edf0eb'}}},series:[a,b].map((values,i)=>({name:String(years[i]),type,data:values,connectNulls:false,symbol:i?'circle':'emptyCircle',symbolSize:7,lineStyle:{width:3,type:i?'solid':'dashed'},barMaxWidth:24}))};
}
export function AnnualComparison({data,mode,baseYear,targetYear,onYears,onAsk,onNavigate}:{data:Aggregates;mode:'overview'|'analysis';baseYear:number;targetYear:number;onYears:(base:number,target:number)=>void;onAsk:(question:string)=>void;onNavigate:()=>void}) {
 const [monthlyMetric,setMonthlyMetric]=useState<'total'|'dailyMean'>('total');
 const [hourMetric,setHourMetric]=useState<'total'|'share'>('share');
 const c=useMemo(()=>buildAnnualComparison(data,baseYear,targetYear),[data,baseYear,targetYear]);
 const years=availableYears(data),pair=[baseYear,targetYear],overview=mode==='overview';
 const monthLabels=Array.from({length:12},(_,i)=>`${i+1}月`);
 const routeRows=[...c.routes].sort((a,b)=>(b.delta??-Infinity)-(a.delta??-Infinity));
 const monthly=pairChart(monthLabels,c.base.months.map(m=>m[monthlyMetric]),c.target.months.map(m=>m[monthlyMetric]),pair,monthlyMetric==='total'?'筆':'筆／有紀錄日');
 const hourly=pairChart(Array.from({length:24},(_,i)=>String(i).padStart(2,'0')),c.base.hourly.map(h=>h[hourMetric]),c.target.hourly.map(h=>h[hourMetric]),pair,hourMetric==='total'?'筆':'占全年交易 %');
 const routeDelta:EChartsOption={tooltip:{trigger:'axis',valueFormatter:v=>typeof v==='number'?`${signed(v)} 筆`:'無資料'},grid:{left:75,right:80,top:20,bottom:30},xAxis:{type:'value',splitNumber:3,axisLabel:{hideOverlap:true,formatter:v=>Math.abs(v)>=10000?`${v/10000}萬`:String(v)}},yAxis:{type:'category',inverse:true,data:routeRows.map(r=>r.route)},series:[{type:'bar',data:routeRows.map(r=>({value:r.delta,itemStyle:{color:r.delta!==null&&r.delta<0?'#b58465':'#39765d'}})),barMaxWidth:24,label:{show:true,position:'right',formatter:p=>signed(typeof p.value==='number'?p.value:null)}}]};
 const exportData=()=>{const rows=[['metric','base_year','target_year','base','target','delta','percent'],['total',baseYear,targetYear,c.total.base,c.total.target,c.total.delta,c.total.percent],['daily_mean',baseYear,targetYear,c.dailyMean.base,c.dailyMean.target,c.dailyMean.delta,c.dailyMean.percent],...c.months.map(m=>[`month_${m.month}`,baseYear,targetYear,m.base,m.target,m.delta,m.percent]),...c.routes.map(r=>[r.route,baseYear,targetYear,r.base,r.target,r.delta,r.percent])];const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(v=>v??'').join(',')).join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`6670_${baseYear}_${targetYear}_年度比較.csv`;a.click();URL.revokeObjectURL(url);};
 const question=`請比較 ${baseYear} 與 ${targetYear} 年的票證年度差異：總量、日均量、月變化與子線貢獻，並說明缺日限制。`;
 return <section className="annual-dashboard">
  <header className="annual-heading"><div><h1>{overview?'營運總覽':'運量分析'}</h1><p>{overview?'從年度變化，看見需求移動。':'拆開月份、星期與時段，理解年度差異。'}</p></div><button className="annual-ask" onClick={()=>onAsk(question)}><MessageCircleMore size={18}/>請小幫手解讀差異</button></header>
  <div className="annual-toolbar"><div className="annual-years"><label>基準年<select aria-label="比較基準年" value={baseYear} onChange={e=>onYears(+e.target.value,targetYear)}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><button aria-label="交換比較年度" onClick={()=>onYears(targetYear,baseYear)}><ArrowLeftRight size={17}/></button><label>比較年<select aria-label="比較年度" value={targetYear} onChange={e=>onYears(baseYear,+e.target.value)}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><span>6670 全部子線 · 刷卡交易</span></div><button className="annual-export" onClick={exportData}><Download size={16}/>匯出比較</button></div>
  {baseYear===targetYear&&<p className="annual-coverage">目前選擇相同年度，差異為零；可選擇另一年比較。</p>}
  <div className="annual-kpis">
   <article><span>年度交易總量</span><strong>{num(c.target.total)}<small> 筆</small></strong><div><i className="annual-dot target"/>{targetYear}<b>{pct(c.total.percent)}</b></div><p>{baseYear}：{num(c.base.total)} 筆 · 差異 {signed(c.total.delta)}</p></article>
   <article><span>有紀錄日的日均量</span><strong>{num(c.target.dailyMean)}<small> 筆／日</small></strong><div><i className="annual-dot target"/>{targetYear}<b>{pct(c.dailyMean.percent)}</b></div><p>{baseYear}：{num(c.base.dailyMean)} 筆／日 · 不含無紀錄日</p></article>
   <article className="annual-coverage-card"><span>資料涵蓋日期</span>{[c.base,c.target].map((r,i)=><div className="annual-coverage-row" key={`${r.year}-${i}`}><b>{r.year}</b><div><i style={{width:`${r.observedDays/r.expectedDays*100}%`,background:colors[i]}}/></div><strong>{r.observedDays}<small>/{r.expectedDays} 日</small></strong></div>)}<p>無紀錄 {c.base.missingDates.length}／{c.target.missingDates.length} 日，不自動補零。</p></article>
  </div>
  <div className="annual-grid">
   <article className="annual-panel annual-wide"><div className="annual-panel-head"><div><h2>每月交易趨勢</h2><p>同月並列；有缺日的月份，總量與日均量需一起看。</p></div><select aria-label="月趨勢指標" value={monthlyMetric} onChange={e=>setMonthlyMetric(e.target.value as 'total'|'dailyMean')}><option value="total">月交易總量</option><option value="dailyMean">有紀錄日均量</option></select></div><Chart option={monthly} className="annual-chart"/><details><summary>查看每月數值與涵蓋日期</summary><div className="annual-table-wrap"><table><thead><tr><th>月份</th><th>{baseYear} 筆數／日數</th><th>{targetYear} 筆數／日數</th><th>總量增減</th></tr></thead><tbody>{c.months.map((m,i)=><tr key={m.month}><th>{m.month}月</th><td>{num(m.base)}／{c.base.months[i].observedDays}日</td><td>{num(m.target)}／{c.target.months[i].observedDays}日</td><td>{pct(m.percent)}</td></tr>)}</tbody></table></div></details></article>
   <article className="annual-panel"><div className="annual-panel-head"><div><h2>子線交易增減</h2><p>{targetYear} − {baseYear} · 絕對筆數，非成效評分</p></div></div><Chart option={routeDelta} className="annual-chart"/><p className="annual-note">各子線差異加總＝{signed(c.total.delta)} 筆。這是總量的組成變化，不代表原因。</p></article>
   {!overview&&<><article className="annual-panel annual-wide"><div className="annual-panel-head"><div><h2>24 小時需求分布</h2><p>先比較占比，辨識時段移動；再切換交易量。</p></div><select aria-label="小時比較指標" value={hourMetric} onChange={e=>setHourMetric(e.target.value as 'total'|'share')}><option value="share">年度占比 %</option><option value="total">年度交易筆數</option></select></div><Chart option={hourly} className="annual-chart"/></article>
   <article className="annual-panel"><div className="annual-panel-head"><div><h2>星期別日均交易</h2><p>各星期交易總量 ÷ 該星期有紀錄日期數</p></div></div><Chart option={pairChart(['一','二','三','四','五','六','日'],c.base.weekdays.map(w=>w.dailyMean),c.target.weekdays.map(w=>w.dailyMean),pair,'筆／日','bar')} className="annual-chart"/></article></>}
  </div>
  <div className="annual-bottom"><div><b>解讀前先確認比較口徑</b><p>交易筆數不等於獨立旅客、完整運量或營收。兩年同月日都有紀錄的 {c.commonCalendar.days} 日，交易量差異為 {pct(c.commonCalendar.percent)}；排除 2/29，仍未控制星期與假日組成。</p></div><button onClick={onNavigate}>{overview?'深入運量分析':'返回營運總覽'}<ArrowRight size={17}/></button></div>
  <details className="annual-source"><summary>資料來源、缺日與新增年度方式</summary><p>來源：{c.base.source}、{c.target.source}；聚合產製時間 {c.generatedAt}。本頁從匿名聚合計算，小幫手在伺服器重新計算相同口徑，不相信用戶傳入的總量。</p><p>{baseYear} 無紀錄：{c.base.missingDates.join('、')||'無'}。{targetYear} 無紀錄：{c.target.missingDates.join('、')||'無'}。原因待核對，不能推論停駛。</p><p>新年度需完成相同格式的資料聚合與品質檢查，再更新資料並部署；年份選項由資料自動產生，不會捏造未匯入年度。</p></details>
 </section>;
}
