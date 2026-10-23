
/* ============================================================
   班次最佳化：每小時所需班次 → 建議班表 → 車輛串接
   ============================================================ */
const SCENARIO = { demandMultiplier: 1 };
function scenarioDemand(date, dir) { return demandOf(date, dir) * SCENARIO.demandMultiplier; }
const OPT = { lf: .75, floor: 1, buf: .15, fuel: 'd', fleet: 0 };
const PEAK_RATIO = (() => { // 每班「最大區段在車」/「上車人數」，由推估車次求得
  let a = 0, b = 0; for (const r of Y25.trip_hour) { a += r.peak_mean * r.trips_per_day; b += r.pax_mean * r.trips_per_day; } return a / b;
})();
function hourlyDemand(date, dir) { const info = dayInfo(date), hs = hourShare(info, dir), tot = scenarioDemand(date, dir); return hs.map((s) => s * tot); }
function currentByHour(trips, dir) { const n = Array(24).fill(0); for (const t of trips) if (t.dir === dir) n[Math.floor(t.dep / 60)]++; return n; }
const TEMPLATES = {};   // `${dir}|${code}` → 範本班次（各站相對時間）
DATA.tt.trips.forEach(([dir, code, , stops]) => { const k = dir + '|' + code + '|' + TT2Z[stops[0][0]]; if (!TEMPLATES[k]) { const t0 = hm(stops[0][1]); TEMPLATES[k] = stops.map(([n, t]) => [n, hm(t) - t0]); } });
function proposeTrips(date) {
  const info = dayInfo(date), cur = ttTripsFor(info), plan = [];
  const curFleet = buildBlocks(cur.map((t) => ({ ...t }))).length, limit = OPT.fleet || curFleet;
  const pri = (p) => (p.code === '6670' ? 0 : p.code === '6670H' ? 1 : p.code === '6670B' || p.code === '6670F' ? 2 : 3);
  for (const dir of [0, 1]) {
    const dem = hourlyDemand(date, dir), have = currentByHour(cur, dir);
    const first = cur.find((t) => t.dir === dir).dep, last = cur.filter((t) => t.dir === dir).at(-1).dep;
    for (let h = 0; h < 24; h++) {
      const inWin = h * 60 + 59 >= first && h * 60 <= last, peakLoad = dem[h] * PEAK_RATIO * (1 + OPT.buf);
      const need = inWin ? Math.max(OPT.floor, Math.ceil(peakLoad / (CAP * OPT.lf))) : 0;
      plan.push({ dir, h, cur: have[h], need, ideal: need, dem: dem[h], peakLoad, first, last, pats: cur.filter((t) => t.dir === dir && Math.floor(t.dep / 60) === h).map((t) => ({ code: t.code, start: t.startZ })) });
    }
  }
  const cellTrips = (c) => {
    if (!c.need) return [];
    let pats = c.pats.slice();
    while (pats.length > c.need) { pats.sort((a, b) => pri(a) - pri(b)); pats.shift(); }
    const addSeq = c.dir === 0 ? [['6670D', 'TC'], ['6670H', 'TC'], ['6670B', 'TC']] : [['6670D', 'SML'], ['6670H', 'PULI'], ['6670B', 'SML']];
    let ai = 0; while (pats.length < c.need) { const [code, start] = addSeq[ai++ % addSeq.length]; pats.push({ code, start }); }
    pats.sort((a, b) => pri(b) - pri(a));
    return pats.map((p, i) => {
      const from = Math.max(c.h * 60, c.first), to = Math.min(c.h * 60 + 59, c.last);
      const dep = Math.round(from + (to - from) * (i + .5) / pats.length);
      const tpl = TEMPLATES[c.dir + '|' + p.code + '|' + p.start] || TEMPLATES[c.dir + '|6670D|' + (c.dir ? 'SML' : 'TC')];
      return makeTrip(c.dir, p.code, tpl.map(([n, dt]) => [TT2Z[n], dep + dt, n]), `op${c.dir}-${c.h}-${i}`);
    });
  };
  const all = () => plan.flatMap(cellTrips).sort((a, b) => a.dep - b.dep);
  let trips = all(), fleet = buildBlocks(trips.map((t) => ({ ...t }))).length, guard = 0;
  // 車隊上限：從「每班預期載客最少」的時段開始減班，直到車輛數符合
  while (fleet > limit && guard++ < 200) {
    let best = null, bv = 1e9; for (const c of plan) if (c.need > OPT.floor && c.need > 0) { const v = c.peakLoad / c.need; if (v < bv) { bv = v; best = c; } }
    if (!best) break; best.need--; trips = all(); fleet = buildBlocks(trips.map((t) => ({ ...t }))).length;
  }
  return { trips, plan, fleet, curFleet, limit, feasible: fleet <= limit };
}
const CO2 = (vkm) => OPT.fuel === 'd' ? vkm * 1.585 : vkm * 1.25 * .474;
function evalPlan(date, trips, cong, seed = 7) {
  const s = new Sim({ date, trips, demand: scenarioDemand, cong, seed, start: 300 });
  s.run(24 * 60 + 60);
  const r = s.summary(); r.co2 = CO2(r.vkm); return r;
}
