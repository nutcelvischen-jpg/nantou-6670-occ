
/* ============================================================
   資料重播：只用兩年刷卡資料還原的當日實際車次
   - 車次、發車與各站時刻、上下車人數、在車人數、票收：全部來自刷卡
   - 唯一的畫面處理：車輛在「前後兩站刷卡時刻」之間沿官方線形等速內插位置
   - 不產生旅客到站、候車、滿載未上車、空車調度等資料中沒有的量
   ============================================================ */
// 重播資料在 build 時以 gzip＋base64 內嵌（約 7 MB → 1.5 MB），開頁時用瀏覽器內建 DecompressionStream 解壓
async function gunzipB64(b) { const bin = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); return await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
const RP = DATA.rp || JSON.parse(await gunzipB64(DATA.rpz)), RSTA = RP.stations, RDAYS = Object.keys(RP.days).sort();
const RZ = RSTA.map((n) => BILL2Z[n]);
function rpPath(code, zs) {
  if (PATTERN[code]) return PATTERN[code].path;
  const has = (z) => zs.includes(z);
  if (has('XS')) return 'F';
  if (has('SML') || has('YC') || has('J9')) return has('PULI') ? 'D' : 'B';
  return 'H';
}
function mkRTrip(r, i) {
  const [dir, code, bus, drv, seq, rev] = r;
  const zs = seq.map((s) => RZ[s[0]]).filter(Boolean), pk = rpPath(code, zs), path = PATHS[pk][dir];
  const anchors = [], seen = new Set();
  for (const [si, t] of seq) { const z = RZ[si], d = path.zd[z]; if (d === undefined || seen.has(z)) continue; seen.add(z); if (anchors.length && (d <= anchors.at(-1).d || t < anchors.at(-1).t)) continue; anchors.push({ d, t, z }); }
  let load = 0, peak = 0, board = 0; const ev = [];
  for (const [si, t, b, a] of seq) { load += b - a; board += b; peak = Math.max(peak, load); ev.push({ t, z: RZ[si], sta: RSTA[si], b, a, load }); }
  const zones = anchors.map((a) => a.z);
  return { id: 'T' + i, dir, code: code || '6670', bus: 'B' + pad2(bus), drv, path, pk, anchors, zones, ev, peak, board, rev, ok: anchors.length >= 2,
    dep: seq[0][1], arr: seq.at(-1)[1], startZ: zones[0] || RZ[seq[0][0]], endZ: zones.at(-1) || RZ[seq.at(-1)[0]], busId: 'B' + pad2(bus) };
}
const rpD = (tr, t) => { const A = tr.anchors; if (t <= A[0].t) return A[0].d; for (let i = 1; i < A.length; i++) if (t <= A[i].t) return lerp(A[i - 1].d, A[i].d, (t - A[i - 1].t) / ((A[i].t - A[i - 1].t) || 1)); return A.at(-1).d; };
const rpLoad = (tr, t) => { let l = 0; for (const e of tr.ev) { if (e.t > t) break; l = e.load; } return l; };
const DUR_KM = (tr) => (tr.ok ? (tr.anchors.at(-1).d - tr.anchors[0].d) * 1.08 : 0);   // 線形距離（模型 km × 1.08 ＝ 實際路程近似，與舊版一致）
class Replay {
  constructor(date) {
    this.date = date; this.info = dayInfo(date); const D = RP.days[date];
    this.day = D; this.trips = D.trips.map(mkRTrip).sort((a, b) => a.dep - b.dep);
    const by = {}; for (const tr of this.trips) (by[tr.bus] ||= []).push(tr);
    this.buses = Object.keys(by).sort().map((id) => ({ id, plan: by[id], k: 0, state: 'off', trip: null, load: 0, term: by[id][0].startZ, slot: null, parkFac: null, done: 0 }));
    this.events = this.trips.flatMap((tr) => tr.ev.map((e) => ({ ...e, tr }))).sort((a, b) => a.t - b.t);
    this.busy = new Set(); this.t = 300; this.ei = 0;
    this.S = { boarded: 0, alighted: 0, rev: 0, tripsDone: 0, over: 0, low: 0, done: [] };
    this.sync();
  }
  park(b, z) { const f = FACS[TERM_Z[z] || 'GC']; this.unpark(b); const s = f.slots.find((x) => !this.busy.has(x)); if (s) { this.busy.add(s); b.slot = s; } b.parkFac = f; }
  unpark(b) { if (b.slot) this.busy.delete(b.slot); b.slot = null; }
  sync() {
    const t = this.t;
    while (this.ei < this.events.length && this.events[this.ei].t <= t) { const e = this.events[this.ei++]; this.S.boarded += e.b; this.S.alighted += e.a; }
    for (const b of this.buses) {
      const P = b.plan; let k = 0; while (k < P.length && P[k].arr < t) k++;
      b.done = k; b.k = k;
      const tr = P[k];
      let st;
      if (tr && tr.dep <= t && tr.ok) st = 'run';
      else if (k === 0) st = 'off';
      else if (k >= P.length) st = t - P.at(-1).arr < 30 ? 'done' : 'off';
      else st = 'lay';
      if (st === 'run') { this.unpark(b); b.parkedAt = null; b.trip = tr; b.load = rpLoad(tr, t); }
      else {
        b.trip = null; b.load = 0; const z = k ? P[k - 1].endZ : P[0].startZ; b.term = z;
        if (st === 'off') { this.unpark(b); b.parkedAt = null; b.parkFac = null; }
        else if (b.parkedAt !== z) { this.park(b, z); b.parkedAt = z; }
      }
      b.state = st;
    }
    for (const tr of this.trips) if (!tr.done && tr.arr <= t) { tr.done = true; this.S.tripsDone++; this.S.rev += tr.rev; if (tr.peak > CAP) this.S.over++; if (tr.peak < 5) this.S.low++; this.S.done.push(tr); }
    // Completion order must not depend on stepping versus seeking.
    this.S.done.sort((a,b) => a.arr-b.arr || a.id.localeCompare(b.id));
  }
  step() { this.t++; this.sync(); }
  run(until) { while (this.t < until) { this.t++; } this.syncAll(); return this; }
  syncAll() { this.ei = 0; this.S = { boarded: 0, alighted: 0, rev: 0, tripsDone: 0, over: 0, low: 0, done: [] }; for (const tr of this.trips) tr.done = false; this.sync(); }
  boardsRecent(z, mins) { let n = 0; for (const e of this.events) { if (e.t > this.t) break; if (e.t > this.t - mins && e.z === z) n += e.b; } return n; }
  nextDeps(z, dir, n = 3, dest) {
    const out = [];
    for (const tr of this.trips) { if (tr.dir !== dir) continue; const e = tr.ev.find((x) => x.z === z && x.b > 0); if (!e || e.t < this.t) continue; if (dest && !tr.ev.some((x) => x.z === dest)) continue; out.push({ tr, t: e.t, e }); }
    return out.sort((a, b) => a.t - b.t).slice(0, n);
  }
  drivers() {   // 當日匿名司機值勤：同一司機編號的車次串起來
    const by = {}; for (const tr of this.trips) if (tr.drv) (by[tr.drv] ||= []).push(tr);
    return Object.entries(by).map(([d, L]) => { L.sort((a, b) => a.dep - b.dep); return { id: 'D' + pad2(+d), trips: L.length, start: L[0].dep, end: Math.max(...L.map((x) => x.arr)), span: (Math.max(...L.map((x) => x.arr)) - L[0].dep) / 60, drive: L.reduce((a, x) => a + x.arr - x.dep, 0) / 60, buses: new Set(L.map((x) => x.bus)).size }; });
  }
}
function rpLabel(d) { const i = dayInfo(d), D = RP.days[d]; return `${d} 週${DOW_ZH[i.dow]}${i.holi ? '・假日' : ''}（${D.taps.toLocaleString()} 筆）`; }

// Initialize before the animation loop; later dispatch data loading can yield.
const PRED={active:false,date:RDAYS.includes('2025-10-11')?'2025-10-11':RDAYS.at(-1),bus:null,trip:null,trips:[],clock:{minute:0,speed:120,paused:true},autoFit:true,drivingCamera:null,stops:[],stationKey:'',renderKey:''};
