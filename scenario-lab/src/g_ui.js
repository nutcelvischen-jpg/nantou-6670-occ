
/* ============================================================
   即時模擬狀態
   ============================================================ */
const LIVE = { date: $('#day').value, plan: 'cur', cong: false, speed: 360, paused: false, acc: 0, sim: null, opt: null, sel: null, only: false, follow: false };
function tripsFor(plan) { return plan === 'opt' ? (LIVE.opt ||= proposeTrips(LIVE.date)).trips : ttTripsFor(dayInfo(LIVE.date)); }
function buildLive(startMin = 360) {
  if (LIVE.plan === 'opt' && !(LIVE.opt ||= proposeTrips(LIVE.date)).feasible) LIVE.plan = 'cur';
  for (const x of $('#plan').children) x.setAttribute('aria-pressed', x.dataset.p === LIVE.plan);
  LIVE.sim = new Sim({ date: LIVE.date, trips: tripsFor(LIVE.plan), demand: demandOf, cong: LIVE.cong, seed: 7, start: 300 });
  LIVE.sim.run(startMin); LIVE.acc = 0;
  for (const v of Object.values(VIS)) v.root.visible = false;
  if (LIVE.sel && !LIVE.sim.buses.find((b) => b.id === LIVE.sel)) select(null);
  renderList(true); refreshUI(true);
}
function jumpTo(min) {
  min = clamp(Math.round(min), 300, 24 * 60 + 30);
  if (min < LIVE.sim.t) buildLive(min); else LIVE.sim.run(min);
  LIVE.acc = 0; refreshUI(true);
}
const SIM = () => LIVE.sim;
const nowT = () => LIVE.sim.t - 1 + LIVE.acc;

/* ---------- 估計 ETA ---------- */
function tripLateness(tr) {  // 正在跑：目前落後幾分
  if (!tr.st) return 0; const s = SIM(); return Math.max(0, s.t - (tr.dep + tr.st.tau));
}
function busEstFree(b) { // 這台車何時能接下一班
  const s = SIM(); if (b.state === 'run') { const tr = b.trip; return s.t + (tr.arr - (tr.dep + tr.st.tau)) + 5; } if (b.state === 'dh') return b.dh.t0 + b.dh.dur + 3; return s.t;
}
function etaAt(tr, z) {
  const d = tr.path.zd[z]; if (d === undefined) return null;
  const sched = schedT(tr, d);
  if (tr.st && !tr.done) return sched + tripLateness(tr);
  if (tr.done) return null;
  const b = SIM().buses.find((x) => x.id === tr.busId); let late = 0;
  if (b && b.plan[b.k] === tr) late = Math.max(0, busEstFree(b) - tr.dep);
  return sched + late;
}
function nextDepartures(z, dir, n = 3) {
  const s = SIM(), out = [];
  for (const tr of s.trips) {
    if (tr.dir !== dir || !tr.zones.includes(z) || tr.zones.at(-1) === z) continue;
    if (tr.st && tr.st.zi > tr.zones.indexOf(z)) continue;
    const eta = etaAt(tr, z); if (eta === null || eta < s.t - 1) continue;
    out.push({ tr, eta, sched: schedT(tr, tr.path.zd[z]) });
  }
  return out.sort((a, b) => a.eta - b.eta).slice(0, n);
}

/* ============================================================
   車輛 3D
   ============================================================ */
const VIS = {}; const pickables = [];
function visOf(b) {
  if (VIS[b.id]) return VIS[b.id];
  const root = new THREE.Group(); root.rotation.order = 'YZX';
  const scaler = new THREE.Group(); root.add(scaler);
  const model = BUS_T.grp.clone(true); scaler.add(model);
  const wheels = []; model.traverse((o) => { if (o.userData.wheel) wheels.push(o); });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(BUS_T.L * 1.25, BUS_T.Wd * 2.2), haloMat); halo.rotation.x = -Math.PI / 2; halo.position.set(-.2, .03, 0); scaler.add(halo);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(BUS_T.L * 1.4, 4.5, BUS_T.Wd * 2.2), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = 2; pick.userData.id = b.id; scaler.add(pick); pickables.push(pick);
  scene.add(root);
  const mk = document.createElement('button'); mk.className = 'vm'; mk.textContent = b.id.slice(1); mk.title = b.id; mk.onclick = (e) => { e.stopPropagation(); select(b.id); }; labelsEl.appendChild(mk);
  return (VIS[b.id] = { root, scaler, model, wheels, halo, mk, mag: 10, spin: 0, last: null, yaw: 0, lit: false });
}
function setLit(v, on) { if (v.lit === on) return; v.lit = on; v.model.traverse((o) => { if (o.isLineSegments) o.material = on ? EDGE_LIT : EDGE; }); v.halo.material = on ? haloLitMat : haloMat; }
const _st = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), cls: 'hw', i: 0 };
function busPose(b, acc) {
  if (b.state === 'run') {
    const st = b.trip.st; pathPoint(b.trip.path, lerp(st.dPrev, st.d, acc), _st);
    const d = _st.dir, hl = Math.hypot(d.x, d.z) || 1, off = CLS[_st.cls].lane;
    return { x: _st.pos.x - d.z / hl * off, y: _st.pos.y, z: _st.pos.z + d.x / hl * off, yaw: Math.atan2(-d.z, d.x), pitch: Math.atan2(d.y, hl), moving: true };
  }
  if (b.state === 'dh') {
    const P0 = PATHS.D[0], dA = b.dh.from === 'XS' ? P0.zd.SML : P0.zd[b.dh.from], dB = b.dh.to === 'XS' ? P0.zd.SML : P0.zd[b.dh.to];
    const k = clamp((SIM().t - 1 + acc - b.dh.t0) / b.dh.dur, 0, 1), path = dB >= dA ? P0 : PATHS.D[1];
    const a = dB >= dA ? dA : P0.len - dA, c = dB >= dA ? dB : P0.len - dB;
    pathPoint(path, lerp(a, c, k), _st); const d = _st.dir, hl = Math.hypot(d.x, d.z) || 1, off = CLS[_st.cls].lane;
    return { x: _st.pos.x - d.z / hl * off, y: _st.pos.y, z: _st.pos.z + d.x / hl * off, yaw: Math.atan2(-d.z, d.x), pitch: Math.atan2(d.y, hl), moving: true };
  }
  if (b.slot) return { x: b.slot.pos.x, y: b.slot.pos.y, z: b.slot.pos.z, yaw: b.slot.yaw, pitch: 0 };
  const f = b.parkFac, e = f.entryW, i = (parseInt(b.id.slice(1)) % 6) * .012;
  return { x: e.x - Math.sin(f.yaw) * i, y: e.y, z: e.z - Math.cos(f.yaw) * i, yaw: f.yaw + Math.PI / 2, pitch: 0 };
}
function updateVehicles(acc) {
  const s = SIM(); const camD = camera.position.distanceTo(controls.target);
  for (const b of s.buses) {
    const v = visOf(b), p = busPose(b, acc), show = b.state !== 'done' || true;
    const hide = LIVE.only && LIVE.sel && LIVE.sel !== b.id;
    v.root.visible = show && !hide;
    const cd = camera.position.distanceTo(_p.set(p.x, p.y, p.z));
    v.mag = lerp(v.mag, clamp(cd * .42, 3, 40), .25); v.scaler.scale.setScalar(v.mag * .001);
    if (v.last) {
      const moved = Math.hypot(p.x - v.last.x, p.z - v.last.z);
      v.spin -= Math.min(.7, moved * 1000 / (BUS_T.r * v.mag)); for (const w of v.wheels) w.rotation.z = v.spin;
      let dy = p.yaw - v.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; v.yaw += dy * (moved > .2 ? 1 : .35);
    } else v.yaw = p.yaw;
    v.last = p; v.root.position.set(p.x, p.y + v.mag * .00012, p.z); v.root.rotation.set(0, v.yaw, p.pitch * .8);
    setLit(v, LIVE.sel === b.id);
    v.mk.className = 'vm ' + (b.state === 'run' ? (b.trip.dir ? 'in' : '') : 'idle') + (LIVE.sel === b.id ? ' on' : '');
    v.mk.dataset.vis = hide ? '0' : '1';
  }
}

/* ============================================================
   標籤
   ============================================================ */
const labelsEl = $('#labels'); const LABELS = [];
function addLabel(html, pos, cls) { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; labelsEl.appendChild(el); const L = { el, pos, cls }; LABELS.push(L); return L; }
const ZLABEL = {};
for (const [z, stop, nm] of [['TC', '干城站', '台中干城站'], ['HSR', '高鐵臺中站', '高鐵台中站'], ['PULI', '埔里站', '埔里站'], ['SML', '日月潭', '日月潭 水社'], ['XS', '向山行政中心', '向山'], ['JNU', '暨南大學(校內)', '暨南大學'], ['YC', '魚池', '魚池']]) {
  const s = STOPS[stop], f = Object.values(FACS).find((f) => f.stop === stop), y = f ? f.oy + .1 : yAt(s[0], s[1]) + .05;
  ZLABEL[z] = addLabel(`<b>${nm}<em></em></b><i></i><s></s>`, new THREE.Vector3(f ? f.ox : s[0], y, f ? f.oz : s[1]), f ? 'lb' : 'lb stop');
}
for (const [nm, la, lo] of [['台中市區', 24.152, 120.675], ['烏日', 24.106, 120.628], ['霧峰', 24.062, 120.70], ['草屯', 23.975, 120.683], ['南投', 23.912, 120.684], ['國姓', 24.040, 120.857]]) { const [x, z] = P(la, lo); addLabel(`<b>${nm}</b>`, new THREE.Vector3(x, yAt(x, z) + .1, z), 'lb minor'); }
addLabel('<b>日月潭</b>', new THREE.Vector3(LAKE[0], WATER * EX + .05, LAKE[1] + .5), 'lb minor');
for (let km = 0; km <= 40; km += 10) addLabel(km ? km + ' km' : '0', new THREE.Vector3(X0 + km, SKIRT, Z0 + D + .9), 'tick');
const vtag = document.createElement('div'); vtag.className = 'vtag'; vtag.style.display = 'none'; labelsEl.appendChild(vtag);
const _v = new THREE.Vector3();
function placeLabels(w, h) {
  const s = SIM();
  for (const [z, L] of Object.entries(ZLABEL)) { const n = s.queueAt(z); const em = L.el.querySelector('em'); em.textContent = n ? n + ' 人' : ''; em.className = n > CAP ? 'hot' : ''; }
  for (const L of LABELS) {
    _v.copy(L.pos).project(camera);
    if (!(_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1)) { L.el.style.display = 'none'; continue; }
    L.el.style.display = '';
    if (L.cls.includes('minor')) L.el.style.opacity = clamp(1.6 - camera.position.distanceTo(L.pos) / 40, 0, 1);
    const ty = L.cls === 'tick' ? '0' : '-100%';
    L.el.style.transform = `translate(${(_v.x * .5 + .5) * w}px,${(-_v.y * .5 + .5) * h}px) translate(-50%,${ty})`;
  }
  const camD = camera.position.distanceTo(controls.target), far = clamp((camD - 3) / 6, 0, 1);
  for (const b of s.buses) {
    const v = VIS[b.id]; if (!v) continue; const mk = v.mk;
    if (mk.dataset.vis === '0' || (far <= 0 && LIVE.sel !== b.id)) { mk.style.display = 'none'; continue; }
    _v.copy(v.root.position).project(camera); if (_v.z > 1) { mk.style.display = 'none'; continue; }
    mk.style.display = ''; mk.style.opacity = LIVE.sel === b.id ? 1 : far;
    mk.style.transform = `translate(${(_v.x * .5 + .5) * w}px,${(-_v.y * .5 + .5) * h}px) translate(-50%,-50%)`;
  }
}

/* ============================================================
   平面圖（選取車輛）
   ============================================================ */
const MINI = { svg: $('#miniMap'), W: 340, H: 250 };
{
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const k of ['D', 'B', 'H', 'F']) for (const p of ROUTES[k].pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const pad = 16, sc = Math.min((MINI.W - pad * 2) / (x1 - x0), (MINI.H - pad * 2) / (z1 - z0));
  const ox = (MINI.W - (x1 - x0) * sc) / 2, oz = (MINI.H - (z1 - z0) * sc) / 2;
  MINI.m = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
  const line = (k, col, w, off) => { const R = ROUTES[k]; let d = ''; R.pts.forEach((p, i) => { if (i % 3 && i !== R.pts.length - 1) return; const [a, b] = MINI.m(p.x, p.z); d += (d ? 'L' : 'M') + (a + off).toFixed(1) + ' ' + (b + off).toFixed(1); }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`; };
  let html = `<rect x="0" y="0" width="${MINI.W}" height="${MINI.H}" rx="10" fill="var(--chip)"/><g transform="translate(10,${MINI.H - 40})" style="font:9.5px 'Noto Sans TC';fill:var(--text)"><rect width="12" height="3" y="0" fill="var(--route)"/><text x="16" y="4">D/A 經埔里</text><rect width="12" height="3" y="12" fill="var(--route-b)"/><text x="16" y="16">B/F 直達潭</text><rect width="12" height="3" y="24" fill="var(--route-h)"/><text x="16" y="28">H 到埔里</text></g>`;
  const [lx, lz] = MINI.m(LAKE[0], LAKE[1]); html += `<ellipse cx="${lx}" cy="${lz}" rx="${1.9 * sc}" ry="${1.55 * sc}" fill="var(--water)" opacity=".7"/>`;
  html += line('D', 'var(--card)', 7, 0) + line('F', 'var(--card)', 7, 0) + line('F', 'var(--route-b)', 5, 0) + line('D', 'var(--route)', 3, 0) + line('H', 'var(--route-h)', 1.3, 0);
  for (const [stop, nm, anchor] of [['干城站', '台中', 'start'], ['高鐵臺中站', '高鐵', 'end'], ['埔里站', '埔里', 'start'], ['暨南大學(校內)', '暨大', 'end'], ['魚池', '魚池', 'start'], ['日月潭', '日月潭', 'end'], ['向山行政中心', '向山', 'end']]) {
    const [a, b] = MINI.m(...STOPS[stop]); const dx = anchor === 'start' ? 7 : -7;
    html += `<circle cx="${a}" cy="${b}" r="3.2" fill="var(--card)" stroke="var(--strong)" stroke-width="1.2"/><text x="${a + dx}" y="${b + 3.5}" text-anchor="${anchor}" style="font:500 10.5px 'Noto Sans TC';fill:var(--strong)">${nm}</text>`;
  }
  html += `<g id="miniDots"></g><g id="miniSel"><circle r="11" fill="var(--lit)" opacity=".18"><animate attributeName="r" values="7;13;7" dur="1.6s" repeatCount="indefinite"/></circle><circle r="5.5" fill="var(--lit)" stroke="var(--card)" stroke-width="1.6"/><text id="miniSelT" y="-10" text-anchor="middle" style="font:500 10px var(--mono);fill:var(--lit)"></text></g>`;
  html += `<g transform="translate(${MINI.W - 30},${MINI.H - 16})"><line x1="0" y1="0" x2="${10 * sc > 60 ? 5 * sc : 10 * sc}" y2="0" stroke="var(--muted)"/><text x="0" y="-4" style="font:9px var(--mono);fill:var(--muted)">${10 * sc > 60 ? 5 : 10} km</text></g>`;
  MINI.svg.innerHTML = html;
  MINI.dots = MINI.svg.querySelector('#miniDots'); MINI.sel = MINI.svg.querySelector('#miniSel'); MINI.selT = MINI.svg.querySelector('#miniSelT');
}
const STATE_ZH = { idle: ['待命', ''], lay: ['端點休息', ''], run: ['行駛中', 'run'], dh: ['空車調度', 'in'], done: ['收班', 'ok'] };
function select(id) {
  LIVE.sel = id; $('#mini').hidden = !id; LIVE.follow = false;
  if (!id && LIVE.only) { LIVE.only = false; $('#only').setAttribute('aria-pressed', 'false'); }
  renderList(true); updateMini();
}
function busLoc(b) {
  if (b.state === 'run') {
    const tr = b.trip, st = tr.st, zs = tr.zones; let prev = zs[0], next = null;
    for (const z of zs) { if (tr.path.zd[z] <= st.d + 1e-6) prev = z; else { next = z; break; } }
    return { prev, next };
  }
  return { at: b.term };
}
function updateMini() {
  if (!LIVE.sel) return; const s = SIM(), b = s.buses.find((x) => x.id === LIVE.sel); if (!b) return;
  // 所有車小點
  let dots = '';
  for (const o of s.buses) { if (o.id === b.id) continue; const v = VIS[o.id]; if (!v || !v.last) continue; const [a, c] = MINI.m(v.last.x, v.last.z); dots += `<circle cx="${a.toFixed(1)}" cy="${c.toFixed(1)}" r="2.6" fill="${o.state === 'run' ? (o.trip.dir ? 'var(--accent2)' : 'var(--accent)') : 'var(--muted)'}" opacity="${LIVE.only ? .15 : .7}"/>`; }
  MINI.dots.innerHTML = dots;
  const v = VIS[b.id]; if (v && v.last) { const [a, c] = MINI.m(v.last.x, v.last.z); MINI.sel.setAttribute('transform', `translate(${a.toFixed(1)},${c.toFixed(1)})`); MINI.selT.textContent = b.id; }
  const [stz, cls] = STATE_ZH[b.state] || ['—', '']; const tr = b.trip;
  $('#miniName').textContent = `${b.id}${tr ? ' · ' + tr.code + (tr.dir ? ' 往台中' : tr.zones.at(-1) === 'PULI' ? ' 往埔里' : ' 往日月潭') : ''}`;
  const late = tr ? Math.round(tripLateness(tr)) : 0;
  $('#miniState').textContent = late >= 5 ? `延誤 ${late} 分` : stz; $('#miniState').className = 'chip ' + (late >= 5 ? 'late' : cls);
  const L = busLoc(b); let facts;
  if (tr) {
    const nz = L.next, eta = nz ? etaAt(tr, nz) : null;
    facts = [['在車人數', `${b.load}<small style="font-size:15px;color:var(--muted)"> / ${CAP}</small>`], ['目前位置', `${ZNAME[L.prev]}→${nz ? ZNAME[nz] : '終點'}`], ['下一站預計', eta ? fmt(eta) : '—'],
      ['表定發車', fmt(tr.dep)], ['本班已上車', tr.st.board + ' 人'], ['終點預計', fmt(tr.arr + late)]];
    $('#miniSeat').style.width = (b.load / CAP * 100) + '%'; $('#miniSeat').style.background = b.load > CAP * .9 ? 'var(--lit)' : 'var(--accent)';
  } else {
    const nx = b.plan[b.k];
    facts = [['在車人數', '0'], ['目前位置', ZNAME[b.state === 'dh' ? b.dh.to : b.term] + (b.state === 'dh' ? '（途中）' : '')], ['下一班', nx ? fmt(nx.dep) : '今日收班'],
      ['下一班路線', nx ? nx.code + (nx.dir ? ' 往台中' : ' 往日月潭') : '—'], ['今日已跑', b.done + ' 班'], ['今日排班', b.plan.length + ' 班']];
    $('#miniSeat').style.width = '0%';
  }
  $('#miniFacts').innerHTML = facts.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#miniNote').textContent = '位置與人數為模擬值（依班表與票證需求），非即時 GPS。';
}
$('#miniClose').onclick = () => select(null);
$('#miniFollow').onclick = () => { LIVE.follow = !LIVE.follow; $('#miniFollow').textContent = LIVE.follow ? '停止跟隨' : '在 3D 跟隨'; if (LIVE.follow) { const v = VIS[LIVE.sel]; flyTo(v.root.position.clone(), v.root.position.clone().add(new THREE.Vector3(-.5, .55, .9))); } };
$('#miniAsk').onclick = () => { setTab('bot'); setMode('ops'); ask(`${LIVE.sel} 現在在哪？`); };
$('#only').onclick = () => { if (!LIVE.sel) { const b = SIM().buses.find((x) => x.state === 'run'); if (b) select(b.id); } LIVE.only = !LIVE.only && !!LIVE.sel; $('#only').setAttribute('aria-pressed', LIVE.only); };

/* ============================================================
   鏡頭
   ============================================================ */
let fly = null;
function flyTo(target, pos, dur = 1.3) { fly = { t0: performance.now(), dur: dur * 1000, ft: controls.target.clone(), fp: camera.position.clone(), tt: target, tp: pos }; }
function viewOf(key) {
  if (key === 'all') return [HOME.t.clone(), HOME.p.clone()];
  const f = FACS[key], c = new THREE.Vector3(f.ox, f.oy, f.oz), back = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw)), dist = key === 'HSR' ? 1.6 : 1.2;
  return [c, c.clone().addScaledVector(back, dist).add(new THREE.Vector3(-dist * .35, dist * .62, 0))];
}
$('#views').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; LIVE.follow = false; const [t, p] = viewOf(b.dataset.v); flyTo(t, p); });
const ray = new THREE.Raycaster(); let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; fly = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hit = ray.intersectObjects(pickables.filter((p) => p.parent.parent.visible), false)[0];
  if (hit) select(hit.object.userData.id);
});

/* ============================================================
   小型 SVG 圖表
   ============================================================ */
const nfmt = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1).replace('.0', '') + 'k' : (Math.round(v * 10) / 10) + '';
function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v || 1)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function nTicks(m) { const p = 10 ** Math.floor(Math.log10(m || 1)), f = Math.round(m / p); return f === 2 ? 4 : f === 4 ? 4 : 5; }
function frame(svg, W, H, m, yMax, yTicks = 4, xLabels = [], xPos = null) {
  yTicks = nTicks(yMax); let s = '';
  for (let i = 0; i <= yTicks; i++) { const v = yMax * i / yTicks, y = H - m.b - (H - m.t - m.b) * i / yTicks; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--rule)" stroke-width="1"/><text x="${m.l - 4}" y="${y + 3}" text-anchor="end">${nfmt(v)}</text>`; }
  xLabels.forEach((t, i) => { if (t === '' || t == null) return; const x = xPos ? xPos(i) : m.l + (W - m.l - m.r) * i / Math.max(1, xLabels.length - 1); s += `<text x="${x}" y="${H - m.b + 12}" text-anchor="middle">${t}</text>`; });
  return s;
}
function lineChart(svg, { series, xLabels = [], yMax, band, marks = [] }) {
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number), m = { l: 34, r: 8, t: 8, b: 18 };
  const n = Math.max(...series.map((s) => s.y.length)); yMax = yMax || niceMax(Math.max(...series.flatMap((s) => s.y.filter((v) => !isNaN(v))), ...(band ? band.hi : [])));
  const X = (i) => m.l + (W - m.l - m.r) * i / Math.max(1, n - 1), Y = (v) => H - m.b - (H - m.t - m.b) * v / yMax;
  let s = frame(svg, W, H, m, yMax, 4, xLabels, X);
  for (const mk of marks) s += `<rect x="${X(mk.i) - 2}" y="${m.t}" width="${Math.max(2, X(mk.i + 1) - X(mk.i))}" height="${H - m.t - m.b}" fill="${mk.color}" opacity=".5"/>`;
  if (band) { let d = ''; band.hi.forEach((v, i) => d += (i ? 'L' : 'M') + X(i) + ' ' + Y(v)); for (let i = band.lo.length - 1; i >= 0; i--) d += 'L' + X(i) + ' ' + Y(band.lo[i]); s += `<path d="${d}Z" fill="${band.color}" opacity="${band.op || .5}"/>`; }
  for (const se of series) { let d = '', pen = false; se.y.forEach((v, i) => { if (isNaN(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.w || 1.6}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`; if (se.dots) se.y.forEach((v, i) => { if (!isNaN(v)) s += `<circle cx="${X(i)}" cy="${Y(v)}" r="2" fill="${se.color}"/>`; }); }
  svg.innerHTML = s;
}
function barChart(svg, { groups, xLabels, colors, yMax, line, lineColor }) {
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number), m = { l: 30, r: 6, t: 8, b: 18 };
  const n = groups[0].length, k = groups.length; yMax = yMax || niceMax(Math.max(...groups.flat(), ...(line || [])));
  const bw = (W - m.l - m.r) / n, Y = (v) => H - m.b - (H - m.t - m.b) * v / yMax;
  let s = frame(svg, W, H, m, yMax, 4, xLabels, (i) => m.l + bw * (i + .5));
  for (let i = 0; i < n; i++) groups.forEach((g, j) => { const w = (bw - 2) / k, x = m.l + bw * i + 1 + w * j; s += `<rect x="${x.toFixed(1)}" y="${Y(g[i]).toFixed(1)}" width="${Math.max(1, w - .6).toFixed(1)}" height="${(H - m.b - Y(g[i])).toFixed(1)}" rx="1" fill="${colors[j]}"/>`; });
  if (line) { let d = ''; line.forEach((v, i) => d += (i ? 'L' : 'M') + (m.l + bw * (i + .5)).toFixed(1) + ' ' + Y(v).toFixed(1)); s += `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="1.5"/>`; }
  svg.innerHTML = s;
}
function heatmap(svg, { rows, rowLabels, colLabels, color = 'var(--accent)' }) {
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number), m = { l: 26, r: 4, t: 4, b: 16 };
  const mx = Math.max(...rows.flat()), cw = (W - m.l - m.r) / rows[0].length, ch = (H - m.t - m.b) / rows.length;
  let s = '';
  rows.forEach((r, i) => { s += `<text x="${m.l - 4}" y="${m.t + ch * (i + .5) + 3}" text-anchor="end" class="lbl">${rowLabels[i]}</text>`; r.forEach((v, j) => { s += `<rect x="${(m.l + cw * j + .5).toFixed(1)}" y="${(m.t + ch * i + .5).toFixed(1)}" width="${(cw - 1).toFixed(1)}" height="${(ch - 1).toFixed(1)}" rx="1.5" fill="${color}" opacity="${(.04 + .96 * (v / mx) ** .8).toFixed(3)}"><title>${rowLabels[i]} ${colLabels[j] || j}：${Math.round(v)}</title></rect>`; }); });
  colLabels.forEach((t, j) => { if (t) s += `<text x="${m.l + cw * (j + .5)}" y="${H - 4}" text-anchor="middle">${t}</text>`; });
  svg.innerHTML = s;
}
function hbars(svg, { items, colors, labelW = 92 }) {   // items: [{label, v:[a,b]}]
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number), rh = (H - 6) / items.length, mx = Math.max(...items.map((it) => it.v.reduce((a, b) => a + b, 0)));
  let s = '';
  items.forEach((it, i) => {
    const y = 3 + rh * i; s += `<text x="${labelW - 6}" y="${y + rh * .5 + 3.5}" text-anchor="end" class="lbl" style="fill:var(--strong)">${it.label}</text>`;
    let x = labelW; it.v.forEach((v, j) => { const w = (W - labelW - 44) * v / mx; s += `<rect x="${x.toFixed(1)}" y="${(y + rh * .18).toFixed(1)}" width="${Math.max(.5, w).toFixed(1)}" height="${(rh * .64).toFixed(1)}" rx="1.5" fill="${colors[j]}"/>`; x += w; });
    s += `<text x="${x + 4}" y="${y + rh * .5 + 3.5}">${nfmt(it.v.reduce((a, b) => a + b, 0))}</text>`;
  });
  svg.innerHTML = s;
}
const C = (n) => cssv(n);

/* ============================================================
   01 即時營運
   ============================================================ */
function kpiHtml(items) { return items.map(([k, v, cls]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div></div>`).join(''); }
function liveAlerts() {
  const s = SIM(), out = [];
  for (const z of ['HSR', 'TC', 'PULI', 'SML', 'JNU', 'YC', 'XS']) {
    const n = s.queueAt(z), w = s.oldestWait(z);
    if (n > CAP) { const nx = nextDepartures(z, z === 'TC' ? 0 : z === 'SML' || z === 'XS' ? 1 : (s.q[z].TC?.length || 0) + (s.q[z].HSR?.length || 0) > n / 2 ? 1 : 0, 1)[0]; out.push({ lv: 'hi', z, txt: `${ZNAME[z]}候車 ${n} 人，超過一班容量`, sub: nx ? `下一班 ${fmt(nx.eta)}；建議加開或調度備用車` : '建議加開' }); }
    else if (w > 40) out.push({ lv: 'w', z, txt: `${ZNAME[z]}有旅客已等 ${Math.round(w)} 分`, sub: '檢查班距' });
  }
  for (const b of s.buses) if (b.state === 'run') {
    const late = tripLateness(b.trip); if (late >= 10) out.push({ lv: 'hi', bus: b.id, txt: `${b.id}（${b.trip.code}）延誤 ${Math.round(late)} 分`, sub: '後續班次可能晚發' });
    else if (b.load >= CAP * .9) out.push({ lv: 'w', bus: b.id, txt: `${b.id} 載客 ${b.load}/${CAP}`, sub: (b.trip.dir ? '往台中' : '往日月潭') + '，接近滿載' });
  }
  const recent = s.S.deniedEv.filter((e) => e.t > s.t - 30); if (recent.length) { const n = recent.reduce((a, e) => a + e.n, 0); out.push({ lv: 'hi', txt: `近 30 分有 ${n} 人次因滿載未能上車`, sub: recent.map((e) => ZNAME[e.z]).filter((v, i, a) => a.indexOf(v) === i).join('、') }); }
  return out;
}
function renderOps() {
  const s = SIM(), S = s.S, run = s.buses.filter((b) => b.state === 'run'), info = s.info;
  const totQ = ZONES.reduce((a, z) => a + s.queueAt(z), 0), avgW = S.boarded ? S.waitSum / S.boarded : 0;
  const lf = run.length ? run.reduce((a, b) => a + b.load, 0) / (run.length * CAP) : 0;
  $('#kpis').innerHTML = kpiHtml([
    ['在線車輛', `${run.length}<small>/ ${s.buses.length}</small>`], ['候車總人數', `${totQ}<small>人</small>`, totQ > 120 ? 'bad' : ''], ['平均等候', `${avgW.toFixed(1)}<small>分</small>`, avgW > 20 ? 'bad' : ''],
    ['已載運', `${S.boarded}<small>人</small>`], ['在線載客率', `${Math.round(lf * 100)}<small>%</small>`], ['滿載未上車', `${S.denied}<small>人次</small>`, S.denied ? 'bad' : 'good'], ['久候流失', `${S.lost}<small>人</small>`, S.lost ? 'bad' : 'good'],
    ['發車準點', `${S.deps ? Math.round(S.depOnTime / S.deps * 100) : 100}<small>%</small>`], [SER_MAP.has(LIVE.date) ? '當日刷卡量' : '預估刷卡量', `${Math.round(s.daily[0] + s.daily[1])}<small>筆</small>`]]);
  $('#opsSrc').textContent = `${info.date}（週${DOW_ZH[info.dow]}，${info.label}）· ${LIVE.plan === 'opt' ? '建議班表' : '現行班表'}`;
  const al = liveAlerts();
  $('#alerts').innerHTML = al.length ? al.slice(0, 6).map((a) => `<div class="al ${a.lv === 'hi' ? 'hi' : ''}"${a.bus ? ` data-bus="${a.bus}" style="cursor:pointer"` : ''}><i></i><span>${a.txt}<br><small>${a.sub}</small></span><small>${fmt(s.t)}</small></div>`).join('') : `<div class="al ok"><i></i><span>目前沒有異常</span><small>${fmt(s.t)}</small></div>`;
  drawTimeline();
}
$('#alerts').addEventListener('click', (e) => { const a = e.target.closest('[data-bus]'); if (a) select(a.dataset.bus); });
function renderList(force) {
  const s = SIM(); if (!s) return;
  const order = [...s.buses].sort((a, b) => (a.state === 'run' ? 0 : 1) - (b.state === 'run' ? 0 : 1) || a.id.localeCompare(b.id));
  const sig = order.map((b) => b.id + b.state + b.load + (b.trip ? Math.round(tripLateness(b.trip)) : '')).join('|') + LIVE.sel;
  if (!force && sig === renderList.sig) return; renderList.sig = sig;
  $('#vlist').innerHTML = order.map((b) => {
    const tr = b.trip, late = tr ? Math.round(tripLateness(tr)) : 0, [stz, cls] = STATE_ZH[b.state] || ['—', ''];
    let d;
    if (tr) { const L = busLoc(b); d = `${tr.code} ${tr.dir ? '往台中' : '往' + ZNAME[tr.zones.at(-1)]} · ${ZNAME[L.prev]}→${L.next ? ZNAME[L.next] : '終點'}`; }
    else { const nx = b.plan[b.k]; d = `${ZNAME[b.state === 'dh' ? b.dh.to : b.term]}${nx ? ' · 下一班 ' + fmt(nx.dep) : ' · 今日收班'}`; }
    return `<button class="vr" data-id="${b.id}" aria-current="${LIVE.sel === b.id}"><span class="id">${b.id}</span><span><span class="d" style="color:var(--strong);font-size:18.75px">${d}</span>${tr ? `<div class="load"><i class="${b.load > CAP * .9 ? 'hot' : ''}" style="width:${b.load / CAP * 100}%"></i></div>` : ''}</span><span class="r">${tr ? `<span style="font:500 18px var(--mono);color:var(--strong)">${b.load}/${CAP}</span><br>` : ''}<span class="chip ${late >= 5 ? 'late' : cls}">${late >= 5 ? '延 ' + late + ' 分' : stz}</span></span></button>`;
  }).join('');
}
$('#vlist').addEventListener('click', (e) => { const r = e.target.closest('.vr'); if (!r) return; select(LIVE.sel === r.dataset.id ? null : r.dataset.id); });
const tlc = $('#tl'), tlx = tlc.getContext('2d');
function drawTimeline() {
  const r = tlc.getBoundingClientRect(); if (!r.width) return; const dpr = Math.min(devicePixelRatio, 2);
  if (tlc.width !== Math.round(r.width * dpr)) { tlc.width = Math.round(r.width * dpr); tlc.height = Math.round(r.height * dpr); }
  const w = tlc.width, h = tlc.height, s = SIM(), X = (m) => 10 * dpr + (m - 300) / (1380 - 300) * (w - 20 * dpr);
  tlx.clearRect(0, 0, w, h); tlx.font = `${14.25 * dpr}px JetBrains Mono, monospace`; tlx.fillStyle = C('--muted'); tlx.strokeStyle = C('--muted');
  for (let hr = 6; hr <= 22; hr += 2) { const x = X(hr * 60); tlx.globalAlpha = .35; tlx.fillRect(x, 4 * dpr, dpr, h - 20 * dpr); tlx.globalAlpha = 1; tlx.fillText(pad2(hr), x - 6 * dpr, h - 4 * dpr); }
  const rows = [16, 34].map((v) => v * dpr);
  for (const tr of s.trips) {
    const late = tr.st ? tr.st.depDelay : 0, y = rows[tr.dir];
    tlx.fillStyle = tr.done ? C('--muted') : tr.dir ? C('--accent2') : C('--accent');
    if (late >= 5) tlx.fillStyle = C('--lit');
    const len = tr.zones.at(-1) === 'PULI' || tr.zones[0] === 'PULI' ? 4 : 7;
    tlx.fillRect(X(tr.dep) - dpr, y - len * dpr / 2 - 2 * dpr, 2 * dpr, (len + 4) * dpr);
  }
  tlx.fillStyle = C('--muted'); tlx.font = `${13.5 * dpr}px Noto Sans TC, sans-serif`; tlx.fillText('往潭', w - 42 * dpr, rows[0] + 3 * dpr); tlx.fillText('往中', w - 42 * dpr, rows[1] + 3 * dpr);
  const x = X(nowT()); tlx.fillStyle = C('--strong'); tlx.fillRect(x - dpr * .75, 2 * dpr, 1.5 * dpr, h - 17 * dpr);
}
tlc.addEventListener('click', (e) => { const r = tlc.getBoundingClientRect(); jumpTo(300 + (e.clientX - r.left - 10) / (r.width - 20) * (1380 - 300)); });

/* ============================================================
   02 需求預測
   ============================================================ */
function renderFC() {
  const B = FC.back;
  $('#fcKpi').innerHTML = kpiHtml([['迴歸 WAPE', (B.wapeM * 100).toFixed(1) + '<small>%</small>', B.wapeM < B.wapeB ? 'good' : ''], ['基準 WAPE', (B.wapeB * 100).toFixed(1) + '<small>%</small>'], ['迴歸 MAE', Math.round(B.maeM) + '<small>筆/日</small>']]);
  lineChart($('#fcBack'), { series: [{ y: B.pts.map((p) => p.y), color: C('--muted'), w: 1.3 }, { y: B.pts.map((p) => p.pb), color: C('--accent2'), w: 1.1, dash: '3 2' }, { y: B.pts.map((p) => p.pm), color: C('--accent'), w: 1.8 }], xLabels: B.pts.map((p, i) => i % 10 === 0 ? p.date.slice(5) : ''), marks: B.pts.map((p, i) => dayInfo(p.date).holi ? { i, color: C('--chip') } : null).filter(Boolean) });
  const d0 = isoD(LIVE.date), days = []; for (let i = 0; i < 14; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); days.push(iso(d)); }
  const f = [0, 1].map((dir) => days.map((d) => forecast(d, dir)));
  $('#fcDayLbl').textContent = LIVE.date;
  lineChart($('#fcAhead'), { series: [{ y: f[0].map((x) => x.mean), color: C('--accent'), w: 1.8, dots: true }, { y: f[1].map((x) => x.mean), color: C('--accent2'), w: 1.8, dots: true }], band: { lo: f[0].map((x, i) => Math.min(x.lo, f[1][i].lo)), hi: f[0].map((x, i) => Math.max(x.hi, f[1][i].hi)), color: C('--chip'), op: 1 }, xLabels: days.map((d, k) => { const i = dayInfo(d); return k % 2 ? '' : d.slice(5).replace('-', '/') + DOW_ZH[i.dow]; }), marks: days.map((d, i) => dayInfo(d).off ? { i, color: C('--chip') } : null).filter(Boolean) });
  const info = dayInfo(LIVE.date), h0 = hourlyDemand(LIVE.date, 0), h1 = hourlyDemand(LIVE.date, 1);
  barChart($('#fcHour'), { groups: [h0.slice(5, 23), h1.slice(5, 23)], xLabels: h0.slice(5, 23).map((_, i) => (i + 5) % 3 === 0 ? i + 5 : ''), colors: [C('--accent'), C('--accent2')] });
  const w = FC.models[0].w, eff = [['週六', 7], ['週五', 6], ['週一', 2], ['國定假日', 19], ['連假首日', 20], ['連假末日', 21], ['假期前一天', 22], ['春節', 23], ['7月', 13], ['10月', 16], ['趨勢/年', 1]];
  const svg = $('#fcCoef'), [, , W2, H2] = svg.getAttribute('viewBox').split(' ').map(Number), rh = (H2 - 4) / eff.length, mid = 230, sc = 110;
  let s = `<line x1="${mid}" x2="${mid}" y1="0" y2="${H2}" stroke="var(--rule)"/>`;
  eff.forEach(([nm, i], k) => { const e = (Math.exp(w[i]) - 1), e1 = (Math.exp(FC.models[1].w[i]) - 1), y = 2 + rh * k;
    s += `<text x="${mid - 120}" y="${y + rh * .62}" text-anchor="end" class="lbl" style="fill:var(--strong)">${nm}</text>`;
    for (const [v, col, o] of [[e, '--accent', 0], [e1, '--accent2', rh * .38]]) { const x = mid + clamp(v, -1, 1) * sc; s += `<rect x="${Math.min(mid, x).toFixed(1)}" y="${(y + o + rh * .08).toFixed(1)}" width="${Math.abs(x - mid).toFixed(1)}" height="${(rh * .34).toFixed(1)}" rx="1" fill="var(${col})"/>`; }
    s += `<text x="${W2 - 2}" y="${y + rh * .62}" text-anchor="end">${e >= 0 ? '+' : ''}${(e * 100).toFixed(0)}% / ${e1 >= 0 ? '+' : ''}${(e1 * 100).toFixed(0)}%</text>`; });
  svg.innerHTML = s;
  const an = [...FC.anomalies.values()].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8);
  $('#fcAnom').innerHTML = an.map((a) => { const i = dayInfo(a.date), fx = [0, 1].map((d) => Math.round(Math.exp(predLog(FC.models[d].w, feats(a.date))) - 1));
    return `<div class="al"><i></i><span>${a.date}（週${DOW_ZH[i.dow]}${i.holi ? '・假日' : ''}）<br><small>實際 ${a.y[0] || '—'}／${a.y[1] || '—'} · 模型 ${fx[0]}／${fx[1]}（往潭／往中）</small></span><small>${a.y[0] + a.y[1] < fx[0] + fx[1] ? '偏低' : '偏高'}</small></div>`; }).join('') || '<div class="al ok"><i></i><span>無</span></div>';
  $('#fcNote').textContent = `訓練資料：${SERIES[0].date} 至 ${SERIES.at(-1).date}，共 ${SERIES.length} 天（缺 ${731 - SERIES.length} 天，未補零）。選定 ${LIVE.date}：${SER_MAP.has(LIVE.date) ? "歷史日期，圖中迴歸值是全資料擬合，非當時可取得的預測；模擬採當日刷卡總量" : "資料範圍外推估；趨勢外推與假日效果未經驗證"}。參考帶來自訓練殘差，未校準預測涵蓋率。2026 假日為推算。需求指的是可觀測的刷卡上車數，不含現金與滿載未上車者。`;
}

/* ============================================================
   03 尖離峰
   ============================================================ */
const PK = { y: 1, d: 0 }, VZ = { y: 1 };
function renderPK() {
  const Y = DATA.agg.years[PK.y], dh = Y.dow_hour, order = [6, 0, 1, 2, 3, 4, 5].map(String);   // Python weekday: 0=一
  const lab = ['日', '一', '二', '三', '四', '五', '六'];
  const rows = [0, 1, 2, 3, 4, 5, 6].map((pyd) => dh[String(pyd)][PK.d].slice(5, 23));
  heatmap($('#pkHeat'), { rows, rowLabels: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'], colLabels: rows[0].map((_, i) => (i + 5) % 2 === 0 ? i + 5 : ''), color: PK.d ? C('--accent2') : C('--accent') });
  const wd = Array(24).fill(0), we = Array(24).fill(0), nWe = Y.n_weekend_days, nWd = Y.n_days - nWe;
  for (let pd = 0; pd < 7; pd++) dh[String(pd)][PK.d].forEach((v, h) => { if (pd >= 5) we[h] += v; else wd[h] += v; });
  lineChart($('#pkLine'), { series: [{ y: wd.slice(5, 23).map((v) => v / nWd), color: C('--muted'), w: 1.6, dots: true }, { y: we.slice(5, 23).map((v) => v / nWe), color: PK.d ? C('--accent2') : C('--accent'), w: 1.8, dots: true }], xLabels: wd.slice(5, 23).map((_, i) => (i + 5) % 3 === 0 ? i + 5 : '') });
  const th = Y.trip_hour.filter((r) => r.dir === PK.d && r.weekend === 1), byH = (h) => th.find((r) => r.hour === h);
  const hrs = []; for (let h = 6; h <= 21; h++) hrs.push(h);
  const pm = hrs.map((h) => byH(h)?.peak_mean || 0), p90 = hrs.map((h) => byH(h)?.peak_p90 || 0);
  barChart($('#pkTrip'), { groups: [pm], xLabels: hrs.map((h) => h % 3 === 0 ? h : ''), colors: [PK.d ? C('--accent2') : C('--accent')], yMax: 50, line: p90, lineColor: C('--lit') });
  const svg = $('#pkTrip'); svg.insertAdjacentHTML('beforeend', `<line x1="30" x2="394" y1="${8 + (160 - 26) * (1 - 43 / 50)}" y2="${8 + (160 - 26) * (1 - 43 / 50)}" stroke="var(--muted)" stroke-dasharray="3 3"/>`);
  const thAll = Y.trip_hour.filter((r) => r.dir === PK.d), hst = Y.trip_peak_hist, lowShare = (hst[0] + hst[1]) / hst.reduce((a, b) => a + b, 0), lowHrs = thAll.filter((r) => r.peak_mean < 12).map((r) => `${r.weekend ? '假日' : '平日'}${r.hour}時`);
  const pk = [...we.keys()].sort((a, b) => we[b] - we[a]).slice(0, 3).sort((a, b) => a - b), pkWd = [...wd.keys()].sort((a, b) => wd[b] - wd[a]).slice(0, 3).sort((a, b) => a - b);
  const over = thAll.filter((r) => r.share_over_43 > .01).map((r) => `${r.weekend ? '假日' : '平日'} ${r.hour} 時（${(r.share_over_43 * 100).toFixed(1)}%）`);
  $('#pkCall').innerHTML = `<b>${PK.d ? '往台中' : '往日月潭／埔里'}</b>：假日尖峰 ${pk.map((h) => h + ' 時').join('、')}；平日尖峰 ${pkWd.map((h) => h + ' 時').join('、')}。<br>全年推估車次中，最大在車人數少於 10 人的佔 <b>${Math.round(lowShare * 100)}%</b>（兩方向合計）；平均最大在車低於 12 人的時段：${lowHrs.slice(0, 8).join('、') || '無'}（離峰空載候選，可併班或改用小車）。${over.length ? '<br>超過 43 人的車次比例 > 1%：' + over.join('、') + '（可能有站立或加開需求）。' : ''}`;
  const mh = Y.month_hour; const mrows = Object.keys(mh).sort((a, b) => a - b).map((k) => mh[k].slice(5, 23));
  heatmap($('#pkMonth'), { rows: mrows, rowLabels: Object.keys(mh).sort((a, b) => a - b).map((k) => k + '月'), colLabels: mrows[0].map((_, i) => (i + 5) % 2 === 0 ? i + 5 : ''), color: C('--strong') });
}

/* ============================================================
   04 票證分析
   ============================================================ */
function renderVZ() {
  const Y = DATA.agg.years[VZ.y];
  const M = Object.fromEntries(ZONES.map((o) => [o, Object.fromEntries(ZONES.map((d) => [d, 0]))]));
  for (const r of Y.od) { const o = BILL2Z[r.o], d = BILL2Z[r.d]; if (o && d) M[o][d] += r.n; }
  const zs = ZONES, svg = $('#vzOD'), [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number), l = 70, t = 22, cw = (W - l - 4) / zs.length, ch = (H - t - 4) / zs.length, mx = Math.max(...zs.flatMap((o) => zs.map((d) => M[o][d])));
  let s = '';
  zs.forEach((d, j) => s += `<text x="${l + cw * (j + .5)}" y="14" text-anchor="middle" class="lbl">${ZNAME[d].replace('高鐵台中站', '高鐵').replace('暨南大學', '暨大').replace('九族文化村', '九族')}</text>`);
  zs.forEach((o, i) => { s += `<text x="${l - 6}" y="${t + ch * (i + .5) + 3}" text-anchor="end" class="lbl" style="fill:var(--strong)">${ZNAME[o]}</text>`;
    zs.forEach((d, j) => { const v = M[o][d], a = v ? .06 + .94 * Math.sqrt(v / mx) : 0, col = ZRANK[d] > ZRANK[o] ? '--accent' : '--accent2';
      s += `<rect x="${l + cw * j + .5}" y="${t + ch * i + .5}" width="${cw - 1}" height="${ch - 1}" rx="2" fill="${v ? `var(${col})` : 'var(--chip)'}" opacity="${v ? a.toFixed(3) : 1}"><title>${ZNAME[o]}→${ZNAME[d]}：${v}</title></rect>`;
      if (v > mx * .06) s += `<text x="${l + cw * (j + .5)}" y="${t + ch * (i + .5) + 3}" text-anchor="middle" style="fill:${a > .5 ? '#fff' : 'var(--strong)'}">${nfmt(v)}</text>`; }); });
  svg.innerHTML = s;
  const st = [...Y.stations].sort((a, b) => (ZRANK[BILL2Z[a.name]] ?? 9) - (ZRANK[BILL2Z[b.name]] ?? 9));
  hbars($('#vzSt'), { items: st.map((x) => ({ label: x.name, v: [x.board, x.alight] })), colors: [C('--accent'), C('--muted')], labelW: 96 });
  const top = Y.od.slice(0, 12);
  $('#vzTbl').innerHTML = `<tr><th>起訖</th><th>筆數</th><th>中位時間</th><th>P85</th><th>實扣中位數</th></tr>` + top.map((r) => `<tr><td style="font-family:inherit">${r.o}→${r.d}</td><td>${nfmt(r.n)}</td><td>${r.tt_med ?? '—'}′</td><td>${r.tt_p85 ?? '—'}′</td><td>${r.fare ?? '—'}</td></tr>`).join('');
  const all = SERIES.map((r) => r.v[0] + r.v[1]); const ma = all.map((_, i) => { const a = all.slice(Math.max(0, i - 6), i + 1); return a.reduce((p, q) => p + q, 0) / a.length; });
  lineChart($('#vzDaily'), { series: [{ y: all, color: C('--rule'), w: .8 }, { y: ma, color: C('--strong'), w: 1.4 }], xLabels: SERIES.map((r, i) => r.date.endsWith('-01') && ['01', '04', '07', '10'].includes(r.date.slice(5, 7)) ? r.date.slice(2, 7) : '') });
  const tk = Y.ticket_prefix.slice(0, 10);
  hbars($('#vzTk'), { items: tk.map((x) => ({ label: x.code, v: [x.n] })), colors: [C('--strong')], labelW: 80 });
  const hst = Y.trip_peak_hist;
  barChart($('#vzHist'), { groups: [hst], xLabels: ['0–4', '5–9', '10–19', '20–29', '30–42', '43–59', '60+'], colors: [C('--accent')] });
  $('#vzNote').textContent = `${Y.source}：${Y.rows.toLocaleString()} 筆刷卡；推估車次 ${Y.n_trips.toLocaleString()}。${DATA.agg.method_notes.join(' ')} ${DATA.agg.privacy}。票種欄位只取前 4 字分組。`;
}

/* ============================================================
   05 班次情境建議
   ============================================================ */
let OPTRES = null;
function renderOPT(recalc) {
  LIVE.opt = proposeTrips(LIVE.date);
  const plan = LIVE.opt.plan, hrs = []; for (let h = 5; h <= 22; h++) hrs.push(h);
  const by = (dir, h) => plan.find((p) => p.dir === dir && p.h === h);
  const cur = hrs.map((h) => by(0, h).cur + by(1, h).cur), nw = hrs.map((h) => by(0, h).need + by(1, h).need), ln = hrs.map((h) => (by(0, h).peakLoad + by(1, h).peakLoad) / CAP);
  if (LIVE.plan === 'opt') buildLive(SIM().t);
  const P = LIVE.opt; if (!OPT.fleet) { $('#fleet').value = P.curFleet; $('#fleetOut').textContent = P.curFleet + ' 輛'; }
  const cut = plan.filter((p) => p.ideal > p.need).reduce((a, p) => a + p.ideal - p.need, 0), idealN = plan.reduce((a, p) => a + p.ideal, 0);
  $('#apply').disabled = !P.feasible;
  $('#opCall').innerHTML = `${P.feasible ? '車隊上限檢查通過（其他服務品質仍須檢視）' : '<b>未滿足車隊上限；不能套用。請增加車隊或降低服務底線。</b>'}<br>` + `現行班表需 <b>${P.curFleet}</b> 輛車；需求面理想為 <b>${idealN}</b> 班${cut ? `，受車隊上限 ${P.limit} 輛限制，先從每班預期載客最少的時段減 <b>${cut}</b> 班` : ''}。建議班表共 ${P.trips.length} 班、需 <b>${P.fleet}</b> 輛車。<br>註：官網主表不含九人座與加班車；票證重建顯示 2025 年同類日平均約 ${Math.round(avgTripsDay(dayInfo(LIVE.date)))} 車次／日，主表為 ${ttTripsFor(dayInfo(LIVE.date)).length} 班。`;
  barChart($('#opBars'), { groups: [cur, nw], xLabels: hrs.map((h) => h % 2 === 0 ? h : ''), colors: [C('--muted'), C('--accent')], line: ln, lineColor: C('--lit') });
  if (recalc || !OPTRES) {
    const curT = ttTripsFor(dayInfo(LIVE.date));
    OPTRES = { a: evalPlan(LIVE.date, curT, LIVE.cong), b: evalPlan(LIVE.date, LIVE.opt.trips, LIVE.cong) };
  }
  const { a, b } = OPTRES;
  if (b.avgWait > a.avgWait || b.lost > a.lost) $('#opCall').insertAdjacentHTML('beforeend', '<br><b>服務品質取捨：建議方案的平均候車或流失高於現行；不可只因車公里降低就判定較佳。</b>');
  const row = (nm, x, y, f, better) => { const d = y - x, cls = Math.abs(d) < 1e-9 ? '' : (better === 'lo' ? d < 0 : d > 0) ? 'dn' : 'up'; return `<tr><td style="font-family:inherit">${nm}</td><td>${f(x)}</td><td>${f(y)}</td><td class="${cls}">${d >= 0 ? '+' : ''}${f(d)}</td></tr>`; };
  $('#opTbl').innerHTML = `<tr><th>指標</th><th>現行</th><th>建議</th><th>差異</th></tr>` +
    row('生成旅客（人）', a.arrived, b.arrived, (v) => Math.round(v), 'hi') + row('期末仍候車（人）', a.left, b.left, (v) => Math.round(v), 'lo') + row('期末仍在車（人）', a.onboard, b.onboard, (v) => Math.round(v), 'lo') + row('班次數', a.trips, b.trips, (v) => Math.round(v), 'lo') + row('需要車輛（串接）', a.buses, b.buses, (v) => Math.round(v), 'lo') + row('車公里', a.vkm, b.vkm, (v) => Math.round(v).toLocaleString(), 'lo') +
    row('平均載客率', a.lf * 100, b.lf * 100, (v) => v.toFixed(1) + '%', 'hi') + row('平均等候（分）', a.avgWait, b.avgWait, (v) => v.toFixed(1), 'lo') + row('最長等候（分）', a.maxWait, b.maxWait, (v) => Math.round(v), 'lo') +
    row('滿載未上車（人次）', a.denied, b.denied, (v) => Math.round(v), 'lo') + row('久候 90 分流失（人）', a.lost, b.lost, (v) => Math.round(v), 'lo') + row('高載班次（>90%）', a.crowded, b.crowded, (v) => Math.round(v), 'lo') + row('CO₂e（kg）', a.co2, b.co2, (v) => Math.round(v).toLocaleString(), 'lo');
  for (const dir of [0, 1]) $('#opList' + dir).innerHTML = LIVE.opt.trips.filter((t) => t.dir === dir).map((t) => `<span title="${t.code}" style="display:inline-block;width:62px;color:${t.zones.at(-1) === 'PULI' || t.zones[0] === 'PULI' ? 'var(--route-h)' : 'var(--strong)'}">${fmt(t.dep)}<small style="color:var(--muted)">${t.code.slice(4) || '加'}</small></span>`).join('');
}

/* ============================================================
   06 小幫手（規則式；只用頁面上的資料）
   ============================================================ */
const BOT = { mode: 'ops' };
const ZKEY = [[/高鐵/, 'HSR'], [/干城|台中車站|臺中車站|火車站|台中市|臺中市|台中(?!.*高鐵)/, 'TC'], [/埔里/, 'PULI'], [/暨大|暨南/, 'JNU'], [/魚池/, 'YC'], [/九族/, 'J9'], [/日月潭|水社|潭/, 'SML'], [/向山/, 'XS']];
function zonesIn(q) { const hits = []; for (const [re, z] of ZKEY) { const m = q.match(re); if (m && !hits.find((h) => h.z === z)) hits.push({ z, i: m.index }); } return hits.sort((a, b) => a.i - b.i).map((h) => h.z); }
function odStat(o, d) { let best = null; for (const r of Y25.od) if (BILL2Z[r.o] === o && BILL2Z[r.d] === d && (!best || r.n > best.n)) best = r; return best; }
function answer(q) {
  if (/旅遊|景點|住宿|飯店|餐廳|訂位|票價|車資|多少錢|行程推薦|忽略|指令|prompt|ignore|system/i.test(q) || !/B\s?\d|號車|延誤|誤點|塞車|晚到|遲到|延遲|排隊|候車|幾人|多少人|人多|在等|擠|載客|滿載|預測|尖峰|離峰|加開|調度|調整|異常|告警|狀況|現況|票證|刷卡|需求/i.test(q)) return '本小幫手只支援內部營運：需求預測、尖離峰、模擬車況、票證分析與班次配置。旅遊、票價及其他問題暫不提供。';
  if (/票證|刷卡/.test(q)) return '請開啟「票證分析」檢視方向、OD 與票種彙總。刷卡筆數不是獨立旅客數；推估車次與最大在車量不是實測載客率。依據：2024–2025 年去識別票證聚合。';
  const s = SIM(), t = s.t, zs = zonesIn(q), busM = q.match(/B\s?(\d{1,2})|(\d{1,2})\s*號車/i), ops = BOT.mode === 'ops';
  const src = (x) => `\n<span class="why">依據：${x}</span>`;
  if (busM) {
    const id = 'B' + pad2(+(busM[1] || busM[2])), b = s.buses.find((x) => x.id === id); if (!b) return `今天沒有 ${id} 這台車（共 ${s.buses.length} 台）。`;
    select(id); const tr = b.trip;
    if (tr) { const L = busLoc(b), late = Math.round(tripLateness(tr)), nz = L.next; return `${id} 正在跑 ${tr.code} ${tr.dir ? '往台中' : '往' + ZNAME[tr.zones.at(-1)]}，位於${ZNAME[L.prev]}到${nz ? ZNAME[nz] : '終點'}之間。\n車上 ${b.load}/${CAP} 人${late >= 5 ? `，目前延誤約 ${late} 分` : '，大致準點'}。${nz ? `\n預計 ${fmt(etaAt(tr, nz))} 到${ZNAME[nz]}。` : ''}\n右上角平面圖已標出位置。` + src(`模擬時間 ${fmt(t)}；表定 ${fmt(tr.dep)} 發車`); }
    const nx = b.plan[b.k]; return `${id} 目前${STATE_ZH[b.state][0]}，在${ZNAME[b.state === 'dh' ? b.dh.to : b.term]}。${nx ? `\n下一班 ${fmt(nx.dep)} ${nx.code} ${nx.dir ? '往台中' : '往日月潭'}。` : '\n今天已收班。'}` + src('車輛串接排班（模擬）');
  }
  if (/延誤|誤點|塞車|晚到|遲到|延遲/.test(q)) {
    const late = s.buses.filter((b) => b.state === 'run' && tripLateness(b.trip) >= 5).map((b) => ({ b, m: Math.round(tripLateness(b.trip)) })).sort((a, b) => b.m - a.m);
    if (!late.length) return `目前在線 ${s.buses.filter((b) => b.state === 'run').length} 台車都在表定 5 分鐘內。` + src(`模擬時間 ${fmt(t)}；${LIVE.cong ? '已開啟國道壅塞情境' : '未開啟壅塞情境'}`);
    let a = `目前有 ${late.length} 台車延誤 5 分以上：\n` + late.slice(0, 5).map(({ b, m }) => `· ${b.id} ${b.trip.code} ${b.trip.dir ? '往台中' : '往潭'}，延誤 ${m} 分，在${ZNAME[busLoc(b).prev]}附近`).join('\n');
    if (ops) { const nxt = late.map(({ b }) => b.plan[b.k + 1]).filter(Boolean); a += `\n\n建議：${nxt.length ? `這些車接續的 ${nxt.map((x) => fmt(x.dep)).join('、')} 班次可能晚發，可改派端點待命車；` : ''}在高鐵站與日月潭公告預估時間；延誤超過 15 分考慮調度備用車。`; }
    else a += '\n\n若您在等車，可看「下一班」查詢最新預估時間。';
    return a + src('模擬：班表時間 × 行車速度變化 × 上下車停留');
  }
  if (/多久|多長|要多少時間|車程|幾分鐘到/.test(q) || (/票價|多少錢|車資|價錢/.test(q))) {
    let [o, d] = zs.length >= 2 ? zs : zs.length === 1 ? (zs[0] === 'HSR' ? ['HSR', 'SML'] : ['HSR', zs[0]]) : ['HSR', 'SML'];
    const r = odStat(o, d); if (!r) return `找不到 ${ZNAME[o]}→${ZNAME[d]} 的刷卡紀錄。`;
    return `${ZNAME[o]} → ${ZNAME[d]}：\n· 中位車程 ${r.tt_med ?? '—'} 分，85% 的旅客在 ${r.tt_p85 ?? '—'} 分內到\n· 刷卡實扣中位數 ${r.fare ?? '—'} 元（依票種與優惠不同）` + src(`2025 年 ${r.n.toLocaleString()} 筆刷卡（${r.o}→${r.d}）`);
  }
  if (/幾人|多少人|排隊|候車|人多|在等/.test(q)) {
    const list = zs.length ? zs : ['HSR', 'TC', 'PULI', 'SML'];
    return list.map((z) => { const n = s.queueAt(z), w = Math.round(s.oldestWait(z)); return `${ZNAME[z]}：${n} 人候車${n ? `，最久已等 ${w} 分` : ''}${n > CAP ? '（超過一班容量）' : ''}`; }).join('\n') + (ops && list.some((z) => s.queueAt(z) > CAP) ? '\n\n建議：調派最近的待命車加開，或請下一班先到該站。' : '') + src(`模擬時間 ${fmt(t)}；到站人數依預測需求 × 小時分布 × 起訖比例`);
  }
  if (/擠|座位|位子|滿|空位|人潮/.test(q) && !/預測|明天/.test(q)) {
    if (ops || !zs.length) { const run = s.buses.filter((b) => b.state === 'run').sort((a, b) => b.load - a.load).slice(0, 4); return '目前最擠的車：\n' + run.map((b) => `· ${b.id} ${b.trip.code} ${b.trip.dir ? '往台中' : '往潭'}：${b.load}/${CAP}`).join('\n') + src(`模擬時間 ${fmt(t)}`); }
    const z = zs[0], dir = zs[1] ? (ZRANK[zs[1]] > ZRANK[z] ? 0 : 1) : (z === 'SML' || z === 'XS' ? 1 : 0), nx = nextDepartures(z, dir, 2);
    if (!nx.length) return `${ZNAME[z]}今天已沒有${dir ? '往台中' : '往日月潭'}的班次。`;
    const b = s.buses.find((x) => x.id === nx[0].tr.busId), onb = nx[0].tr.st ? s.buses.find((x) => x.trip === nx[0].tr)?.load || 0 : 0, q2 = s.queueAt(z);
    const est = Math.min(CAP, onb + q2), cls = est > CAP * .9 ? '可能客滿，建議搭下一班' : est > CAP * .6 ? '偏擠' : '有空位';
    return `${ZNAME[z]} ${fmt(nx[0].eta)} 那班（${nx[0].tr.code}）：車上約 ${onb} 人、站上候車 ${q2} 人，估計${cls}。${nx[1] ? `\n下一班 ${fmt(nx[1].eta)}。` : ''}` + src('模擬在車人數 + 站上候車');
  }
  if (/預測|明天|後天|週末|周末|假日|連假/.test(q)) {
    const d0 = isoD(LIVE.date); if (/明天/.test(q)) d0.setDate(d0.getDate() + 1); if (/後天/.test(q)) d0.setDate(d0.getDate() + 2);
    const ds = iso(d0), i = dayInfo(ds), a = forecast(ds, 0), b = forecast(ds, 1), hs = hourShare(i, 0).map((v, h) => [h, v]).sort((x, y) => y[1] - x[1]).slice(0, 2).map((x) => x[0]).sort((x, y) => x - y), hs1 = hourShare(i, 1).map((v, h) => [h, v]).sort((x, y) => y[1] - x[1]).slice(0, 2).map((x) => x[0]).sort((x, y) => x - y);
    return `${ds}（週${DOW_ZH[i.dow]}，${i.label}）預測：\n· 往日月潭／埔里 ${Math.round(a.mean)} 筆（殘差參考帶，未校準 ${Math.round(a.lo)}–${Math.round(a.hi)}）\n· 往台中 ${Math.round(b.mean)} 筆（${Math.round(b.lo)}–${Math.round(b.hi)}）\n· 尖峰：往潭 ${hs.map((h) => h + ' 時').join('、')}，往台中 ${hs1.map((h) => h + ' 時').join('、')}` + (ops ? '\n\n到「班次情境建議」可看這天建議的班次。' : '') + src(`迴歸模型（回測 WAPE ${(FC.back.wapeM * 100).toFixed(1)}%）`);
  }
  if (/尖峰|離峰|幾點人|什麼時候人/.test(q)) {
    const i = s.info, a = hourShare(i, 0), b = hourShare(i, 1), top = (v) => v.map((x, h) => [h, x]).sort((p, q2) => q2[1] - p[1]).slice(0, 3).map((x) => x[0]).sort((p, q2) => p - q2);
    return `${i.label}的尖峰：\n· 往日月潭／埔里：${top(a).map((h) => h + ' 時').join('、')}\n· 往台中：${top(b).map((h) => h + ' 時').join('、')}\n離峰約在 12–14 時與 19 時以後。` + src('2025 年刷卡 星期 × 小時 分布');
  }
  if (/加開|調度|建議|怎麼辦|處理|調整/.test(q) || (ops && /異常|告警|狀況/.test(q))) {
    const al = liveAlerts(); const h = Math.floor(t / 60), plan = (LIVE.opt ||= proposeTrips(LIVE.date)).plan.filter((p) => p.h >= h && p.h <= h + 3 && p.need > p.cur);
    let a = al.length ? '目前狀況：\n' + al.slice(0, 5).map((x) => `· ${x.txt}（${x.sub}）`).join('\n') : '目前沒有告警。';
    if (plan.length) a += '\n\n未來 3 小時建議加班：\n' + plan.map((p) => `· ${p.h} 時 ${p.dir ? '往台中' : '往潭'}：現行 ${p.cur} 班，建議 ${p.need} 班（預測尖峰區段約 ${Math.round(p.peakLoad)} 人）`).join('\n');
    const idle = s.buses.filter((b) => (b.state === 'idle' || b.state === 'lay') && b.plan[b.k] && b.plan[b.k].dep - t > 60);
    if (idle.length && (al.length || plan.length)) a += `\n\n可調度：${idle.slice(0, 4).map((b) => `${b.id}（在${ZNAME[b.term]}，${fmt(b.plan[b.k].dep)} 前空檔）`).join('、')}`;
    return a + src('模擬告警 + 班次情境建議需求');
  }
  if (/異常|告警|狀況|現況/.test(q)) { const al = liveAlerts(); return (al.length ? al.map((x) => `· ${x.txt}`).join('\n') : '目前一切正常。') + src(`模擬時間 ${fmt(t)}`); }
  if (/下一班|幾點|班次|末班|最後一班|首班|第一班|什麼時候有車|發車/.test(q) || zs.length) {
    const z = zs[0] || 'HSR', dir = zs[1] ? (ZRANK[zs[1]] > ZRANK[z] ? 0 : 1) : (z === 'SML' || z === 'XS' ? 1 : 0), dest = zs[1];
    if (/末班|最後一班/.test(q)) { const L = s.trips.filter((tr) => tr.dir === dir && tr.zones.includes(z) && (!dest || tr.zones.includes(dest))).sort((a, b) => schedT(b, b.path.zd[z]) - schedT(a, a.path.zd[z]))[0]; return L ? `${ZNAME[z]}${dest ? '往' + ZNAME[dest] : dir ? '往台中' : '往日月潭'}末班約 ${fmt(schedT(L, L.path.zd[z]))}（${L.code}）。` + src(`官網 6670 班表快照（自 ${DATA.tt.effective_from} 實施；非今日公告）`) : '找不到班次。'; }
    const nx = nextDepartures(z, dir, 6).filter((x) => !dest || x.tr.zones.includes(dest)).slice(0, 3);
    if (!nx.length) return `${ZNAME[z]}今天已沒有${dest ? '往' + ZNAME[dest] : dir ? '往台中' : '往日月潭'}的班次。`;
    return `${ZNAME[z]}${dest ? '往' + ZNAME[dest] : dir ? '往台中' : '往日月潭'}接下來：\n` + nx.map((x) => { const late = Math.round(x.eta - x.sched); return `· ${fmt(x.eta)} ${x.tr.code}${x.tr.zones.at(-1) === 'PULI' && dir === 0 ? '（只到埔里）' : ''}${late >= 3 ? `（表定 ${fmt(x.sched)}，晚 ${late} 分）` : ''}`; }).join('\n') + src(`班表快照 ＋ 模擬延誤；現在 ${fmt(t)}`);
  }
  return BOT.mode === 'pax' ? '我可以回答：下一班車、末班車、候車人數、車上擠不擠、車程與票價、誤點、某天的人潮預測。' : '我可以回答：目前異常、最擠的車、誤點處理、是否加開、某台車在哪（如「B05 在哪」）、人數預測、尖峰時段。';
}
const CHIPS = {
  pax: ['高鐵站下一班去日月潭幾點？', '現在高鐵站排隊幾人？', '高鐵到日月潭的那班擠嗎？', '日月潭回高鐵要多久、多少錢？', '今天日月潭回台中末班幾點？', '有沒有誤點？', '明天人會很多嗎？'],
  ops: ['現在有哪些異常？', '哪一班最擠？', '需要加開嗎？', '誤點車輛怎麼處理？', 'B03 現在在哪？', '明天預測人數', '今天尖峰是幾點？'],
};
function setMode(m) { m = 'ops'; BOT.mode = m; for (const b of $('#botMode').children) b.setAttribute('aria-pressed', b.dataset.m === m); $('#botLead').textContent = m === 'pax' ? '給旅客：查班次、候車人數、擠不擠、車程票價。回答依模擬現況與官網班表快照。' : 'OpenRouter · DeepSeek V4.1 Flash。查詢票證、需求與當下畫面的模擬車況；僅限內部營運。'; $('#botChips').innerHTML = CHIPS[m].map((c) => `<button>${c}</button>`).join(''); }
let assistantBusy = false;
function assistantSnapshot(q) {
  const s = SIM(), date = isoD(LIVE.date);
  if (/明天/.test(q)) date.setDate(date.getDate() + 1);
  if (/後天/.test(q)) date.setDate(date.getDate() + 2);
  const ds = iso(date);
  return { date: LIVE.date, minute: nowT(), plan: LIVE.plan, congestion: LIVE.cong,
    vehicles: s.buses.map(b => ({ id: b.id, state: b.state, load: b.load, capacity: CAP,
      delay_minutes: b.trip ? Math.max(0, Math.round(tripLateness(b.trip))) : 0,
      next_stop: b.trip ? busLoc(b).next : b.term })),
    queues: ['TC','HSR','PULI','SML'].map(station => ({station,waiting:s.queueAt(station),oldest_wait_minutes:Math.round(s.oldestWait(station))})),
    forecast: [0,1].map(dir => { const f = forecast(ds,dir);return {date:ds,direction:dir ? 'in':'out',mean:f.mean,low:f.lo,high:f.hi}; }),
  };
}
async function ask(q) {
  q = q.trim(); if (!q || assistantBusy) return;
  const box = $('#chat');
  const user = document.createElement('div'); user.className = 'msg me'; user.textContent = q; box.append(user);
  const bot = document.createElement('div'); bot.className = 'msg bot'; bot.textContent = '正在查詢營運資料…'; box.append(bot);
  if (q.length > 2000) {bot.textContent = '請將問題縮短至2000字內。';return;}
  assistantBusy = true;
  const buttons = [...$('#askForm').querySelectorAll('button'), ...$('#botChips').querySelectorAll('button')];
  buttons.forEach(b => b.disabled = true);
  try {
    const r = await fetch('/api/v1/assistant/answer', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:q,mode:'operations',year:2025,route:'全部',simulation:assistantSnapshot(q)}),signal:AbortSignal.timeout(100000)});
    if (!r.ok) throw new Error('API '+r.status);
    const data = await r.json(); if (typeof data.answer !== 'string') throw new Error('invalid answer');
    bot.textContent = data.answer;
    const why = document.createElement('span'); why.className = 'why';
    why.textContent = (data.engine === 'openrouter' ? 'OpenRouter · DeepSeek V4.1 Flash' : '規則／範圍回覆') + ' · ' + (data.sources || []).map(s=>s.title).join('；');
    bot.append(why);
  } catch (e) {
    let fallback; try {fallback = answer(q).replace(/<[^>]*>/g, '');} catch {fallback='請查看相關分析分頁或稍後重試。';}
    bot.textContent = 'AI連線暫時無法使用，以下為本機規則回覆（非LLM）：\n\n' + fallback;
  } finally {
    assistantBusy = false; buttons.forEach(b => b.disabled = false); $('#body').scrollTop = 1e9;
  }
  $('#body').scrollTop = 1e9;
}
$('#botMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });
$('#botChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
$('#askForm').addEventListener('submit', (e) => { e.preventDefault(); ask($('#askIn').value); $('#askIn').value = ''; });
setMode('ops');

/* ============================================================
   分頁與控制
   ============================================================ */
let TAB = 'ops';
function setTab(t) {
  TAB = t; for (const b of $('#tabs').children) b.setAttribute('aria-selected', b.dataset.t === t);
  for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== 'p-' + t;
  if (t === 'fc') renderFC(); if (t === 'pk') renderPK(); if (t === 'viz') renderVZ(); if (t === 'opt') renderOPT(false); if (t === 'ops') refreshUI(true);
  try { localStorage.setItem('tx-tab', t); } catch (e) {}
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.t); });
const segPick = (el, attr, fn) => el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; for (const x of el.children) x.setAttribute('aria-pressed', x === b); fn(b.dataset[attr]); });
segPick($('#speed'), 's', (v) => LIVE.speed = +v);
segPick($('#plan'), 'p', (v) => { if (v === 'opt' && !(LIVE.opt ||= proposeTrips(LIVE.date)).feasible) { for (const x of $('#plan').children) x.setAttribute('aria-pressed', x.dataset.p === LIVE.plan); setTab('opt'); return; } LIVE.plan = v; buildLive(SIM().t); });
segPick($('#pkYear'), 'y', (v) => { PK.y = +v; renderPK(); }); segPick($('#pkDir'), 'd', (v) => { PK.d = +v; renderPK(); });
segPick($('#vzYear'), 'y', (v) => { VZ.y = +v; renderVZ(); });
segPick($('#fuel'), 'f', (v) => { OPT.fuel = v; OPTRES = null; renderOPT(true); });
$('#play').onclick = () => { LIVE.paused = !LIVE.paused; $('#play').textContent = LIVE.paused ? '播放' : '暫停'; };
$('#day').onchange = () => { LIVE.plan = 'cur'; for (const x of $('#plan').children) x.setAttribute('aria-pressed', x.dataset.p === 'cur'); OPT.fleet = 0; LIVE.date = $('#day').value || '2025-11-01'; LIVE.opt = null; OPTRES = null; buildLive(SIM().t); if (TAB !== 'ops') setTab(TAB); };
const tgl = (el, fn) => el.onclick = () => { const on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', on); fn(on); };
tgl($('#cong'), (on) => { LIVE.cong = on; OPTRES = null; buildLive(SIM().t); });
tgl($('#theme'), (on) => { document.documentElement.dataset.theme = on ? 'dark' : 'light'; applyTheme(); });
for (const [id, out, f] of [['lf', 'lfOut', (v) => Math.round(v * 100) + '%'], ['floor', 'floorOut', (v) => v + ' 班/時'], ['buf', 'bufOut', (v) => '+' + Math.round(v * 100) + '%']]) {
  $('#' + id).oninput = (e) => { $('#' + out).textContent = f(+e.target.value); };
  $('#' + id).onchange = (e) => { OPT[id] = +e.target.value; OPTRES = null; renderOPT(true); };
}
$('#fleet').oninput = (e) => { $('#fleetOut').textContent = e.target.value + ' 輛'; };
$('#fleet').onchange = (e) => { OPT.fleet = +e.target.value; OPTRES = null; renderOPT(true); };
function avgTripsDay(info) { const rows = Y25.daily.filter((r) => { const i = dayInfo(r.date); return i.off === info.off; }); return rows.reduce((a, r) => a + r.trips_out + r.trips_in, 0) / Math.max(1, rows.length); }
$('#apply').onclick = () => { if (!(LIVE.opt ||= proposeTrips(LIVE.date)).feasible) return; LIVE.plan = 'opt'; for (const x of $('#plan').children) x.setAttribute('aria-pressed', x.dataset.p === 'opt'); buildLive(SIM().t); setTab('ops'); };
$('#rerun').onclick = () => { OPTRES = null; renderOPT(true); };
function applyTheme() {
  for (const t of THEMED) { if (t.fn) t.fn(); else t.mat[t.prop].set(cssv(t.token)); }
  colorTerrain(); hemi.color.set(cssv('--sky')); hemi.groundColor.set(cssv('--gnd'));
  const dark = document.documentElement.dataset.theme === 'dark'; hemi.intensity = dark ? .55 : 1.35; sun.intensity = dark ? 1.4 : 2.3; figMat.color.setScalar(dark ? .55 : 1);
  if (TAB !== 'ops' && TAB !== 'bot') setTab(TAB); refreshUI(true);
}
function refreshUI(force) {
  const s = SIM(); if (!s) return; const i = s.info;
  $('#clock').textContent = fmt(nowT());
  $('#meta').textContent = `${i.date} 週${DOW_ZH[i.dow]} · ${i.label} · ×${LIVE.speed}${LIVE.paused ? ' · 暫停' : ''}`;
  $('#dayType').textContent = `週${DOW_ZH[i.dow]}`;
  if (TAB === 'ops') { renderOps(); renderList(force); }
  updateMini();
}

/* ============================================================
   主迴圈
   ============================================================ */
let homeFit = false;
function resize() {
  const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  if (!homeFit && r.width) { homeFit = true; const k = camera.aspect < 1.25 ? 1.25 / camera.aspect : 1; HOME.p.sub(HOME.t).multiplyScalar(k).add(HOME.t); camera.position.copy(HOME.p); }
}
new ResizeObserver(resize).observe(host); resize();
buildLive(390);
try { const t = localStorage.getItem('tx-tab'); if (t && t !== 'ops') setTab(t); } catch (e) {}
applyTheme();
let lastT = performance.now(), uiT = 0;
function loop(now) {
  const dt = Math.min(.1, (now - lastT) / 1000); lastT = now; const s = SIM();
  if (!LIVE.paused && s.t < 24 * 60 + 30) { LIVE.acc += dt * LIVE.speed / 60; let n = 0; while (LIVE.acc >= 1 && n < 30) { s.step(); LIVE.acc -= 1; n++; } if (LIVE.acc > 1) LIVE.acc = 0; }
  updateVehicles(LIVE.acc);
  const bt = now / 1000;
  boats.forEach((b, i) => { const a = b.ph + bt * b.w * (LIVE.paused ? 0 : 1) * 3; const x = LAKE[0] + Math.cos(a) * b.r * 1.5, z = LAKE[1] + Math.sin(a) * b.r; b.g.position.set(x, WATER * EX + .002 + Math.sin(bt * 1.7 + i) * .0006, z); b.g.rotation.set(Math.sin(bt * 1.3 + i) * .03, -a - (b.w > 0 ? Math.PI / 2 : -Math.PI / 2), 0); });
  for (const z of ['HSR', 'SML']) figs[z].count = Math.min(MAXQ, s.queueAt(z));
  figs.GC.count = Math.min(MAXQ, s.queueAt('TC')); figs.PL.count = Math.min(MAXQ, s.queueAt('PULI'));
  if (fly) { const k = clamp((now - fly.t0) / fly.dur, 0, 1), e = 1 - Math.pow(1 - k, 3); controls.target.lerpVectors(fly.ft, fly.tt, e); camera.position.lerpVectors(fly.fp, fly.tp, e); if (k >= 1) fly = null; }
  else if (LIVE.follow && LIVE.sel && VIS[LIVE.sel]) { const p = VIS[LIVE.sel].root.position, d = _p.subVectors(p, controls.target).multiplyScalar(.12); controls.target.add(d); camera.position.add(d); }
  controls.update();
  { const gy = yAt(camera.position.x, camera.position.z) + .04; if (camera.position.y < gy) camera.position.y = gy; }
  const cd = camera.position.distanceTo(controls.target), ext = clamp(cd * .75, .5, 34);
  TREE_S.value = clamp(cd / 10, .3, 1);
  sun.position.copy(controls.target).addScaledVector(SUN_DIR, 60); sun.target.position.copy(controls.target);
  const sc = sun.shadow.camera; if (Math.abs(sc.right - ext) > ext * .05) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix(); }
  sun.shadow.normalBias = .02 * ext / 10 + .002;
  EDGE.opacity = clamp(.85 - cd / 60, .25, .7); EDGE_FAR.opacity = clamp(.7 - cd / 30, 0, .5);
  for (const k in ROUTE_LINES) ROUTE_LINES[k].material.opacity = clamp((cd - 1.5) / 6, .15, .95);
  renderer.render(scene, camera);
  const r = host.getBoundingClientRect(); placeLabels(r.width, r.height);
  uiT += dt; if (uiT > .3) { uiT = 0; refreshUI(false); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__tx = { LIVE, SIM, jumpTo, select, flyTo, viewOf, setTab, ask, FC, evalPlan, proposeTrips, camera, controls, FACS, OPT };
