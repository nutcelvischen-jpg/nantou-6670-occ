import type { Aggregates } from './domain';
export const availableYears = (data: Aggregates) => [...new Set(data.years.map(r => Number(r.source.slice(0, 4))).filter(Number.isInteger))].sort((a,b)=>a-b);
export const change = (base: number | null, target: number | null) => ({
  base, target, delta: base === null || target === null ? null : target - base,
  percent: base === null || target === null || base === 0 ? null : (target-base)/base*100,
});
export function annualSummary(data: Aggregates, year: number, route = '全部') {
  const row = data.years.find(r => Number(r.source.slice(0,4)) === year);
  if (!row) throw new Error(`尚無 ${year} 年資料`);
  const daily = row.daily.filter(r=>r.date.startsWith(`${year}-`) && Number.isFinite(r.transactions));
  const dates = new Set(daily.map(r=>r.date));
  const expectedDays = (Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  const missingDates = Array.from({length:expectedDays},(_,i)=>new Date(Date.UTC(year,0,1+i)).toISOString().slice(0,10)).filter(d=>!dates.has(d));
  const knownRoute = route === '全部' || row.routes.some(r=>r.route===route);
  const total = !knownRoute ? null : route === '全部' ? daily.reduce((s,r)=>s+r.transactions,0) : row.routes.find(r=>r.route===route)!.transactions;
  const months = Array.from({length:12},(_,i)=>{
    const ds = daily.filter(r=>Number(r.date.slice(5,7))===i+1), observedDays=new Set(ds.map(r=>r.date)).size;
    const count = route === '全部' && observedDays ? ds.reduce((s,r)=>s+r.transactions,0) : null;
    return {month:i+1,total:count,observedDays,expectedDays:new Date(Date.UTC(year,i+1,0)).getUTCDate(),dailyMean:count===null?null:count/observedDays};
  });
  const hourly = Array.from({length:24},(_,hour)=>{
    const count=knownRoute?row.hour_by_route.filter(r=>r.hour===hour&&(route==='全部'||r.route===route)).reduce((s,r)=>s+r.transactions,0):null;
    return {hour,total:count,share:count===null||!total?null:count/total*100};
  });
  const weekdays = Array.from({length:7},(_,i)=>{
    const ds=daily.filter(r=>(new Date(`${r.date}T00:00:00Z`).getUTCDay()+6)%7===i),n=new Set(ds.map(r=>r.date)).size;
    const count=route==='全部'&&n?ds.reduce((s,r)=>s+r.transactions,0):null;
    return {weekday:i,total:count,observedDays:n,dailyMean:count===null?null:count/n};
  });
  return {year,source:row.source,total,observedDays:dates.size,expectedDays,missingDates,
    dailyMean:route==='全部'&&dates.size&&total!==null?total/dates.size:null,months,hourly,weekdays,
    routes:row.routes.map(r=>({...r,share:row.rows?r.transactions/row.rows*100:null})),
    daily: route==='全部'?daily:[],parsedRows:row.parsed_rows};
}
export function buildAnnualComparison(data: Aggregates, baseYear: number, targetYear: number, route='全部') {
  const base=annualSummary(data,baseYear,route),target=annualSummary(data,targetYear,route);
  const baseDates=new Map(base.daily.filter(r=>r.date.slice(5)!=='02-29').map(r=>[r.date.slice(5),r.transactions]));
  const common=target.daily.filter(r=>baseDates.has(r.date.slice(5)));
  const routes=[...new Set([...base.routes,...target.routes].map(r=>r.route))].sort().map(name=>({route:name,...change(base.routes.find(r=>r.route===name)?.transactions??null,target.routes.find(r=>r.route===name)?.transactions??null)}));
  return {baseYear,targetYear,route,unit:'刷卡交易筆數（非獨立旅客、完整運量或營收）',generatedAt:data.generated_at,
    base,target,total:change(base.total,target.total),dailyMean:change(base.dailyMean,target.dailyMean),
    commonCalendar: {days:common.length,...change(common.length?common.reduce((s,r)=>s+baseDates.get(r.date.slice(5))!,0):null,common.length?common.reduce((s,r)=>s+r.transactions,0):null)},
    months:base.months.map((m,i)=>({month:m.month,...change(m.total,target.months[i].total),meanChange:change(m.dailyMean,target.months[i].dailyMean)})),routes,
    limitations:['未出現日期是無紀錄，不能視為零、停駛或已知漏檔原因。','日均量分母為各年度有紀錄日期，不保證相同營運條件。','同月日配對排除2月29日及任一年無紀錄日期，仍未控制星期與假日差異。','子線缺少逐日分布，子線篩選不提供月／星期／日均量。','年度增減是觀察差異；不能單憑票證推論因果、盈虧或調度成效。'],
  };
}
export function comparisonSelection(data: Aggregates, input: {message:string;year:number;compare_year?:number}) {
  const years=availableYears(data),mentioned=[...new Set((input.message.match(/(?<!\d)20\d{2}(?!\d)/g)||[]).map(Number))];
  const missing=mentioned.filter(y=>!years.includes(y));
  const selected=mentioned.length>=2?mentioned.slice(0,2):[input.compare_year??years.filter(y=>y!==input.year).at(-1),input.year];
  return {baseYear:selected[0] as number,targetYear:selected[1] as number,missing};
}
export const isAnnualQuestion=(q:string)=>/年度|年增|同比|去年|前年|比較.*20\d{2}|20\d{2}.*20\d{2}/.test(q);
