import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DATA = window.__DATA;
/*__UTILS__*/
const DOW_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const pad2 = (n) => String(n).padStart(2, '0');
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/* ============================================================
   座標：1 單位 = 1 公里，原點 23.95N 120.80E；x 向東、z 向南
   ============================================================ */
const P = (lat, lon) => [(lon - 120.80) * 101.7, -(lat - 23.95) * 110.6];
const PL = (lonlat) => P(lonlat[1], lonlat[0]);
const EX = 1.7;
const FAC = 0.003;               // 設施：1 公尺 = 0.003 km（約 3 倍實物，遠看才看得到）

/* ---------- 地形網格範圍 ---------- */
const CELL = .3, X0 = -21.6, Z0 = -23.4, NX = 137, NZ = 126;
const W = (NX - 1) * CELL, D = (NZ - 1) * CELL;

/* ---------- 日月潭 ---------- */
const LAKE = P(23.8505, 120.9175), WATER = .748;
const lakeR = (th) => 1 + .14 * Math.sin(3 * th + 1) + .08 * Math.sin(5 * th + 2.3);
function lakeD(x, z) { const dx = (x - LAKE[0]) / 1.25, dz = z - LAKE[1]; return Math.hypot(dx, dz) / (1.55 * lakeR(Math.atan2(dz, dx))); }
const LALU = P(23.8505, 120.9155);

/* ---------- 官方路線（TDX 6670 子線線形） ---------- */
const SHAPE_KEY = { D: 'THB6670D1', B: 'THB6670B1', H: 'THB6670H1' };
const XS_EXT = [[23.8650, 120.9083], [23.8618, 120.9046], [23.8582, 120.9019], [23.8546, 120.9003], [23.8512, 120.8988]]; // 日月潭→向山（台 21 沿湖，示意）
const XS_POS = P(23.8512, 120.8988);
const ZJ9 = P(23.8695, 120.9475);   // 九族文化村（A 線，無 TDX 線形，示意）
function densify(ll) {
  const out = [];
  for (let i = 0; i < ll.length; i++) {
    const [x, z] = PL(ll[i]);
    if (i) { const [px, pz] = out[out.length - 1]; const L = Math.hypot(x - px, z - pz), n = Math.ceil(L / .1); for (let k = 1; k < n; k++) out.push([lerp(px, x, k / n), lerp(pz, z, k / n)]); }
    out.push([x, z]);
  }
  // 輕微平滑（移除 GPS 線形的鋸齒）
  for (let it = 0; it < 2; it++) for (let i = 1; i < out.length - 1; i++) out[i] = [(out[i - 1][0] + out[i][0] * 2 + out[i + 1][0]) / 4, (out[i - 1][1] + out[i][1] * 2 + out[i + 1][1]) / 4];
  return out;
}
const SHAPES = {};
for (const k in SHAPE_KEY) SHAPES[k] = densify(DATA.route.shapes[SHAPE_KEY[k]]);
SHAPES.F = SHAPES.B.concat(densify([DATA.route.shapes[SHAPE_KEY.B].at(-1), ...XS_EXT.map(([a, b]) => [b, a])]).slice(1));
const STOPS = {};   // 名稱 → [x, z]
for (const k of ['THB6670D1', 'THB6670B1', 'THB6670H1']) for (const [, name, lon, lat] of DATA.route.stops[k]) if (!STOPS[name]) STOPS[name] = P(lat, lon);
STOPS['向山行政中心'] = XS_POS; STOPS['九族文化村'] = ZJ9;

/* ---------- 路段分級（依位置判斷：市區／國道／山區） ---------- */
const GC = STOPS['干城站'], HSRp = STOPS['高鐵臺中站'], PULIc = P(23.966, 120.962);
function segClass(x, z) {
  if (Math.hypot(x - GC[0], z - GC[1]) < 5.2 && x > HSRp[0] + .9) return 'city';
  if (Math.hypot(x - HSRp[0], z - HSRp[1]) < 1.0) return 'city';
  if (Math.hypot(x - PULIc[0], z - PULIc[1]) < 2.4) return 'city';
  if ((x > 8 && z > -1.2) || lakeD(x, z) < 2.5) return 'mt';
  return 'hw';
}
const CLS = {
  hw:   { hw: .05, kind: 0, lane: .019, v: 85 },
  city: { hw: .028, kind: 3, lane: .011, v: 30 },
  mt:   { hw: .026, kind: 2, lane: .009, v: 40 },
};

/* ============================================================
   地形高度 rawH（km，真實海拔量級）
   ============================================================ */
const PULI_B = P(23.968, 120.958), YUCHI_B = P(23.896, 120.935), GUOX_B = P(24.040, 120.857);
function basin(h, x, z, c, r, fl) { const d = Math.hypot(x - c[0], z - c[1]); return lerp(h, fl + .02 * fbm(x * .7, z * .7, 2), ss(r, r * .5, d)); }
function rawH(x, z) {
  let h = .05 + .03 * fbm(x * .18 + 11, z * .18 - 4, 3);                                   // 台中盆地
  h += .3 * Math.exp(-(((x + 19.4 + .8 * Math.sin(z * .35)) / 2.2) ** 2)) * ss(-13, -6, z) * (.6 + .6 * fbm(x * .4, z * .4 + 5, 3)); // 八卦台地
  h += ss(-10, -4, x + .1 * z) * ss(-17, -11, z) * (.12 + .3 * fbm(x * .3 + 3, z * .3 - 7, 4));  // 霧峰、草屯丘陵
  h += ss(-3, 9, x + .18 * z) * (.32 + 1.55 * ridged(x * .11 - 5, z * .11 + 2, 5));           // 中央山脈西翼
  h = basin(h, x, z, PULI_B, 4.4, .45);
  h = basin(h, x, z, YUCHI_B, 1.7, .64);
  h = basin(h, x, z, GUOX_B, 1.1, .33);
  const dl = lakeD(x, z);
  if (dl < 2.2) {
    h = lerp(h, Math.max(h, .84), ss(1.05, 1.25, dl) * ss(1.9, 1.5, dl));
    h = lerp(h, .70 + .14 * ss(.6, 1.1, dl), ss(1.4, 1.0, dl));
    const di = Math.hypot(x - LALU[0], z - LALU[1]);
    if (di < .16) h = Math.max(h, .762 - (di / .16) ** 2 * .03);
  }
  return Math.max(h, .02);
}
const riverW = () => 0;

/* ---------- 設施位置（離路線偏移，local +z 指回路線） ---------- */
const FACS = {};
const PADR = { hsr: .78, sml: .3, term: .32, stop: .06 };
function defFac(key, stop, type, away, dist) {
  const [sx, sz] = STOPS[stop]; const L = Math.hypot(away[0], away[1]); const ax = away[0] / L, az = away[1] / L;
  FACS[key] = { key, stop, type, ox: sx + ax * dist, oz: sz + az * dist, yaw: Math.atan2(-ax, -az), sx, sz };
}
defFac('HSR', '高鐵臺中站', 'hsr', [-1, .15], .34);
defFac('GC', '干城站', 'term', [.3, -1], .2);
defFac('PL', '埔里站', 'term', [.2, 1], .2);
defFac('SML', '日月潭', 'sml', [-.25, -1], .18);
for (const f of Object.values(FACS)) f.padH = rawH(f.ox, f.oz) + .004;
function baseH(x, z) {
  let h = rawH(x, z);
  for (const f of Object.values(FACS)) { const d = Math.hypot(x - f.ox, z - f.oz), r = PADR[f.type]; if (d < r) h = lerp(h, f.padH, ss(r, r * .62, d)); }
  return h;
}

/* ---------- 路線高度：沿線取樣、找谷、平滑 ---------- */
const ROUTES = {};   // 每條子線：{ pts:[{x,z}], h:[], cls:[], cum:[] }
for (const k of ['D', 'B', 'H', 'F']) {
  const pts = SHAPES[k].map(([x, z]) => ({ x, z })), N = pts.length;
  const cls = pts.map((p) => segClass(p.x, p.z));
  const hs = pts.map((p, i) => {
    const q = pts[Math.min(N - 1, i + 1)], r = pts[Math.max(0, i - 1)];
    let tx = q.x - r.x, tz = q.z - r.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    let m = baseH(p.x, p.z); if (cls[i] !== 'city') for (const o of [-.5, .5]) m = Math.min(m, baseH(p.x - tz * o, p.z + tx * o) + .03);
    return m;
  });
  for (let it = 0; it < 26; it++) { const c = hs.slice(); for (let i = 1; i < N - 1; i++) { let s = 0; for (let j = -2; j <= 2; j++) s += c[clamp(i + j, 0, N - 1)]; hs[i] = s / 5; } }
  for (let i = 0; i < N; i++) if (lakeD(pts[i].x, pts[i].z) < 1.5) hs[i] = Math.max(hs[i], WATER + .015);
  const cum = [0]; for (let i = 1; i < N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  ROUTES[k] = { pts, h: hs, cls, cum, len: cum[N - 1] };
}
// F 與 B 重疊段用 B 的高度，避免兩條帶子高度不同
{ const B = ROUTES.B, F = ROUTES.F; for (let i = 0; i < B.pts.length && i < F.pts.length; i++) F.h[i] = B.h[i]; }

// 設施平台高度對齊路面，避免連絡道變成陡坡
for (const f of Object.values(FACS)) {
  let best = 1e9, bh = f.padH;
  for (const k of ['D', 'B', 'H']) ROUTES[k].pts.forEach((p, i) => { const d = (p.x - f.sx) ** 2 + (p.z - f.sz) ** 2; if (d < best) { best = d; bh = ROUTES[k].h[i]; } });
  f.padH = bh + .004;
}

/* ---------- 路線點空間索引（刻地形、避開建築用） ---------- */
const RIDX = new Map(); const rkey = (i, j) => i * 1000 + j;
for (const k of ['D', 'B', 'H', 'F']) {
  const R = ROUTES[k];
  R.pts.forEach((p, i) => {
    const q = R.pts[Math.min(R.pts.length - 1, i + 1)], r = R.pts[Math.max(0, i - 1)];
    let tx = q.x - r.x, tz = q.z - r.z; const tl = Math.hypot(tx, tz) || 1;
    const key = rkey(Math.floor(p.x), Math.floor(p.z)); if (!RIDX.has(key)) RIDX.set(key, []);
    RIDX.get(key).push({ x: p.x, z: p.z, h: R.h[i], hw: CLS[R.cls[i]].hw, tx: tx / tl, tz: tz / tl, cls: R.cls[i] });
  });
}
function nearRoad(x, z, Rn = 2) {
  const ci = Math.floor(x), cj = Math.floor(z); let best = null, bd = 1e9;
  for (let i = -Rn; i <= Rn; i++) for (let j = -Rn; j <= Rn; j++) { const L = RIDX.get(rkey(ci + i, cj + j)); if (!L) continue; for (const p of L) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } } }
  return best ? { p: best, d: Math.sqrt(bd) } : { p: null, d: 1e9 };
}

/* ---------- 地形網格 ---------- */
const HG = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + i * CELL, z = Z0 + j * CELL; let h = baseH(x, z);
  const { p, d } = nearRoad(x, z); if (p && d < 1.4) h = lerp(h, p.h - .003, 1 - ss(p.hw + .05, 1.4, d));
  HG[j * NX + i] = h;
}
function hAt(x, z) {
  const fx = clamp((x - X0) / CELL, 0, NX - 1.001), fz = clamp((z - Z0) / CELL, 0, NZ - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  return lerp(lerp(HG[j * NX + i], HG[j * NX + i + 1], u), lerp(HG[(j + 1) * NX + i], HG[(j + 1) * NX + i + 1], u), v);
}
const yAt = (x, z) => hAt(x, z) * EX;
for (const f of Object.values(FACS)) f.oy = f.padH * EX;
