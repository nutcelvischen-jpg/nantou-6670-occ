/* Pure selectors: replay time is the sole clock; units are minutes, people, cents. */
export function controlTripAt(trips, minute) {
  return trips.find(t => t.dep <= minute && minute < t.arr) || null;
}
export function controlLoad(trip, minute, planned = false) {
  if (!trip || minute < trip.dep || minute >= trip.arr) return 0;
  if (!planned) return (trip.ev || []).filter(e => e.t <= minute).at(-1)?.load || 0;
  let i = -1;
  for (let k = 0; k < trip.stops.length; k++) if (trip.stops[k].t <= minute) i = k;
  return i < 0 ? 0 : trip.loads[i] || 0;
}
export function controlRows(trips, result) {
  if (result) return result.blocks.map(b => ({...b, planned: true}));
  const groups = new Map();
  for (const t of trips) { if (!groups.has(t.bus)) groups.set(t.bus, []); groups.get(t.bus).push(t); }
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([id, ts])=>({id,planned:false,trips:[...ts].sort((a,b)=>a.dep-b.dep),segments:ts.map(t=>({kind:'trip',start:t.dep,end:t.arr,trip:t.id,route:t.code}))}));
}
export function controlEvents(trips, result) {
  if (result) return [
    ...result.issues.map((i,n)=>({id:'issue-'+n,kind:'constraint',minute:i.minute??null,trip:i.trip||null,label:i.message,source:'方案檢核',endpoint:i.endpoint})),
    ...result.changes.map((c,n)=>({id:'change-'+n,kind:'change',minute:c.minute,trip:c.trip,label:c.action,source:'方案變更'})),
    ...result.ledger.filter(l=>l.unassigned).map((l,n)=>({id:'demand-'+n,kind:'demand',minute:l.hour*60,trip:null,route:l.route,label:`${l.route} ${l.unassigned} 筆未安排 · ${({same_station:'同站OD',missing_anchor:'缺時間錨點',capacity:'容量不足',no_compatible_trip:'無相容班次'}[l.reason]||'待核對')}`,source:'OD配置／非實際拒載'}))
  ];
  return trips.flatMap(t=>{
    const cap=t.code==='6670E'?9:43;
    if(t.peak<cap && t.ok!==false) return [];
    return [{id:'observed-'+t.id,kind:t.ok===false?'data':'capacity',minute:(t.ev||[]).find(e=>e.load>=cap)?.t??t.dep,trip:t.id,route:t.code,label:t.ok===false?'時間／站位不足，無法還原動畫':`${t.code} 票證峰值 ${t.peak}／${cap}座假設 · ${t.peak>cap?'超出':'達到'}設定容量`,source:'票證推估＋容量假設'}];
  });
}
