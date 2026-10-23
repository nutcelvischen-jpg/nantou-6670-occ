/* ============================================================
   05 班次最佳化：全年載客檢核、當日車輛與司機重排參數
   ============================================================ */
function hourlyDemand(date, dir) { const info = dayInfo(date), hs = hourShare(info, dir), tot = demandOf(date, dir); return hs.map((s) => s * tot); }   // 02 需求預測用
const DH = DATA.dh;                 // 票證推得的司機值勤與班距（聚合）
const FUEL = DATA.fuel.weeks[0];    // 能源署全國超級柴油週均價（build 前用 scripts/fetch_fuel.py 抓）
// 柴油價、月薪是外部資料；其餘標「假設」，需業者提供
const COST = { dieselP: FUEL.diesel, lpk: .33, maint: 8, sal: 52000, emp: .18, days: 22, ot: 'add', bus: 3200 };
const kmCost = () => COST.lpk * COST.dieselP + COST.maint;
// 每個值勤：日薪＝月薪×(1＋雇主負擔)÷每月出勤日；超過 8 小時依勞基法，前 2 小時 ×1.34、之後 ×1.67（時薪基準＝月薪÷240）
function dutyCost(span) {
  const day = COST.sal * (1 + COST.emp) / COST.days, x = Math.max(0, span - 8), hr = COST.sal / 240;
  return day + (COST.ot === 'add' ? hr * (1.34 * Math.min(2, x) + 1.67 * Math.max(0, x - 2)) : 0);
}
// 一年 × 平/假日 的實際車次，依 方向 × 發車小時 × 子線 聚合
function tripCells(year, off) {
  const cells = {}; let days = 0, trips = 0, low = 0, over = 0, rev = 0;
  for (const d of RDAYS) {
    if (!d.startsWith(year)) continue; const D = RP.days[d]; if (D.off !== off) continue; days++;
    for (const r of D.trips) {
      const [dir, code, , , seq, rv] = r; let l = 0, pk = 0, bd = 0; for (const s of seq) { l += s[2] - s[3]; bd += s[2]; if (l > pk) pk = l; }
      const h = Math.floor(seq[0][1] / 60), k = dir + '|' + h + '|' + code, c = (cells[k] ||= { dir, h, code, n: 0, pk: [], low: 0, over: 0, board: 0, rev: 0 });
      c.n++; c.pk.push(pk); c.board += bd; c.rev += rv; trips++; rev += rv; if (pk < 10) { c.low++; low++; } if (pk > CAP) { c.over++; over++; }
    }
  }
  for (const c of Object.values(cells)) { c.pk.sort((a, b) => a - b); c.mean = c.pk.reduce((a, b) => a + b, 0) / c.n; c.p90 = c.pk[Math.floor(c.n * .9)]; c.perDay = c.n / days; }
  return { cells: Object.values(cells), days, trips, low, over, rev };
}
function obsWait(sta, dir, off) { const a = Array(24).fill(null); for (const r of DH.hw) if (r[0] === sta && r[1] === dir && r[2] === off) a[r[3]] = r[6]; return a; }

/* ============================================================
   班次最佳化：基準＝資料 1:1；情境＝可調因素；最佳化＝演算法
   只動「同一天的實際車次」：重排車輛、重排司機、併班、加班車
   ============================================================ */
// 可調情境門檻；未涵蓋完整工時與休息認定，不構成法規合規判斷。
const RULE = { drive: 10, cont: 4, rest: 30, span: 12, turn: 10, signOn: 15, signOff: 10 };
const SCN = { growth: 0, shift: 0, lf: .9 };   // 運量外推 %、旅客可接受改搭 ± 分、併班後載客上限
// 空車調度時間：由兩年刷卡實測「A 區第一筆刷卡 → B 區第一筆刷卡」的行車時間，依出發小時取 P85（或中位）；樣本不足退回 45 km/h 推估
const DHM = { mode: 'p85' };
const DHOBS = (() => {
  const KEY = new Set(['TC', 'HSR', 'PULI', 'SML']), S = {}, RZK = RSTA.map((n) => { const z = BILL2Z[n]; return z === 'XS' ? 'SML' : z; });
  for (const d of RDAYS) for (const [, , , , seq] of RP.days[d].trips) {
    const first = {}; for (const [si, t] of seq) { const z = RZK[si]; if (KEY.has(z) && first[z] === undefined) first[z] = t; }
    const zs = Object.keys(first).sort((a, b) => first[a] - first[b]);
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) { const dt = first[zs[j]] - first[zs[i]]; if (dt > 0 && dt < 240) { const k = zs[i] + '>' + zs[j], h = Math.floor(first[zs[i]] / 60); ((S[k] ||= {})[h] ||= []).push(dt); (S[k].all ||= []).push(dt); } }
  }
  const q = (a, p) => { a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; }, out = {};
  for (const k in S) { out[k] = {}; for (const h in S[k]) if (S[k][h].length >= 30) out[k][h] = { p85: q(S[k][h], .85), p50: q(S[k][h], .5), n: S[k][h].length }; }
  return out;
})();
const DZ = (z) => (z === 'XS' ? 'SML' : z);
function dhT(a, b, tMin) {   // a → b 的空車時間（分）
  a = DZ(a); b = DZ(b); if (a === b) return 0;
  if (DHM.mode !== 'fixed') { const o = DHOBS[a + '>' + b]; if (o) { const r = o[Math.floor(tMin / 60)] || o.all; if (r) return Math.round(DHM.mode === 'p50' ? r.p50 : r.p85); } }
  return dhMin(a, b);
}
const dhKmOf = (a, b) => (DZ(a) === DZ(b) ? 0 : Math.max(0, dhMin(DZ(a), DZ(b)) - 5) * 45 / 60);
const RELZ = (z) => (z === 'HSR' ? 'TC' : z === 'XS' ? 'SML' : z === 'J9' ? 'YC' : z);
function dayTrips(date) { return RP.days[date].trips.map(mkRTrip).sort((a, b) => a.dep - b.dep).map((t) => ({ ...t, km: DUR_KM(t), z0: RELZ(t.startZ), z1: RELZ(t.endZ) })); }
// 一串車次（同一人或同一車）的工時檢查
function chainStats(L) {
  L = L.slice().sort((a, b) => a.dep - b.dep);
  let drive = 0, cont = 0, maxCont = 0;
  L.forEach((t, i) => { const run = t.arr - t.dep, gap = i ? t.dep - L[i - 1].arr : 1e9; cont = gap >= RULE.rest ? run : cont + run; maxCont = Math.max(maxCont, cont); drive += run; });
  const span = (L.at(-1).arr - L[0].dep) / 60;
  return { span, drive: drive / 60, maxCont: maxCont / 60, n: L.length, bad: span > RULE.span || drive / 60 > RULE.drive || maxCont / 60 > RULE.cont };
}
// 基準：資料中的實際車輛與司機
function baselineDay(date) {
  const T = dayTrips(date), byBus = {}, byDrv = {};
  for (const t of T) { (byBus[t.bus] ||= []).push(t); if (t.drv) (byDrv[t.drv] ||= []).push(t); }
  const duties = Object.values(byDrv).map(chainStats);
  return { T, buses: Object.keys(byBus).length, blocks: Object.values(byBus), duties, km: T.reduce((a, t) => a + t.km, 0), dhKm: null, rev: T.reduce((a, t) => a + t.rev, 0) };
}
// 演算法 1：最少車輛＝最小路徑覆蓋（二分圖最大匹配，Hopcroft–Karp 的 DFS 版即可，n ≤ 300）
function minFleet(T) {
  const n = T.length, gap = (a, b) => dhT(a.endZ, b.startZ, a.arr), adj = T.map((a, i) => { const L = []; for (let j = 0; j < n; j++) { const b = T[j]; if (b.dep >= a.arr + RULE.turn + gap(a, b)) L.push(j); } return L.sort((x, y) => (gap(a, T[x]) - gap(a, T[y])) || T[x].dep - T[y].dep); });
  const mR = Array(n).fill(-1), mL = Array(n).fill(-1);
  // 兩階段：先只用「不需空車調度」的邊求最大匹配，再放寬到含空車調度的邊繼續擴增（匹配數只增不減），讓空車公里盡量少
  let only0 = true;
  const aug = (u, seen) => { for (const v of adj[u]) { if (only0 && gap(T[u], T[v]) > 0) continue; if (seen[v]) continue; seen[v] = 1; if (mR[v] < 0 || aug(mR[v], seen)) { mR[v] = u; mL[u] = v; return true; } } return false; };
  for (let u = 0; u < n; u++) aug(u, new Uint8Array(n));
  only0 = false; for (let u = 0; u < n; u++) if (mL[u] < 0) aug(u, new Uint8Array(n));
  const blocks = []; for (let i = 0; i < n; i++) if (mR[i] < 0) { const B = []; for (let k = i; k >= 0; k = mL[k]) B.push(T[k]); blocks.push(B); }
  let dh = 0; for (const B of blocks) for (let i = 1; i < B.length; i++) dh += dhKmOf(B[i - 1].endZ, B[i].startZ);
  return { blocks, dhKm: dh };
}
// 演算法 2：司機排班（啟發式）。先在每台車的串接上，於端點切成未超出設定門檻的片段；再把同端點、休息足夠的片段接成一人一天
function crewSchedule(blocks) {
  const pieces = [];
  for (const B of blocks) {
    let cur = [];
    for (const t of B) { const next = [...cur, t]; if (cur.length && chainStats(next).bad) { pieces.push(cur); cur = [t]; } else cur = next; }
    if (cur.length) pieces.push(cur);
  }
  pieces.sort((a, b) => a[0].dep - b[0].dep);
  const duties = [];
  for (const p of pieces) {
    let best = null;
    for (const D of duties) { const last = D.at(-1); if (last.z1 !== p[0].z0 || p[0].dep - last.arr < RULE.rest) continue; if (chainStats([...D, ...p]).bad) continue; if (!best || last.arr > best.at(-1).arr) best = D; }
    if (best) best.push(...p); else duties.push([...p]);
  }
  return duties.map(chainStats);
}
// 演算法 2b：司機不綁車（可在端點換車），依發車時間逐班指派給「人在該端點、休息夠、加上這班仍未超出設定門檻」且最晚空出的司機
function crewFree(T) {
  const L = T.slice().sort((a, b) => a.dep - b.dep), D = [];
  for (const t of L) {
    let best = null;
    for (const d of D) {
      const last = d.at(-1); if (last.z1 !== t.z0 || t.dep < last.arr + RULE.turn) continue;
      if (chainStats([...d, t]).bad) continue;
      if (!best || last.arr > best.at(-1).arr) best = d;
    }
    if (best) best.push(t); else D.push([t]);
  }
  return D.map(chainStats);
}
// 情境：運量外推（每班載客等比放大）→ 超過座位的班次加開同時刻加班車；旅客可接受改搭 → 併班
function scenarioTrips(T) {
  const g = 1 + SCN.growth / 100, out = [], added = [], merged = [];
  for (const t of T) {
    const pk = t.peak * g, k = Math.max(1, Math.ceil(pk / CAP));
    for (let i = 0; i < k; i++) { const c = { ...t, id: t.id + (i ? 'x' + i : ''), peak: pk / k, board: t.board * g / k, rev: t.rev * g / k, extra: i > 0 }; out.push(c); if (i) added.push(c); }
  }
  if (SCN.shift > 0) {
    const cap = CAP * SCN.lf, alive = new Set(out), rk = (z) => ZRANK[z] ?? 0;
    for (const a of out.slice().sort((x, y) => x.peak - y.peak)) {
      if (!alive.has(a) || a.peak >= cap / 2) continue;
      let best = null;
      for (const b of alive) {
        if (b === a || b.dir !== a.dir || Math.abs(b.dep - a.dep) > SCN.shift || b.peak + a.peak > cap) continue;
        const cov = a.dir === 0 ? rk(b.startZ) <= rk(a.startZ) && rk(b.endZ) >= rk(a.endZ) : rk(b.startZ) >= rk(a.startZ) && rk(b.endZ) <= rk(a.endZ);
        if (!cov) continue; if (!best || Math.abs(b.dep - a.dep) < Math.abs(best.dep - a.dep)) best = b;
      }
      if (best) { alive.delete(a); best.peak += a.peak; best.board += a.board; best.rev += a.rev; merged.push({ a, b: best, dt: best.dep - a.dep }); }
    }
    return { T: out.filter((t) => alive.has(t)).sort((x, y) => x.dep - y.dep), added, merged };
  }
  return { T: out.sort((x, y) => x.dep - y.dep), added, merged };
}
// 司機人數下限：任一時刻同時行駛的車次數（每班需一位司機），與「總駕駛時數 ÷ 每日駕車上限」取大者
function driverLB(T) {
  const ev = []; for (const t of T) { ev.push([t.dep, 1]); ev.push([t.arr, -1]); } ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0, mx = 0; for (const [, d] of ev) { c += d; mx = Math.max(mx, c); }
  const drive = T.reduce((a, t) => a + (t.arr - t.dep), 0) / 60;
  return { lb: Math.max(mx, Math.ceil(drive / RULE.drive)), conc: mx, byDrive: Math.ceil(drive / RULE.drive) };
}
function dayCost(r) {
  const km = r.km + (r.dhKm || 0), fuel = km * COST.lpk * COST.dieselP, mt = km * COST.maint, drv = r.duties.reduce((a, d) => a + dutyCost(d.span + (RULE.signOn + RULE.signOff) / 60), 0), fix = r.buses * COST.bus;
  return { fuel, mt, drv, fix, total: fuel + mt + drv + fix };
}
const CREW = { sw: false };   // 預設一人一車（司機跟自己的車）；可切換成允許在端點換車
function bestCrew(blocks, T) { const a = crewSchedule(blocks); if (!CREW.sw) { a.method = '跟車'; return a; } const b = crewFree(T); const r = b.length < a.length ? b : a; r.method = b.length < a.length ? '可換車' : '跟車'; r.alt = { follow: a.length, free: b.length }; return r; }
// 延誤韌性：win 時段發車的班次各晚到 delay 分，沿每台車的串接順延
const DELAY = { min: 30, win: [900, 1080] };
function cascade(blocks) {
  let affected = 0, lateSum = 0, maxLate = 0;
  for (const B of blocks) {
    const L = B.slice().sort((a, b) => a.dep - b.dep); let ready = -1e9;
    L.forEach((t, i) => {
      const start = Math.max(t.dep, ready), late = start - t.dep;
      if (late > 5) { affected++; lateSum += late; maxLate = Math.max(maxLate, late); }
      const extra = t.dep >= DELAY.win[0] && t.dep < DELAY.win[1] ? DELAY.min : 0, arr = start + (t.arr - t.dep) + extra, nx = L[i + 1];
      ready = arr + RULE.turn + (nx ? dhT(t.endZ, nx.startZ, t.arr) : 0);
    });
  }
  return { affected, lateSum, maxLate };
}
// 官網主表 vs 當日刷卡車次：同方向、在任一共同停靠區的時刻相差 ≤ MATCH_TOL 分即視為同一班（貪婪一對一）
let MATCH_TOL = 10;
function matchTimetable(date) {
  if (date < DATA.tt.effective_from) return null;
  const sched = ttTripsFor(dayInfo(date)), card = dayTrips(date), used = new Set(), miss = [];
  const stz = (tr) => { const m = {}; for (const [n, t] of tr.stopsTxt) { const z = TT2Z[n]; if (z && m[z] === undefined) m[z] = t; } return m; };
  for (const s of sched.slice().sort((a, b) => a.dep - b.dep)) {
    const sz = stz(s); let best = null, bd = MATCH_TOL + 1;
    for (const c of card) { if (used.has(c) || c.dir !== s.dir) continue; for (const e of c.ev) { if (sz[e.z] === undefined) continue; const d = Math.abs(sz[e.z] - e.t); if (d < bd) { bd = d; best = c; } } }
    if (best) used.add(best); else miss.push(s);
  }
  return { sched: sched.length, matched: sched.length - miss.length, miss, extra: card.filter((c) => !used.has(c)) };
}
function optimizeDay(date) {
  const base = baselineDay(date);
  const S = scenarioTrips(base.T), F = minFleet(S.T), duties = bestCrew(F.blocks, S.T);
  const only = minFleet(base.T), onlyDuties = bestCrew(only.blocks, base.T);   // 只重排、不改車次
  const opt = { T: S.T, buses: F.blocks.length, blocks: F.blocks, duties, km: S.T.reduce((a, t) => a + t.km, 0), dhKm: F.dhKm, rev: S.T.reduce((a, t) => a + t.rev, 0), added: S.added, merged: S.merged };
  const re = { T: base.T, buses: only.blocks.length, blocks: only.blocks, duties: onlyDuties, km: base.km, dhKm: only.dhKm, rev: base.rev };
  for (const x of [base, opt, re]) { x.cost = dayCost(x); x.cas = cascade(x.blocks); }
  return { base, re, opt };
}
