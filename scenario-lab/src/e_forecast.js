
/* ============================================================
   需求預測：log(上車數) = 趨勢 + 星期 + 月份 + 假日效果
   ============================================================ */
const T0 = isoD('2024-01-01');
const CNY = new Set(); addR2('2024-02-08', '2024-02-14'); addR2('2025-01-25', '2025-02-02'); addR2('2026-02-14', '2026-02-22');
function addR2(a, b) { for (let d = isoD(a); d <= isoD(b); d.setDate(d.getDate() + 1)) CNY.add(iso(d)); }
const FEAT = ['截距', '趨勢（每年）', '週一', '週二', '週三', '週四', '週五', '週六', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '國定假日', '連假首日', '連假末日', '假期前一天', '春節'];
function feats(s) {
  const d = isoD(s), info = dayInfo(s), x = new Array(FEAT.length).fill(0);
  x[0] = 1; x[1] = (d - T0) / 864e5 / 365;
  if (info.dow >= 1) x[1 + info.dow] = 1;
  const m = d.getMonth(); if (m >= 1) x[7 + m] = 1;
  x[19] = info.holi && info.dow >= 1 && info.dow <= 5 ? 1 : 0; x[20] = info.longStart ? 1 : 0; x[21] = info.longEnd ? 1 : 0; x[22] = info.preOff ? 1 : 0; x[23] = CNY.has(s) ? 1 : 0;
  return x;
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function fitLog(rows, lam = .3) {   // rows: [{x, y}]
  const k = FEAT.length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (const { x, y } of rows) { const ly = Math.log(y + 1); for (let i = 0; i < k; i++) { b[i] += x[i] * ly; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; } }
  for (let i = 1; i < k; i++) A[i][i] += lam;
  return solve(A, b);
}
const predLog = (w, x) => x.reduce((s, v, i) => s + v * w[i], 0);
const median = (a) => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

const SERIES = [];   // {date, v:[out,in]}
for (const y of DATA.agg.years) for (const r of y.daily) SERIES.push({ date: r.date, v: [r.out, r.in] });
SERIES.sort((a, b) => a.date < b.date ? -1 : 1);
const SER_MAP = new Map(SERIES.map((r) => [r.date, r]));

const FC = { models: [], back: null, anomalies: [], sigma: [0, 0] };
function trainAll(cut) {
  const out = [];
  for (const dir of [0, 1]) {
    let rows = SERIES.filter((r) => r.date <= cut && Number.isFinite(r.v[dir]) && r.v[dir] >= 0).map((r) => ({ date: r.date, x: feats(r.date), y: r.v[dir] }));
    let w = fitLog(rows);
    const res = rows.map((r) => Math.log(r.y + 1) - predLog(w, r.x)), med = median(res), mad = median(res.map((e) => Math.abs(e - med))) * 1.4826;
    const keep = rows.filter((r, i) => Math.abs(res[i] - med) / Math.max(mad, 1e-9) <= 3.5);
    const anom = rows.filter((r, i) => Math.abs(res[i] - med) / Math.max(mad, 1e-9) > 3.5).map((r, i) => ({ date: r.date, dir, y: r.y, z: 0 }));
    w = fitLog(keep);
    const res2 = keep.map((r) => Math.log(r.y + 1) - predLog(w, r.x));
    const sigma = Math.sqrt(res2.reduce((s, e) => s + e * e, 0) / res2.length);
    out.push({ w, sigma, anom, n: keep.length });
  }
  return out;
}
// 回測：以 2025-10-31 為界
{
  const cut = '2025-10-31', pts = [];
  let aeM = 0, aeB = 0, sumY = 0, validCount = 0;
  for (const r of SERIES.filter((r) => r.date > cut)) {
    const prev = isoD(r.date); prev.setDate(prev.getDate() - 1);
    const M = trainAll(iso(prev)); // rolling origin: both models see only earlier dates
    const x = feats(r.date), y = r.v[0] + r.v[1];
    const pm = Math.exp(predLog(M[0].w, x)) - 1 + Math.exp(predLog(M[1].w, x)) - 1;
    const hist = []; for (let k = 1; k <= 4; k++) { const d = isoD(r.date); d.setDate(d.getDate() - 7 * k); const h = SER_MAP.get(iso(d)); if (h) hist.push(h.v[0] + h.v[1]); }
    const pb = hist.length >= 2 ? median(hist) : NaN;
    pts.push({ date: r.date, y, pm, pb });
    if (Number.isFinite(pb) && Number.isFinite(pm)) { validCount++; aeM += Math.abs(y - pm); aeB += Math.abs(y - pb); sumY += y; }
  }
  FC.back = { pts, wapeM: aeM / sumY, wapeB: aeB / sumY, maeM: aeM / validCount, maeB: aeB / validCount, validCount };
}
FC.models = trainAll('2099-12-31');
FC.anomalies = [...FC.models[0].anom, ...FC.models[1].anom].reduce((m, a) => { const e = m.get(a.date) || { date: a.date, dirs: [], y: [...SER_MAP.get(a.date).v] }; e.dirs.push(a.dir); e.y[a.dir] = a.y; m.set(a.date, e); return m; }, new Map());
function forecast(date, dir) {
  const m = FC.models[dir], x = feats(date), mu = predLog(m.w, x);
  return { mean: Math.max(0, Math.exp(mu) - 1), lo: Math.max(0, Math.exp(mu - 1.2816 * m.sigma) - 1), hi: Math.exp(mu + 1.2816 * m.sigma) - 1 };
}
// 模擬用需求：歷史日期用實際刷卡數，其餘用預測
function demandOf(date, dir) {
  const h = SER_MAP.get(date); if (h) return h.v[dir];
  return forecast(date, dir).mean;
}
