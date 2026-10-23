import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
let ctx;
beforeAll(() => {
  const data = Object.fromEntries([['agg','ops-aggregates'],['route','route-6670'],['tt','timetable-6670']].map(([k,f]) => [k, JSON.parse(read(`data/${f}.json`))]));
  ctx = vm.createContext({ THREE, window: { __DATA: data }, console });
  const geo = read('src/a_geo.js').replace(/^import .*;\n/gm, '').replace('/*__UTILS__*/', read('parts/utils.js'));
  vm.runInContext(geo + '\nfor (const f of Object.values(FACS)) f.slots = [];\n' + read('src/d_sim.js') + read('src/e_forecast.js') + read('src/f_opt.js'), ctx);
}, 30000);
const run = (code) => vm.runInContext(code, ctx);

describe('integrated timetable scenario model', () => {
  it('keeps local holiday dates and includes low-demand observations', () => {
    expect(run("dayInfo('2025-10-10').holi")).toBe(true);
    expect(run("dayInfo('2025-10-09').holi")).toBe(false);
    expect(read('src/e_forecast.js')).not.toContain('r.v[dir] > 50');
  });
  it('scores both models on the same valid rolling-origin days', () => {
    const b = run('FC.back');
    const valid = b.pts.filter(p => Number.isFinite(p.pb) && Number.isFinite(p.pm));
    expect(b.validCount).toBe(valid.length);
    expect(b.maeM).toBeCloseTo(valid.reduce((a,p)=>a+Math.abs(p.y-p.pm),0)/valid.length, 8);
    expect(b.maeB).toBeCloseTo(valid.reduce((a,p)=>a+Math.abs(p.y-p.pb),0)/valid.length, 8);
    expect(run("forecast('2026-01-05',0).lo")).toBeGreaterThanOrEqual(0);
    expect(run("forecast('2026-01-05',0).hi")).toBeGreaterThan(run("forecast('2026-01-05',0).mean"));
  });
  it('keeps recommendations inside service hours and reports infeasible fleet limits', () => {
    expect(run(`(() => { OPT.fleet=1; OPT.floor=3; const p=proposeTrips('2025-11-01'); return !p.feasible && p.fleet>p.limit; })()`)).toBe(true);
    expect(run(`(() => { OPT.fleet=0; OPT.floor=1; const date='2025-11-01', p=proposeTrips(date), cur=ttTripsFor(dayInfo(date)); return p.trips.every(t=>{const ds=cur.filter(c=>c.dir===t.dir).map(c=>c.dep); return t.dep>=Math.min(...ds) && t.dep<=Math.max(...ds);}); })()`)).toBe(true);
  });
  it('conserves passengers and uses identical arrival demand when service is reduced', () => {
    const result=run(`(() => {
      const date='2025-11-01', trips=ttTripsFor(dayInfo(date));
      const a=new Sim({date,trips,demand:demandOf,seed:11,start:300});
      const b=new Sim({date,trips:trips.filter((_,i)=>i%2===0),demand:demandOf,seed:11,start:300});
      let valid=true;
      while(a.t<1500){a.step();b.step();for(const s of [a,b]){
        const queued=ZONES.reduce((n,z)=>n+s.queueAt(z),0), aboard=s.buses.reduce((n,b)=>n+b.load,0);
        valid &&= s.buses.every(b=>b.load>=0 && b.load<=CAP);
        valid &&= s.S.arrived===s.S.delivered+s.S.lost+queued+aboard;
      }}
      return {valid,arrivalsA:a.S.arrived,arrivalsB:b.S.arrived,lf:a.summary().lf};
    })()`);
    expect(result.valid).toBe(true);
    expect(result.arrivalsA).toBeGreaterThan(0);
    expect(result.arrivalsA).toBe(result.arrivalsB);
    expect(result.lf).toBeGreaterThanOrEqual(0);
    expect(result.lf).toBeLessThanOrEqual(1);
  });
  it('enforces ten minutes of terminal recovery and a 40% highway speed reduction', () => {
    expect(run(`(() => { const date='2025-11-01', s=new Sim({date,trips:ttTripsFor(dayInfo(date)),demand:demandOf,seed:11,start:300}); let ok=true; while(s.t<1500){s.step();for(const b of s.buses)if((b.state==='lay'||b.state==='idle')&&b.done>0){const prior=b.plan[b.k-1];ok &&= b.readyAt>=prior.st.arrT+LAYOVER;}} return ok; })()`)).toBe(true);
    expect(run(`(() => {const date='2025-11-01',s=new Sim({date,trips:[],demand:demandOf,cong:true,seed:11,start:300});return 1/s.mult({dir:0,st:{f:1}},'hw',9*60);})()`)).toBeCloseTo(.6);
  });
  it('publishes aggregate OD data without raw card or vehicle identifiers', () => {
    const data=JSON.parse(read('data/ops-aggregates.json'));
    expect(data.years.every(y=>y.od.every(o=>o.n>=10))).toBe(true);
    const keys=[]; const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){keys.push(k);walk(v);}};walk(data);
    expect(keys.some(k=>/card_?id|plate|身分證|卡號|車牌|api.?key|secret/i.test(k))).toBe(false);
  });
});
