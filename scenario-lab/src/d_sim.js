
/* ============================================================
   模擬：需求區、班次、車輛串接、上下車
   ============================================================ */
const ZONES = ['TC', 'HSR', 'PULI', 'JNU', 'YC', 'J9', 'SML', 'XS'];
const ZNAME = { TC: '台中', HSR: '高鐵台中站', PULI: '埔里', JNU: '暨南大學', YC: '魚池', J9: '九族文化村', SML: '日月潭', XS: '向山' };
const ZRANK = Object.fromEntries(ZONES.map((z, i) => [z, i]));
const BILL2Z = { '臺中': 'TC', '台中航空站': 'TC', '高鐵臺中站': 'HSR', '牛耳石雕公園': 'PULI', '崎下': 'PULI', '埔里站': 'PULI', '暨南大學校內': 'JNU', '暨南大學': 'JNU', '桃米坑': 'YC', '大雁': 'YC', '魚池': 'YC', '日月老茶廠': 'YC', '九族文化村': 'J9', '水社': 'SML', '日月潭': 'SML', '向山行政中心': 'XS' };
const TT2Z = { '台中 干城站': 'TC', '台中 火車站': 'TC', '高鐵 台中站': 'HSR', '埔里站': 'PULI', '暨南 大學': 'JNU', '九族 文化村': 'J9', '日月潭': 'SML', '向山 行政中心': 'XS' };
const PATTERN = {   // 子線 → 線形與服務區
  '6670D': { path: 'D', zones: ['TC', 'HSR', 'PULI', 'JNU', 'YC', 'SML'] },
  '6670A': { path: 'D', zones: ['TC', 'HSR', 'PULI', 'JNU', 'YC', 'J9', 'SML'] },
  '6670B': { path: 'B', zones: ['TC', 'HSR', 'PULI', 'JNU', 'YC', 'SML'] },
  '6670E': { path: 'B', zones: ['TC', 'HSR', 'PULI', 'JNU', 'YC', 'SML'] },
  '6670F': { path: 'F', zones: ['TC', 'HSR', 'PULI', 'JNU', 'YC', 'SML', 'XS'] },
  '6670H': { path: 'H', zones: ['TC', 'HSR', 'PULI'] },
  '6670':  { path: 'H', zones: ['TC', 'HSR', 'PULI'] },
};
const ZSTOP = { // 各線形上代表該區的站位
  D: { TC: '干城站', HSR: '高鐵臺中站', PULI: '埔里站', JNU: '暨南大學', YC: '魚池', J9: '九族文化村', SML: '日月潭' },
  B: { TC: '干城站', HSR: '高鐵臺中站', PULI: '埔里遊客中心', JNU: '暨南大學(校內)', YC: '魚池', SML: '日月潭' },
  H: { TC: '干城站', HSR: '高鐵臺中站', PULI: '埔里站' },
};
ZSTOP.F = { ...ZSTOP.B, XS: '向山行政中心' };
const CAP = 43, BALK = 90;

/* ---------- 路徑（含高度、雙向） ---------- */
const PATHS = {};
for (const k of ['D', 'B', 'H', 'F']) {
  const R = ROUTES[k];
  const fwd = R.pts.map((p, i) => new THREE.Vector3(p.x, R.h[i] * EX + .009, p.z));
  const mk = (pts) => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return { pts, cum, len: cum.at(-1), cls: null }; };
  const a = mk(fwd), b = mk(fwd.slice().reverse());
  a.cls = R.cls.slice(); b.cls = R.cls.slice().reverse();
  PATHS[k] = [a, b];
  // 各區在線形上的距離
  const zd = {};
  for (const [z, stop] of Object.entries(ZSTOP[k])) {
    const s = STOPS[stop]; let bi = 0, bd = 1e9;
    fwd.forEach((p, i) => { const d = (p.x - s[0]) ** 2 + (p.z - s[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
    zd[z] = a.cum[bi];
  }
  a.zd = zd; b.zd = Object.fromEntries(Object.entries(zd).map(([z, d]) => [z, a.len - d]));
}
function pathPoint(path, d, out) {
  const c = path.cum; d = clamp(d, 0, path.len);
  let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
  const f = (d - c[lo]) / ((c[hi] - c[lo]) || 1), a = path.pts[lo], b = path.pts[hi];
  out.pos.lerpVectors(a, b, f); out.dir.subVectors(b, a); out.cls = path.cls[lo]; out.i = lo;
  return out;
}

/* ---------- 國定假日（2026 為依規則推算，正式使用前請核對） ---------- */
const HOLI = new Set();
const addR = (a, b) => { for (let d = new Date(a + 'T00:00'); d <= new Date(b + 'T00:00'); d.setDate(d.getDate() + 1)) HOLI.add(iso(d)); };
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
{
  const R = [['2024-01-01', '2024-01-01'], ['2024-02-08', '2024-02-14'], ['2024-02-28', '2024-02-28'], ['2024-04-04', '2024-04-07'], ['2024-05-01', '2024-05-01'], ['2024-06-08', '2024-06-10'], ['2024-09-17', '2024-09-17'], ['2024-10-10', '2024-10-10'],
    ['2025-01-01', '2025-01-01'], ['2025-01-25', '2025-02-02'], ['2025-02-28', '2025-03-02'], ['2025-04-03', '2025-04-06'], ['2025-05-01', '2025-05-01'], ['2025-05-30', '2025-06-01'], ['2025-09-27', '2025-09-29'], ['2025-10-04', '2025-10-06'], ['2025-10-10', '2025-10-12'], ['2025-10-24', '2025-10-26'], ['2025-12-25', '2025-12-25'],
    ['2026-01-01', '2026-01-01'], ['2026-02-14', '2026-02-22'], ['2026-02-27', '2026-03-01'], ['2026-04-03', '2026-04-06'], ['2026-05-01', '2026-05-03'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-28'], ['2026-10-09', '2026-10-11'], ['2026-10-24', '2026-10-26'], ['2026-12-25', '2026-12-27']];
  for (const [a, b] of R) addR(a, b);
}
const isoD = (s) => new Date(s + 'T00:00');
function dayInfo(s) {
  const d = isoD(s), dow = d.getDay(), holi = HOLI.has(s);
  const nx = new Date(d); nx.setDate(d.getDate() + 1); const pv = new Date(d); pv.setDate(d.getDate() - 1);
  const off = holi || dow === 0 || dow === 6;
  const offN = HOLI.has(iso(nx)) || nx.getDay() === 0 || nx.getDay() === 6, offP = HOLI.has(iso(pv)) || pv.getDay() === 0 || pv.getDay() === 6;
  return { date: s, dow, holi, off, preOff: !off && offN, longStart: off && !offP && offN, longEnd: off && offP && !offN, label: holi ? '國定假日' : off ? '週末' : offN ? '假期前一天' : '平日' };
}

/* ---------- 需求參數（票證聚合） ---------- */
const Y25 = DATA.agg.years[DATA.agg.years.length - 1];
const OD = [{}, {}];
for (const r of Y25.od) {
  const o = BILL2Z[r.o], d = BILL2Z[r.d]; if (!o || !d || o === d) continue;
  const dir = ZRANK[d] > ZRANK[o] ? 0 : 1; OD[dir][o + '>' + d] = (OD[dir][o + '>' + d] || 0) + r.n;
}
for (const dir of [0, 1]) { const s = Object.values(OD[dir]).reduce((a, b) => a + b, 0); for (const k in OD[dir]) OD[dir][k] /= s; }
function hourShare(info, dir) {
  const dh = Y25.dow_hour, pick = (dw) => dh[String((dw + 6) % 7)][dir];   // Python weekday：0=週一
  let v;
  if (info.off) { const a = pick(6), b = pick(0); v = a.map((x, i) => x + b[i]); }
  else v = pick(info.dow);
  const s = v.reduce((a, b) => a + b, 0); return v.map((x) => x / s);
}

/* ---------- 班次 ---------- */
function ttTripsFor(info) {
  const out = [];
  DATA.tt.trips.forEach(([dir, code, cls, stops], i) => {
    const ok = cls === 'daily_unmarked' || (cls === 'mon_thu' && !info.off && info.dow >= 1 && info.dow <= 4) || (cls === 'fri_sun' && (info.off || info.dow === 5 || info.dow === 0));
    if (!ok) return;
    out.push(makeTrip(dir, code, stops.map(([n, t]) => [TT2Z[n], hm(t), n]), 'tt' + i));
  });
  return out.sort((a, b) => a.dep - b.dep);
}
function makeTrip(dir, code, stops, id) {
  let pat = PATTERN[code] || PATTERN['6670'];
  const startZ = stops[0][0], endZ = stops.at(-1)[0];
  // 往台中、由埔里發車的 D/A：仍走 D 線形
  const path = PATHS[pat.path][dir];
  let zones = pat.zones.slice(); if (dir === 1) zones.reverse();
  const i0 = zones.indexOf(startZ), i1 = zones.lastIndexOf(endZ);
  zones = zones.slice(Math.max(0, i0), i1 >= 0 ? i1 + 1 : zones.length);
  // 時間錨點：班表上的站（同區取第一個）＋ 起訖
  const anchors = []; const seen = new Set();
  for (const [z, t] of stops) { if (seen.has(z) || path.zd[z] === undefined) continue; seen.add(z); const d = path.zd[z]; if (anchors.length && d <= anchors.at(-1).d) continue; anchors.push({ d, t }); }
  const d0 = path.zd[zones[0]], d1 = path.zd[zones.at(-1)];
  return { id, dir, code, path, zones, anchors, d0, d1, dep: stops[0][1], arr: stops.at(-1)[1], startZ: zones[0], endZ: zones.at(-1),
    stopsTxt: stops.map(([, t, n]) => [n, t]) };
}
const schedT = (trip, d) => { const A = trip.anchors; if (d <= A[0].d) return A[0].t; for (let i = 1; i < A.length; i++) if (d <= A[i].d) return lerp(A[i - 1].t, A[i].t, (d - A[i - 1].d) / (A[i].d - A[i - 1].d)); return A.at(-1).t; };
const schedD = (trip, t) => { const A = trip.anchors; if (t <= A[0].t) return A[0].d; for (let i = 1; i < A.length; i++) if (t <= A[i].t) return lerp(A[i - 1].d, A[i].d, (t - A[i - 1].t) / ((A[i].t - A[i - 1].t) || 1)); return A.at(-1).d; };

/* ---------- 車輛串接（最少車輛的貪婪解） ---------- */
const TERM_Z = { TC: 'GC', PULI: 'PL', SML: 'SML', XS: 'SML', HSR: 'GC' };
function dhMin(a, b) { // 空車調度時間（分）
  if (a === b) return 0; const D = PATHS.D[0].zd, pos = { TC: D.TC, HSR: D.HSR, PULI: D.PULI, JNU: D.JNU, YC: D.YC, SML: D.SML, XS: D.SML + 2.5, J9: D.YC };
  return Math.round(Math.abs(pos[a] - pos[b]) / 45 * 60) + 5;
}
const LAYOVER = 10;
function buildBlocks(trips) {
  const buses = [];
  for (const tr of trips) {
    let best = null, bestScore = 1e9;
    for (const b of buses) {
      const dh = dhMin(b.term, tr.startZ), ready = b.free + LAYOVER + dh;
      if (ready > tr.dep) continue;
      const score = dh * 10 + (tr.dep - ready) * .2;   // 優先不空車調度、再優先剛好接得上
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (!best) { best = { id: 'B' + pad2(buses.length + 1), term: tr.startZ, home: tr.startZ, free: -1e9, trips: [], dhKm: 0 }; buses.push(best); }
    if (best.term !== tr.startZ && best.trips.length) best.dhKm += dhMin(best.term, tr.startZ) * 45 / 60;
    best.trips.push(tr); tr.busId = best.id; best.free = tr.arr; best.term = tr.endZ;
  }
  return buses;
}

/* ---------- 模擬器 ---------- */
class Sim {
  constructor(o) {
    this.o = o; this.info = dayInfo(o.date); this.rng = mulberry32(o.seed || 1); this.arrivalRng = mulberry32((o.seed || 1) + 100003);
    this.trips = o.trips.map((t) => ({ ...t, st: null }));
    this.blocks = buildBlocks(this.trips);
    this.t = o.start || 300;
    this.daily = [o.demand(o.date, 0), o.demand(o.date, 1)];
    this.hs = [hourShare(this.info, 0), hourShare(this.info, 1)];
    this.q = Object.fromEntries(ZONES.map((z) => [z, {}]));
    // 每個起訖組合的服務時窗：只在有車可搭的時段產生旅客（首班前 20 分起）
    this.win = [{}, {}];
    for (const tr of (o.demandTrips || ttTripsFor(this.info))) tr.zones.forEach((o, i) => { const to = schedT(tr, tr.path.zd[o]); for (const d of tr.zones.slice(i + 1)) { const k = o + '>' + d, w = this.win[tr.dir][k]; if (!w) this.win[tr.dir][k] = [to, to]; else { w[0] = Math.min(w[0], to); w[1] = Math.max(w[1], to); } } });
    this.S = { lost: 0, arrived: 0, boarded: 0, delivered: 0, waitSum: 0, waitMax: 0, denied: 0, deniedEv: [], tripsDone: 0, depOnTime: 0, deps: 0, arrLate: 0, paxKm: 0, seatKm: 0, vkm: 0, dhKm: 0, crowded: 0, log: [], waitsByH: Array(24).fill(0), boardByH: Array(24).fill(0) };
    this.buses = this.blocks.map((b) => ({ id: b.id, plan: b.trips, k: 0, term: b.trips[0].startZ, state: 'idle', trip: null, dh: null, onboard: {}, load: 0, slot: null, done: 0 }));
    for (const b of this.buses) this.park(b, b.term);
  }
  park(b, z) {
    const f = FACS[TERM_Z[z]]; b.slot = null; this.busy ||= new Set();
    const s = f.slots.find((x) => !this.busy.has(x)); if (s) { this.busy.add(s); b.slot = s; }
    b.parkFac = f;
  }
  unpark(b) { if (b.slot) this.busy.delete(b.slot); b.slot = null; }
  lambda(o, d, dir, t) { const h = Math.floor(t / 60) % 24; return this.daily[dir] * this.hs[dir][h] * (OD[dir][o + '>' + d] || 0) / 60; }
  poisson(l) { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * (this.arrivalRng() + this.arrivalRng() + this.arrivalRng() - 1.5) * 2)); let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= this.arrivalRng(); } while (p > L); return k - 1; }
  mult(trip, cls, t) {
    let m = trip.st.f;
    const h = t / 60, info = this.info;
    if (cls === 'hw' && this.o.cong) {
      if (info.off && trip.dir === 0 && h >= 8 && h < 11.5) m /= .6;
      if (info.off && trip.dir === 1 && h >= 15 && h < 19) m /= .6;
      if (!info.off && h >= 17 && h < 19) m *= 1.15;
    }
    if (cls === 'city' && !info.off && ((h >= 7 && h < 9) || (h >= 17 && h < 19))) m *= 1.12;
    return m;
  }
  startTrip(b, tr, t) {
    this.unpark(b);
    tr.st = { tau: 0, t0: t, f: .95 + this.rng() * .12, dwell: 0, zi: 0, d: tr.d0, dPrev: tr.d0, maxLoad: 0, board: 0, depDelay: t - tr.dep, stopLog: [] };
    b.trip = tr; b.state = 'run'; b.onboard = {}; b.load = 0;
    this.S.deps++; if (t - tr.dep < 3) this.S.depOnTime++;
  }
  serveZone(b, tr, z, t) {
    const st = tr.st, ob = b.onboard; let alight = ob[z] || 0; delete ob[z];
    b.load -= alight; this.S.delivered += alight;
    const downstream = tr.zones.slice(tr.zones.indexOf(z) + 1), Q = this.q[z];
    let boarded = 0;
    while (b.load < CAP) {
      let bz = null, bt = 1e9; for (const d of downstream) { const L = Q[d]; if (L && L.length && L[0] < bt) { bt = L[0]; bz = d; } }
      if (!bz) break;
      Q[bz].shift(); ob[bz] = (ob[bz] || 0) + 1; b.load++; boarded++;
      const w = t - bt; this.S.waitSum += w; this.S.waitMax = Math.max(this.S.waitMax, w); this.S.waitsByH[Math.floor(t / 60) % 24] += w;
    }
    this.S.boarded += boarded; this.S.boardByH[Math.floor(t / 60) % 24] += boarded; st.board += boarded;
    let left = 0; for (const d of downstream) left += (Q[d] || []).length;
    if (b.load >= CAP && left > 0) { this.S.denied += left; this.S.deniedEv.push({ t, z, n: left, trip: tr.id }); }
    st.maxLoad = Math.max(st.maxLoad, b.load);
    st.dwell = st.zi === 0 ? 0 : .4 + .05 * (boarded + alight);
    st.stopLog.push({ z, t, sched: schedT(tr, st.d), alight, boarded, load: b.load });
  }
  step() {
    const t = this.t;
    // 旅客到站
    for (const dir of [0, 1]) for (const k in OD[dir]) {
      const w = this.win[dir][k]; if (!w || t < w[0] - 20 || t > w[1] - 5) continue;
      const [o, d] = k.split('>'); const n = this.poisson(this.lambda(o, d, dir, t));
      if (n) { const L = (this.q[o][d] ||= []); for (let i = 0; i < n; i++) L.push(t); this.S.arrived += n; }
    }
    // 等超過 90 分鐘的旅客放棄（改搭其他交通），計為流失
    if (t % 5 === 0) for (const z in this.q) for (const d in this.q[z]) { const L = this.q[z][d]; let n = 0; while (L.length && t - L[0] > BALK) { L.shift(); n++; } this.S.lost += n; }
    for (const b of this.buses) {
      if (b.state === 'idle' || b.state === 'lay') {
        const tr = b.plan[b.k]; if (!tr) { b.state = 'done'; continue; }
        if (t < (b.readyAt || 0)) continue;
        if (b.term !== tr.startZ) { // 需要空車調度
          const dur = dhMin(b.term, tr.startZ);
          if (t >= tr.dep - dur - 2 || b.state === 'lay') { this.unpark(b); b.state = 'dh'; b.dh = { from: b.term, to: tr.startZ, t0: t, dur }; this.S.vkm += dur * 45 / 60; this.S.dhKm += dur * 45 / 60; }
          continue;
        }
        if (t >= tr.dep && t >= (b.readyAt || 0)) this.startTrip(b, tr, t);
      } else if (b.state === 'dh') {
        if (t >= b.dh.t0 + b.dh.dur) { b.term = b.dh.to; b.dh = null; b.state = 'idle'; b.readyAt = t + 3; this.park(b, b.term); }
      } else if (b.state === 'run') {
        const tr = b.trip, st = tr.st;
        st.dPrev = st.d;
        if (st.zi === 0) { this.serveZone(b, tr, tr.zones[0], t); st.zi = 1; }
        if (st.dwell > 0) { st.dwell = Math.max(0, st.dwell - 1); }
        else {
          const tmp = { pos: _sv, dir: _sv2 }; pathPoint(tr.path, st.d, tmp);
          const late = (t - (tr.dep + st.tau)) > 1;
          st.tau += 1 / (this.mult(tr, tmp.cls, t) * (late ? .97 : 1));
          st.d = schedD(tr, tr.dep + st.tau);
        }
        let segStart = st.dPrev, passengerKm = 0;
        while (st.zi < tr.zones.length && st.d >= tr.path.zd[tr.zones[st.zi]] - 1e-6) {
          const stopD = tr.path.zd[tr.zones[st.zi]];
          passengerKm += Math.max(0, stopD - segStart) * b.load; segStart = stopD;
          this.serveZone(b, tr, tr.zones[st.zi], t); st.zi++;
        }
        passengerKm += Math.max(0, st.d - segStart) * b.load;
        const km = (st.d - st.dPrev) * 1.08; this.S.paxKm += passengerKm * 1.08; this.S.seatKm += km * CAP; this.S.vkm += km;
        if (st.zi >= tr.zones.length) {
          const lateEnd = t - tr.arr; if (lateEnd > 10) this.S.arrLate++;
          if (st.maxLoad > CAP * .9) this.S.crowded++;
          this.S.tripsDone++; this.S.log.push({ id: tr.id, bus: b.id, dir: tr.dir, code: tr.code, dep: tr.dep, depDelay: st.depDelay, arrDelay: lateEnd, maxLoad: st.maxLoad, board: st.board });
          tr.done = true; tr.st.arrT = t; b.done++; b.k++; b.trip = null; b.term = tr.endZ; b.load = 0; b.onboard = {};
          b.state = 'lay'; b.readyAt = t + LAYOVER; this.park(b, b.term);
          const nx = b.plan[b.k]; if (nx && nx.startZ === b.term) b.state = 'idle';
        }
      }
    }
    this.t++;
  }
  run(until) { while (this.t < until) this.step(); return this; }
  queueAt(z) { let n = 0; for (const d in this.q[z]) n += this.q[z][d].length; return n; }
  oldestWait(z) { let o = 1e9; for (const d in this.q[z]) if (this.q[z][d].length) o = Math.min(o, this.q[z][d][0]); return o < 1e9 ? this.t - o : 0; }
  summary() {
    const S = this.S, km = S.vkm;
    return { arrived: S.arrived, onboard: this.buses.reduce((n,b)=>n+b.load,0), trips: this.trips.length, buses: this.blocks.length, served: S.boarded, avgWait: S.boarded ? S.waitSum / S.boarded : 0, maxWait: S.waitMax,
      denied: S.denied, lost: S.lost, lf: S.seatKm ? S.paxKm / S.seatKm : 0, vkm: km, dhKm: S.dhKm, crowded: S.crowded, onTime: S.deps ? S.depOnTime / S.deps : 1, arrLate: S.arrLate, left: ZONES.reduce((a, z) => a + this.queueAt(z), 0) };
  }
}
const _sv = new THREE.Vector3(), _sv2 = new THREE.Vector3();
