import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
let ctx;
beforeAll(() => {
  const data = Object.fromEntries([['agg','ops-aggregates'],['route','route-6670'],['tt','timetable-6670'],['rp','replay-all'],['dh','driver-headway-compact'],['fuel','fuel-price']].map(([k,f]) => [k, JSON.parse(read(`data/${f}.json`))]));
  ctx = vm.createContext({ THREE, window: { __DATA: data }, console });
  const geo = read('src/a_geo.js').replace(/^import .*;\n/gm, '').replace('/*__UTILS__*/', read('parts/utils.js'));
  vm.runInContext(geo + '\nfor (const f of Object.values(FACS)) f.slots = [];\n' + read('src/d_sim.js') + read('src/d_replay.js').replace('JSON.parse(await gunzipB64(DATA.rpz))','null') + read('src/e_forecast.js') + read('src/f_opt.js'), ctx);
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

  it('reconciles all reconstructed days and preserves boarding/alighting totals', () => {
    const rp=JSON.parse(read('data/replay-all.json'));
    const totals={2024:0,2025:0};
    for(const [date,day] of Object.entries(rp.days)) {
      totals[date.slice(0,4)]+=day.trips.length;
      let board=0,alight=0;
      for(const tr of day.trips) {
        expect(tr).toHaveLength(6); expect(Number.isInteger(tr[2])).toBe(true); expect(Number.isInteger(tr[3])).toBe(true);
        let last=-Infinity;
        for(const [si,t,b,a] of tr[4]){expect(si>=0&&si<rp.stations.length).toBe(true); expect(t>=last).toBe(true);last=t;board+=b;alight+=a;}
      }
      expect(board).toBe(day.taps); expect(alight).toBe(day.taps);
    }
    expect(totals).toEqual({2024:35005,2025:37520});
  });
  it('replay stepping, seeking and resetting yield identical event totals', () => {
    expect(run(`(() => {const a=new Replay('2025-10-11'),b=new Replay('2025-10-11');while(a.t<900)a.step();b.run(900);const ok=JSON.stringify(a.S)===JSON.stringify(b.S); b.t=390;b.syncAll(); const c=new Replay('2025-10-11').run(390);return ok && JSON.stringify(b.S)===JSON.stringify(c.S);})()`)).toBe(true);
    expect(run(`(() => {const a=new Replay('2025-10-11').run(1600);return a.S.boarded===a.S.alighted && a.S.boarded===a.day.taps;})()`)).toBe(true);
  });
  it('covers each trip once with feasible vehicle connections without mutating replay', () => {
    expect(run(`(() => {const before=JSON.stringify(RP.days['2025-10-11']);const r=optimizeDay('2025-10-11');const ids=r.re.blocks.flat().map(t=>t.id);return new Set(ids).size===r.base.T.length && ids.length===r.base.T.length && r.re.blocks.every(b=>b.every((t,i)=>!i||t.dep>=b[i-1].arr+RULE.turn+dhT(b[i-1].endZ,t.startZ,b[i-1].arr))) && JSON.stringify(RP.days['2025-10-11'])===before;})()`)).toBe(true);
  });
  it('minimum fleet agrees with exhaustive assignment on small trip sets', () => {
    const sample=[{dep:0,arr:20},{dep:10,arr:30},{dep:30,arr:45},{dep:40,arr:55},{dep:60,arr:75},{dep:70,arr:80}];
    function brute(i,ready){if(i===sample.length)return ready.length;let best=Infinity;const t=sample[i];for(let j=0;j<ready.length;j++)if(ready[j]+10<=t.dep){const next=[...ready];next[j]=t.arr;best=Math.min(best,brute(i+1,next));}return Math.min(best,brute(i+1,[...ready,t.arr]));}
    const actual=run(`minFleet(${JSON.stringify(sample)}.map((t,i)=>({...t,id:String(i),startZ:'TC',endZ:'TC'}))).blocks.length`);
    expect(actual).toBe(brute(0,[])); expect(run('minFleet([]).blocks.length')).toBe(0);
  });
  it('replay inference retains observed negative cumulative anomalies instead of inventing occupancy', () => {
    expect(run(`mkRTrip([0,'6670D',1,1,[[0,400,0,1],[1,410,1,0]],0],0).ev[0].load`)).toBe(-1);
  });
});
