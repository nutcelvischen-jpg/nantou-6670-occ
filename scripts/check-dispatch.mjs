import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as THREE from 'three';
const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const inputs = ['src/a_geo.js','parts/utils.js','src/d_sim.js','src/d_replay.js','src/e_forecast.js','src/f_opt.js'];
const names = {agg:'ops-aggregates',route:'route-6670',tt:'timetable-6670',rp:'replay-all',dh:'driver-headway-compact',fuel:'fuel-price'};
const data = Object.fromEntries(Object.entries(names).map(([k,f])=>[k,JSON.parse(read(`scenario-lab/data/${f}.json`))]));
const ctx = vm.createContext({THREE,window:{__DATA:data},console});
const geo=read('scenario-lab/src/a_geo.js').replace(/^import .*;\n/gm,'').replace('/*__UTILS__*/',read('scenario-lab/parts/utils.js'));
vm.runInContext(geo+'\nfor(const f of Object.values(FACS)) f.slots=[];\n'+inputs.slice(2).map(f=>read('scenario-lab/'+f).replace('JSON.parse(await gunzipB64(DATA.rpz))','null')).join('\n'),ctx);

const od=JSON.parse(read('scenario-lab/data/demand-od-time.json'));
const types=JSON.parse(read('scenario-lab/data/vehicle-types.json')).types;
const spec0=JSON.parse(read('scenario-lab/data/scenario-spec.json'));
const {runComparison}=await import('../scenario-lab/dispatch-model.js');
const deps=vm.runInContext('({minFleet,dhT,dhKm:dhKmOf,dutyCost})',ctx);
const rules=vm.runInContext('({...RULE})',ctx);
for(const [date,day] of Object.entries(od.days)){
 const n=day.cells.reduce((a,c)=>a+c[6],0);
 if(n!==day.n||n!==data.rp.days[date].taps)throw Error('daily mismatch '+date);
 const grouped=new Map();for(const c of day.cells){const k=c.slice(1,6).join('|'),v=grouped.get(k)||[0,0];v[0]+=c[6];v[1]+=c[7];grouped.set(k,v);}
 if(grouped.size!==day.od_hour.length)throw Error('OD count');
 for(const c of day.od_hour)if(JSON.stringify(grouped.get(c.slice(0,5).join('|')))!==JSON.stringify(c.slice(5)))throw Error('OD aggregation');
}
const results=[];
for(const date of ['2025-10-11','2025-02-28','2025-07-09']){
 const base=vm.runInContext(`dayTrips('${date}').map(t=>({...t,observedPeak:t.peak,type:'large',cap:43,stops:t.ev.map(e=>({si:RSTA.indexOf(e.sta),t:e.t,z:e.z}))}))`,ctx),before=JSON.stringify(base);
 for(const scenario of ['B','A','H'])for(const direction of [0,1]){
  const spec={...spec0,types,rule:rules,scenario,direction,startHour:scenario==='B'?10:scenario==='H'?14:5,endHour:scenario==='B'?15:scenario==='H'?18:24};
  const r=runComparison(base,od.days[date].cells,spec,deps);
  for(const x of [r.fixed,...r.options]){
   if(x.assigned+x.unassigned!==x.demand||x.assignedPaid+x.unassignedPaid!==x.paid)throw Error('conservation');
   for(const l of x.ledger)if(l.assigned+l.unassigned!==l.n||l.assignedPaid+l.unassignedPaid!==l.paid)throw Error('cell conservation');
   if(x.T.reduce((a,t)=>a+t.paid,0)!==x.assignedPaid)throw Error('paid assignment');
   if(!Number.isFinite(x.cost.total)||x.T.some(t=>t.loads.some(l=>l<0||l>t.cap)))throw Error('capacity/cost');
   for(const b of x.blocks){if(new Set(b.trips.map(t=>t.type)).size!==1)throw Error('mixed vehicle');for(let i=1;i<b.trips.length;i++){const a=b.trips[i-1],t=b.trips[i];if(a.arr+rules.turn+deps.dhT(a.endZ,t.startZ,a.arr)>t.dep+1e-5)throw Error('impossible connection');}}
  }
  if(JSON.stringify(base)!==before)throw Error('mutated baseline');
  results.push({date,scenario,direction,fixed:{buses:r.fixed.buses,drivers:r.fixed.drivers,unassigned:r.fixed.unassigned,cost:r.fixed.cost.total},options:r.options.map(x=>({id:x.id,buses:x.buses,drivers:x.drivers,unassigned:x.unassigned,cost:x.cost.total,feasible:x.feasible}))});
 }
}
fs.writeFileSync(new URL('output/dispatch-validation.json',root),JSON.stringify({version:'dispatch-v1-2026-10-24',checkedDays:Object.keys(od.days).length,cases:results},null,2));
console.log('Verified 725 daily/OD totals and 18 real-date/direction/scenario cases, including all candidates, per-cell demand/receipt conservation, capacity, chain connections and immutable baseline.');
