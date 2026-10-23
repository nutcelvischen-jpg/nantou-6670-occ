
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
const addR = (a, b) => { for (let d = new Date(a + 'T00:00'); d <= new Date(b + 'T00:00'); d.setDate(d.getDate() + 1)) HOLI.add(iso(d)); };   // 用本地日期；toISOString 在 UTC+8 會早一天
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
// 起訖區平均實收票價（2025 票證，依人次加權）
const FAREZ = (() => { const a = {}, n = {}; for (const r of Y25.od) { const o = BILL2Z[r.o], d = BILL2Z[r.d]; if (!o || !d || o === d || !r.fare) continue; const k = o + '>' + d; a[k] = (a[k] || 0) + r.fare * r.n; n[k] = (n[k] || 0) + r.n; } for (const k in a) a[k] /= n[k]; return a; })();
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

const _sv = new THREE.Vector3(), _sv2 = new THREE.Vector3();
