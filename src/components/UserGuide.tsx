import {useState} from 'react';
import type {ScenarioPanel} from './TimetableScenarioLab';
import guide from '../../shared/site-guide.json';
export function UserGuide({onNavigate,onOpenScenario}:{onNavigate:(page:string)=>void;onOpenScenario:(panel:ScenarioPanel)=>void}) {
 const panels:Record<string,ScenarioPanel>={replay:'ops',forecast:'fc',peak:'pk',tickets:'viz',optimizer:'opt'};
 const openSection=(id:string,page:string)=>{
  if(panels[id]) onOpenScenario(panels[id]);
  else onNavigate(page.startsWith('營運總覽')?'營運總覽':page.startsWith('智慧小幫手')?'智慧小幫手':page==='成本最佳化'?page:'模型方法');
 };
 const [query,setQuery]=useState('');
 const sections=guide.sections.filter(s=>JSON.stringify(s).toLowerCase().includes(query.toLowerCase()));
 return <section className="user-guide"><div className="page-intro"><div><div className="eyebrow">USER GUIDE · DATA DICTIONARY</div><h1>使用說明與數據字典</h1><p>從第一次操作，到公式、來源與限制。與小幫手共用同一份知識。</p></div></div>
 <div className="panel guide-start"><b>建議順序</b><p>年度差異 → 票證口徑 → 單日重播 → 需求預測 → 班次重排 → 核對限制</p><a href="/manual/index.html" target="_blank" rel="noreferrer">開啟圖文手冊與拍攝分鏡 ↗</a> · <a href="/manual/潭行Twin_使用手冊.pdf" target="_blank" rel="noreferrer">下載 PDF</a></div>
 <label className="guide-search">搜尋頁面、指標或公式<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：日均、值勤、車上人數"/></label>
 {sections.map(s=><details className="panel guide-section" key={s.id} open={query?true:undefined}><summary>{s.title}<small>{s.page}</small></summary><p>{s.purpose}</p><h3>怎麼操作</h3><ol>{s.steps.map(x=><li key={x}>{x}</li>)}</ol><h3>數據如何產生</h3><ul>{s.metrics.map(x=><li key={x}>{x}</li>)}</ul><h3>為什麼採用這個方法</h3><p>{s.why}</p><h3>解讀限制</h3><ul>{s.limits.map(x=><li key={x}>{x}</li>)}</ul><small>程式／資料依據：{s.sources.join('、')}</small><div className="guide-actions"><button className="button-primary" onClick={()=>openSection(s.id,s.page)}>前往功能</button><button className="button-secondary" onClick={()=>onNavigate('智慧小幫手')}>問小幫手</button></div></details>)}
 {!sections.length&&<p>沒有找到相符項目，試試頁名或指標名稱。</p>}</section>;
}
