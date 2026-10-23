
/* ============================================================
   資料重播狀態
   ============================================================ */
const LIVE = { date: RDAYS.includes('2025-10-11') ? '2025-10-11' : RDAYS.at(-1), speed: 360, paused: false, acc: 0, sim: null, sel: null, only: false, follow: false };
function buildLive(startMin = 360) {
  LIVE.sim = new Replay(LIVE.date); LIVE.sim.run(startMin); LIVE.acc = 0;
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
/* 子線篩選：3D 車輛、路線色線、站線圖、甘特圖、站點表、車隊清單只顯示勾選的子線 */
const LINE_CODES = ['6670D', '6670A', '6670B', '6670E', '6670F', '6670H'];
const LINE_PATH = { '6670D': 'D', '6670A': 'D', '6670B': 'B', '6670E': 'B', '6670F': 'B', '6670H': 'H' };
const LINE = new Set(LINE_CODES);
const lineOn = (tr) => LINE.size === LINE_CODES.length || LINE.has(tr.code);
const busOn = (b) => LINE.size === LINE_CODES.length || (b.trip ? lineOn(b.trip) : b.plan.some(lineOn));
const nowT = () => LIVE.sim.t; // KPIs, station curves and rendered poses share one replay minute
const dirTxt = (tr) => tr.dir ? '往台中' : tr.endZ === 'PULI' ? '往埔里' : '往' + ZNAME[tr.endZ];

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
function busPose(b) {
  if (b.state === 'run') {
    const tr = b.trip; pathPoint(tr.path, rpD(tr, nowT()), _st);
    const d = _st.dir, hl = Math.hypot(d.x, d.z) || 1, off = CLS[_st.cls].lane;
    return { x: _st.pos.x - d.z / hl * off, y: _st.pos.y, z: _st.pos.z + d.x / hl * off, yaw: Math.atan2(-d.z, d.x), pitch: Math.atan2(d.y, hl), moving: true };
  }
  if (b.slot) return { x: b.slot.pos.x, y: b.slot.pos.y, z: b.slot.pos.z, yaw: b.slot.yaw, pitch: 0 };
  const f = b.parkFac; if (!f) return null; const e = f.entryW, i = (parseInt(b.id.slice(1)) % 6) * .012;
  return { x: e.x - Math.sin(f.yaw) * i, y: e.y, z: e.z - Math.cos(f.yaw) * i, yaw: f.yaw + Math.PI / 2, pitch: 0 };
}
function updateVehicles(acc) {
  const s = SIM(); const camD = camera.position.distanceTo(controls.target);
  for (const b of s.buses) {
    const v = visOf(b), p = busPose(b);
    const hide = (LIVE.only && LIVE.sel && LIVE.sel !== b.id) || !p || !busOn(b);
    v.root.visible = !hide; if (!p) { v.mk.dataset.vis = '0'; v.last = null; continue; }
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
  for (const [z, L] of Object.entries(ZLABEL)) { const n = boardsRecentF(s, z, 30); const em = L.el.querySelector('em'); em.textContent = n ? '近30分上車 ' + n : ''; em.className = n > CAP ? 'hot' : ''; }
  // 標籤避讓：依優先序（大站 → 有刷卡的小站 → 其他小站 → 地名）放置，名字互相重疊就只留站點圓點，滑過圓點才顯示站名
  const placed = [];
  const hit = (r) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const L of LABEL_ORDER) {
    _v.copy(L.pos).project(camera);
    if (!(_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1)) { L.el.style.display = 'none'; continue; }
    const sx = (_v.x * .5 + .5) * w, sy = (-_v.y * .5 + .5) * h, ty = L.cls === 'tick' ? '0' : '-100%';
    L.el.style.display = '';
    L.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,${ty})`;
    if (L.cls === 'tick') continue;
    const lw = L.w || 60, lh = L.h || 20, r = [sx - lw / 2 - 2, sy - lh - 1, sx + lw / 2 + 2, sy + 1];
    if (L.cls.includes('tiny')) {
      const show = !hit(r); L.el.classList.toggle('nm0', !show);
      if (show) placed.push(r); else placed.push([sx - 4, sy - 7, sx + 4, sy + 1]);
    } else if (L.cls.includes('minor')) {
      const o = clamp(1.6 - camera.position.distanceTo(L.pos) / 40, 0, 1);
      if (o <= 0 || hit(r)) { L.el.style.display = 'none'; continue; }
      L.el.style.opacity = o; placed.push(r);
    } else placed.push(r);
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
   全線實體站點（TDX 站序）
   刷卡資料只有 16 個票價站；沒有自己刷卡站的實體站（如民興公園、大成國小、三育）
   只畫站位與「通過時刻」（前後兩個刷卡站之間沿線形內插，標 ≈），不給它們編上下車人數
   ============================================================ */
const ALLSTOP = [   // [段, 顯示名, TDX 站名[], 刷卡站名[], 相鄰票價站（無獨立刷卡站時）, 3D 已有大標籤]
  ['台中市區段', '干城站', ['干城站'], ['臺中'], '', 1],
  ['台中市區段', '台中火車站', ['臺中車站(民族路口)'], [], '臺中（市區 4 站共用）'],
  ['台中市區段', '民興公園', ['民興公園(執行分署)'], [], '臺中（市區 4 站共用）'],
  ['台中市區段', '捷運大慶站', ['捷運大慶站(建國北路)'], [], '臺中（市區 4 站共用）'],
  ['台中市區段', '高鐵臺中站', ['高鐵臺中站'], ['高鐵臺中站'], '', 1],
  ['南投埔里段', '埔里遊客中心', ['埔里遊客中心'], [], '牛耳石雕公園'],
  ['南投埔里段', '牛耳石雕公園', ['牛耳石雕公園'], ['牛耳石雕公園']],
  ['南投埔里段', '崎下', ['崎下'], ['崎下']],
  ['南投埔里段', '大成國小', ['大成國小'], [], '崎下／埔里站'],
  ['南投埔里段', '榮民診所', ['榮民醫院'], [], '崎下／埔里站'],
  ['南投埔里段', '埔里酒廠', ['埔里酒廠'], [], '崎下／埔里站'],
  ['南投埔里段', '中華電信', ['中華電信'], [], '崎下／埔里站'],
  ['南投埔里段', '埔里站', ['埔里站'], ['埔里站'], '', 1],
  ['魚池／日月潭段', '暨南大學', ['暨南大學', '暨南大學(校內)'], ['暨南大學', '暨南大學校內'], '', 1],
  ['魚池／日月潭段', '桃米坑', ['桃米坑'], ['桃米坑']],
  ['魚池／日月潭段', '大雁', ['大雁'], ['大雁']],
  ['魚池／日月潭段', '三育', ['三育神學院'], [], '大雁／魚池'],
  ['魚池／日月潭段', '魚池', ['魚池'], ['魚池'], '', 1],
  ['魚池／日月潭段', '日月老茶廠', ['日月老茶廠'], ['日月老茶廠']],
  ['魚池／日月潭段', '日月潭(水社)', ['日月潭'], ['日月潭', '水社'], '', 1],
  ['魚池／日月潭段', '向山行政中心', ['向山行政中心'], ['向山行政中心'], '', 1],
  ['A 線支線', '九族文化村', ['九族文化村'], ['九族文化村']],
].map(([seg, nm, tdx, taps, near, big]) => ({ seg, nm, tdx, taps, near, big: !!big, pos: STOPS[tdx[0]] }));
// 各線形上的站位距離（點到線形 < 150 m 的每一段取最近點；埔里市區站在 D 線會經過兩次）
for (const S of ALLSTOP) {
  S.dk = {};
  for (const k of ['D', 'B', 'H', 'F']) {
    const a = PATHS[k][0], out = [];
    for (const nm of S.tdx) {
      const s = STOPS[nm]; if (!s) continue; let bi = -1, bd = .0225;
      a.pts.forEach((p, i) => { const d = (p.x - s[0]) ** 2 + (p.z - s[1]) ** 2; if (d < bd) { bd = d; bi = i; } else if (d >= .0225 && bi >= 0) { out.push(a.cum[bi]); bi = -1; bd = .0225; } });
      if (bi >= 0) out.push(a.cum[bi]);
    }
    S.dk[k] = out.sort((x, y) => x - y);
  }
}
const _stopCache = new WeakMap();
function stopPasses(s) {   // 每站每班的通過時刻：有自己刷卡站且該班有刷卡 → 刷卡時刻；否則沿線形內插
  if (_stopCache.has(s)) return _stopCache.get(s);
  const out = ALLSTOP.map(() => []);
  for (const tr of s.trips) {
    if (!tr.ok) continue; const A = tr.anchors, L = PATHS[tr.pk][0].len;
    ALLSTOP.forEach((S, si) => {
      const e = S.taps.length ? tr.ev.find((x) => S.taps.includes(x.sta)) : null;
      if (e) { out[si].push({ t: e.t, dir: tr.dir, tr, tap: 1 }); return; }
      const ds = (S.dk[tr.pk] || []).map((d) => (tr.dir ? L - d : d)).sort((x, y) => x - y);
      for (const d of ds) {
        if (d < A[0].d - .05 || d > A.at(-1).d + .05) continue;
        let t = A[0].t; for (let i = 1; i < A.length; i++) if (d <= A[i].d) { t = lerp(A[i - 1].t, A[i].t, clamp((d - A[i - 1].d) / ((A[i].d - A[i - 1].d) || 1), 0, 1)); break; } else t = A[i].t;
        out[si].push({ t: Math.round(t), dir: tr.dir, tr, tap: 0 }); break;
      }
    });
  }
  for (const L of out) L.sort((a, b) => a.t - b.t);
  _stopCache.set(s, out); return out;
}
let STOP_SIG = '';
function renderStops(force) {
  const s = SIM(), el = $('#stTbl'); if (!el || !s) return; const t = nowT(), sig = s.date + '|' + t + '|' + [...LINE];
  if (!force && sig === STOP_SIG) return; STOP_SIG = sig;
  const P = stopPasses(s); let seg = '', h = '<tr><th>站</th><th>刷卡站</th><th>上／下</th><th>往潭</th><th>往台中</th><th>班</th></tr>';
  const nx = (L, dir) => { const p = L.find((x) => x.dir === dir && x.t >= t && lineOn(x.tr)); return p ? `${p.tap ? '' : '≈'}${fmt(p.t)}<small> ${p.tr.bus}</small>` : '—'; };
  ALLSTOP.forEach((S, si) => {
    if (S.seg !== seg) { seg = S.seg; h += `<tr class="seg"><td colspan="6">${seg}</td></tr>`; }
    let ba = '—';
    if (S.taps.length) { let b = 0, a = 0; for (const e of s.events) { if (e.t > t) break; if (S.taps.includes(e.sta) && lineOn(e.tr)) { b += e.b; a += e.a; } } ba = `${b}／${a}`; }
    const L = P[si], tapNm = S.taps.length ? (S.taps[0] === '臺中' ? '臺中 ×4' : S.taps[0] === S.nm ? '＝' : S.taps[0]) : `<span class="mut">→ ${S.near.replace('（市區 4 站共用）', ' ×4')}</span>`;
    h += `<tr data-si="${si}"><td>${S.nm}</td><td>${tapNm}</td><td>${ba}</td><td>${nx(L, 0)}</td><td>${nx(L, 1)}</td><td>${L.filter((x) => lineOn(x.tr)).length}</td></tr>`;
  });
  el.innerHTML = h;
}
$('#stTbl') && $('#stTbl').addEventListener('click', (e) => { const r = e.target.closest('tr[data-si]'); if (!r) return; const S = ALLSTOP[+r.dataset.si]; if (!S.pos) return; LIVE.follow = false; const c = new THREE.Vector3(S.pos[0], yAt(S.pos[0], S.pos[1]), S.pos[1]); flyTo(c, c.clone().add(new THREE.Vector3(-.9, 1.3, 1.8))); });
for (const S of ALLSTOP) if (!S.big && S.pos) { const L = addLabel(`<b>${S.nm}</b>`, new THREE.Vector3(S.pos[0], yAt(S.pos[0], S.pos[1]) + .03, S.pos[1]), 'lb tiny'); L.pri = S.taps.length ? 1 : 2; L.w = S.nm.length * 10.5 + 6; L.h = 24; L.el.title = S.nm + (S.taps.length ? '' : '（無獨立刷卡站，人數記在 ' + S.near + '）'); }
const LABEL_ORDER = LABELS.slice().sort((a, b) => (a.pri ?? (a.cls.includes('minor') ? 3 : 0)) - (b.pri ?? (b.cls.includes('minor') ? 3 : 0)));
function measureLabels() { for (const L of LABELS) if (!L.cls.includes('tiny') && L.cls !== 'tick' && L.el.style.display !== 'none' && L.el.offsetWidth) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; } }


/* ============================================================
   站線圖（3D 下方）：22 站像捷運路線圖一樣排開，車輛依刷卡時刻／內插時刻在線上移動
   ============================================================ */
const STRIP = { el: $('#strip'), on: true, sig: '' };
try { STRIP.on = localStorage.getItem('tx-strip') !== '0'; } catch (e) {}
const SHORT = ['干城', '台中車站', '民興公園', '大慶', '高鐵', '遊客中心', '牛耳', '崎下', '大成國小', '榮民診所', '埔里酒廠', '中華電信', '埔里', '暨大', '桃米坑', '大雁', '三育', '魚池', '老茶廠', '水社', '向山', '九族(A)'];
const ORD = ALLSTOP.map((_, i) => (i === 21 ? 17.5 : i));   // 九族：A 線在魚池與老茶廠之間進出
function stripXY(W) {   // 單位：市區 4、國道空隔 3、埔里 7、空隔 1.5、山區 7
  const u = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 20], pad = 22, k = (W - pad * 2) / 22.5;
  return u.map((x, i) => [pad + x * k, i === 21 ? 19 : 42]);
}
function tripStrip(s) {   // 每班沿站序的 [站, 時刻]；埔里市區站在 D 線會經過兩次，取讓站序單調、且優先保留刷卡站的最佳子序列
  if (s._strip) return s._strip;
  const P = stopPasses(s), by = new Map();
  P.forEach((L, si) => L.forEach((p) => { if (!by.has(p.tr)) by.set(p.tr, []); by.get(p.tr).push({ si, t: p.t, w: p.tap ? 5 : 1 }); }));
  for (const [tr, L] of by) {
    L.sort((a, b) => a.t - b.t || (tr.dir ? ORD[b.si] - ORD[a.si] : ORD[a.si] - ORD[b.si]));
    const ok = (a, b) => (tr.dir ? ORD[b.si] < ORD[a.si] : ORD[b.si] > ORD[a.si]);
    const best = L.map((x) => x.w), prev = L.map(() => -1);
    for (let i = 0; i < L.length; i++) for (let j = 0; j < i; j++) if (ok(L[j], L[i]) && best[j] + L[i].w > best[i]) { best[i] = best[j] + L[i].w; prev[i] = j; }
    let i = best.indexOf(Math.max(...best)); const seq = []; while (i >= 0) { seq.unshift(L[i]); i = prev[i]; }
    by.set(tr, seq);
  }
  return (s._strip = by);
}
function buildStrip() {
  const el = STRIP.el; if (!el) return; el.hidden = !STRIP.on; $('#stripBtn') && $('#stripBtn').setAttribute('aria-pressed', STRIP.on);
  if (!STRIP.on) return;
  const W = el.clientWidth || 800, H = 100, xy = stripXY(W); STRIP.xy = xy; STRIP.W = W;
  const L = (a, b, dash) => `<line x1="${xy[a][0]}" y1="42" x2="${xy[b][0]}" y2="42" stroke="var(--strong)" stroke-width="3" stroke-linecap="round"${dash ? ' stroke-dasharray="1 6" stroke-opacity=".5"' : ''}/>`;
  let h = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  h += L(0, 4) + L(4, 5, 1) + L(5, 12) + L(12, 13) + L(13, 19) + `<line x1="${xy[19][0]}" y1="42" x2="${xy[20][0]}" y2="42" stroke="var(--strong)" stroke-width="3" stroke-dasharray="5 3"/>`;
  h += `<path d="M${xy[17][0]} 42 Q${xy[21][0]} 6 ${xy[18][0]} 42" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  const cap = (x, t, a = 'start') => `<text x="${x}" y="13" text-anchor="${a}" class="cap">${t}</text>`;
  h += cap(xy[0][0], '台中市區') + cap((xy[4][0] + xy[5][0]) / 2, '國道 6 號 · 約 58 km', 'middle') + cap(xy[5][0], '') + cap(xy[5][0], '南投埔里') + cap(xy[13][0], '魚池／日月潭') ;
  ALLSTOP.forEach((S, i) => {
    const [x, y] = xy[i], tap = S.taps.length > 0;
    h += `<g class="st" data-si="${i}"><title>${S.nm}${tap ? '（刷卡站）' : '（無獨立刷卡站，人數記在 ' + S.near + '）'}</title>` +
      (tap ? `<circle cx="${x}" cy="${y}" r="4.6" fill="var(--card)" stroke="var(--strong)" stroke-width="2"/>` : `<circle cx="${x}" cy="${y}" r="2.6" fill="var(--card)" stroke="var(--muted)" stroke-width="1.4"/>`) +
      (i === 21 ? `<text x="${x + 7}" y="${y + 3.5}" class="nm tap">${SHORT[i]}</text>` : `<text x="${x}" y="${y + 13}" class="nm v${tap ? ' tap' : ''}">${SHORT[i]}</text>`) + `<rect x="${x - 8}" y="${y - 8}" width="${i === 21 ? 40 : 16}" height="${i === 21 ? 16 : 58}" fill="transparent"/></g>`;
  });
  h += `<g id="stripBus"></g></svg>`;
  el.innerHTML = h; STRIP.bus = el.querySelector('#stripBus'); STRIP.sig = ''; updateStrip();
}
function updateStrip() {
  if (!STRIP.on || !STRIP.bus || !SIM()) return; const s = SIM(), t = nowT(), sig = s.date + '|' + t + '|' + LIVE.sel; if (sig === STRIP.sig) return; STRIP.sig = sig;
  const TS = tripStrip(s), xy = STRIP.xy; let h = '', sel = '';
  for (const b of s.buses) {
    if (b.state !== 'run' || !lineOn(b.trip)) continue; const seq = TS.get(b.trip); if (!seq || !seq.length) continue;
    let x, y; if (t <= seq[0].t) [x, y] = xy[seq[0].si]; else if (t >= seq.at(-1).t) [x, y] = xy[seq.at(-1).si];
    else for (let i = 1; i < seq.length; i++) if (t <= seq[i].t) { const a = xy[seq[i - 1].si], c = xy[seq[i].si], f = (t - seq[i - 1].t) / ((seq[i].t - seq[i - 1].t) || 1); x = lerp(a[0], c[0], f); y = lerp(a[1], c[1], f); break; }
    const dy = b.trip.dir ? 9 : -9, col = b.trip.dir ? 'var(--accent2)' : 'var(--accent)', on = LIVE.sel === b.id, full = b.load >= CAP;
    const g = `<g class="bs" data-b="${b.id}" transform="translate(${x.toFixed(1)},${(y + dy).toFixed(1)})"><title>${b.id} · ${b.trip.code} · 票證在車量 ${b.load}</title><circle r="${on ? 6 : 4.2}" fill="${col}" stroke="${full ? 'var(--lit)' : 'var(--card)'}" stroke-width="${full ? 2 : 1.2}"/>${on ? `<text y="${b.trip.dir ? 16 : -9}" text-anchor="middle" class="bid">${b.id}</text>` : ''}</g>`;
    if (on) sel = g; else h += g;
  }
  STRIP.bus.innerHTML = h + sel;
}
if (STRIP.el) {
  STRIP.el.addEventListener('click', (e) => {
    const bs = e.target.closest('.bs'); if (bs) return select(bs.dataset.b);
    const st = e.target.closest('.st'); if (!st) return; const S = ALLSTOP[+st.dataset.si]; if (!S.pos) return;
    LIVE.follow = false; const c = new THREE.Vector3(S.pos[0], yAt(S.pos[0], S.pos[1]), S.pos[1]); flyTo(c, c.clone().add(new THREE.Vector3(-.9, 1.3, 1.8)));
  });
  new ResizeObserver(() => { if (STRIP.on && Math.abs((STRIP.el.clientWidth || 0) - (STRIP.W || 0)) > 2) buildStrip(); }).observe(STRIP.el);
}
function applyLines() {
  for (const k in ROUTE_LINES) ROUTE_LINES[k].visible = LINE_CODES.some((c) => LINE.has(c) && LINE_PATH[c] === k);
  document.querySelectorAll('#lines button[data-c]').forEach((b) => b.setAttribute('aria-pressed', LINE.has(b.dataset.c)));
  $('#linesAll') && $('#linesAll').setAttribute('aria-pressed', LINE.size === LINE_CODES.length);
  if (LIVE.sel) { const b = SIM() && SIM().buses.find((x) => x.id === LIVE.sel); if (b && !busOn(b)) select(null); }
  STRIP.sig = ''; STOP_SIG = ''; try { localStorage.setItem('tx-lines', [...LINE].join(',')); } catch (e) {}
  refreshUI(true); drawGantt();
}
if ($('#lines')) {
  $('#lines').insertAdjacentHTML('beforeend', `<button id="linesAll" title="顯示全部子線">全部</button>` + LINE_CODES.map((c) => `<button data-c="${c}" title="點一下只看 ${c}；按住 Shift／Ctrl 點可複選" style="--lc:var(${LINE_PATH[c] === 'D' ? '--route' : LINE_PATH[c] === 'B' ? '--route-b' : '--route-h'})">${c.slice(4)}</button>`).join(''));
  $('#lines').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'linesAll') { LINE_CODES.forEach((c) => LINE.add(c)); return applyLines(); }
    const c = b.dataset.c, all = LINE.size === LINE_CODES.length;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (LINE.has(c) && LINE.size > 1) LINE.delete(c); else LINE.add(c); }
    else if (all || !LINE.has(c)) { if (all) LINE.clear(); LINE.add(c); }
    else if (LINE.size > 1) LINE.delete(c); else LINE_CODES.forEach((x) => LINE.add(x));
    applyLines();
  });
  try { const v = localStorage.getItem('tx-lines'); if (v) { const L = v.split(',').filter((c) => LINE_CODES.includes(c)); if (L.length) { LINE.clear(); L.forEach((c) => LINE.add(c)); } } } catch (e) {}
  setTimeout(applyLines, 0);
}
$('#stripBtn') && ($('#stripBtn').onclick = () => { STRIP.on = !STRIP.on; try { localStorage.setItem('tx-strip', STRIP.on ? '1' : '0'); } catch (e) {} buildStrip(); });
buildStrip();

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
  for (const S of ALLSTOP) if (S.pos && !S.big) { const [a, b] = MINI.m(...S.pos); html += `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="1.7" fill="var(--card)" stroke="var(--muted)" stroke-width=".9"><title>${S.nm}</title></circle>`; }
  for (const [stop, nm, anchor] of [['干城站', '台中', 'start'], ['高鐵臺中站', '高鐵', 'end'], ['埔里站', '埔里', 'start'], ['暨南大學(校內)', '暨大', 'end'], ['魚池', '魚池', 'start'], ['日月潭', '日月潭', 'end'], ['向山行政中心', '向山', 'end']]) {
    const [a, b] = MINI.m(...STOPS[stop]); const dx = anchor === 'start' ? 7 : -7;
    html += `<circle cx="${a}" cy="${b}" r="3.2" fill="var(--card)" stroke="var(--strong)" stroke-width="1.2"/><text x="${a + dx}" y="${b + 3.5}" text-anchor="${anchor}" style="font:500 10.5px 'Noto Sans TC';fill:var(--strong)">${nm}</text>`;
  }
  html += `<g id="miniDots"></g><g id="miniSel"><circle r="11" fill="var(--lit)" opacity=".18"><animate attributeName="r" values="7;13;7" dur="1.6s" repeatCount="indefinite"/></circle><circle r="5.5" fill="var(--lit)" stroke="var(--card)" stroke-width="1.6"/><text id="miniSelT" y="-10" text-anchor="middle" style="font:500 10px var(--mono);fill:var(--lit)"></text></g>`;
  html += `<g transform="translate(${MINI.W - 30},${MINI.H - 16})"><line x1="0" y1="0" x2="${10 * sc > 60 ? 5 * sc : 10 * sc}" y2="0" stroke="var(--muted)"/><text x="0" y="-4" style="font:9px var(--mono);fill:var(--muted)">${10 * sc > 60 ? 5 : 10} km</text></g>`;
  MINI.svg.innerHTML = html;
  MINI.dots = MINI.svg.querySelector('#miniDots'); MINI.sel = MINI.svg.querySelector('#miniSel'); MINI.selT = MINI.svg.querySelector('#miniSelT');
}
const STATE_ZH = { off: ['未出車', ''], lay: ['端點停靠', ''], run: ['行駛中', 'run'], done: ['收班', 'ok'] };
function select(id) {
  LIVE.sel = id; $('#mini').hidden = !id; LIVE.follow = false;
  if (!id && LIVE.only) { LIVE.only = false; $('#only').setAttribute('aria-pressed', 'false'); }
  renderList(true); updateMini();
}
function busLoc(b) {   // 依刷卡時刻：上一個有刷卡的站、下一個有刷卡的站
  if (b.state !== 'run') return { at: b.term };
  const t = nowT(), ev = b.trip.ev; let prev = ev[0], next = null;
  for (const e of ev) { if (e.t <= t) prev = e; else { next = e; break; } }
  return { prev: prev.z, prevE: prev, next: next ? next.z : null, nextE: next };
}
function updateMini() {
  if (!LIVE.sel) return; const s = SIM(), b = s.buses.find((x) => x.id === LIVE.sel); if (!b) return;
  let dots = '';
  for (const o of s.buses) { if (o.id === b.id) continue; const v = VIS[o.id]; if (!v || !v.last || !v.root.visible) continue; const [a, c] = MINI.m(v.last.x, v.last.z); dots += `<circle cx="${a.toFixed(1)}" cy="${c.toFixed(1)}" r="2.6" fill="${o.state === 'run' ? (o.trip.dir ? 'var(--accent2)' : 'var(--accent)') : 'var(--muted)'}" opacity="${LIVE.only ? .15 : .7}"/>`; }
  MINI.dots.innerHTML = dots;
  const v = VIS[b.id]; if (v && v.last) { const [a, c] = MINI.m(v.last.x, v.last.z); MINI.sel.setAttribute('transform', `translate(${a.toFixed(1)},${c.toFixed(1)})`); MINI.selT.textContent = b.id; }
  const [stz, cls] = STATE_ZH[b.state] || ['—', '']; const tr = b.trip;
  $('#miniName').textContent = `${b.id}${tr ? ' · ' + tr.code + ' ' + dirTxt(tr) : ''}`;
  $('#miniState').textContent = stz; $('#miniState').className = 'chip ' + cls;
  const L = busLoc(b); let facts;
  if (tr) {
    facts = [['票證在車量', `${b.load}<small style="font-size:10px;color:var(--muted)"> / ${CAP}</small>`], ['目前位置', `${ZNAME[L.prev]}→${L.next ? ZNAME[L.next] : '終點'}`], ['下一站刷卡時刻', L.nextE ? fmt(L.nextE.t) : '—'],
      ['本班發車', fmt(tr.dep)], ['本班上車', tr.board + ' 筆'], ['刷卡站數', tr.ev.length + ' 站' + (tr.ok ? '' : '（不足以畫路線）')]];
    $('#miniSeat').style.width = Math.min(100, b.load / CAP * 100) + '%'; $('#miniSeat').style.background = b.load > CAP ? 'var(--lit)' : 'var(--accent)';
  } else {
    const nx = b.plan[b.k];
    facts = [['票證在車量', '—'], ['停靠位置', b.state === 'off' ? '—' : ZNAME[b.term]], ['下一班發車', nx ? fmt(nx.dep) : '今日收班'],
      ['下一班', nx ? nx.code + ' ' + dirTxt(nx) : '—'], ['今日已跑', b.done + ' 班'], ['今日共跑', b.plan.length + ' 班']];
    $('#miniSeat').style.width = '0%';
  }
  $('#miniFacts').innerHTML = facts.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  miniCurve(tr || b.plan[Math.max(0, b.k - 1)]);
  $('#miniNote').textContent = `${LIVE.date} 刷卡重播。人數＝刷卡上車減下車（不含現金）；兩站之間的位置依前後站刷卡時刻內插，非 GPS。車號為當日匿名序號。`;
}
function miniCurve(tr) {   // 本班沿站序的上車、下車與票證在車量
  const svg = $('#miniCurve'); if (!tr) { svg.innerHTML = ''; return; }
  const E = tr.ev, n = E.length, W = 340, H = 92, m = { l: 26, r: 6, t: 12, b: 22 }, mx = Math.max(CAP, ...E.map((e) => Math.max(e.load, e.b, e.a))), bw = (W - m.l - m.r) / n;
  const Y = (v) => H - m.b - (H - m.t - m.b) * v / mx, t = nowT();
  let s = `<text x="${m.l}" y="9" style="font:9.5px 'Noto Sans TC';fill:var(--muted)">本班沿站：上車／下車（柱）與票證在車量（線）</text><line x1="${m.l}" x2="${W - m.r}" y1="${Y(CAP)}" y2="${Y(CAP)}" stroke="var(--muted)" stroke-dasharray="2 2" opacity=".6"/><text x="${m.l - 3}" y="${Y(CAP) + 3}" text-anchor="end" style="font:8.5px var(--mono);fill:var(--muted)">43</text>`;
  E.forEach((e, i) => { const x = m.l + bw * i, past = e.t <= t;
    s += `<rect x="${(x + bw * .15).toFixed(1)}" y="${Y(e.b).toFixed(1)}" width="${(bw * .32).toFixed(1)}" height="${(H - m.b - Y(e.b)).toFixed(1)}" fill="var(--accent)" opacity="${past ? 1 : .35}"/><rect x="${(x + bw * .5).toFixed(1)}" y="${Y(e.a).toFixed(1)}" width="${(bw * .32).toFixed(1)}" height="${(H - m.b - Y(e.a)).toFixed(1)}" fill="var(--accent2)" opacity="${past ? 1 : .35}"/>`;
    s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 11}" text-anchor="middle" style="font:8.5px 'Noto Sans TC';fill:var(--text)">${e.sta.replace('高鐵臺中站', '高鐵').replace('向山行政中心', '向山').replace('暨南大學校內', '暨大內').replace('暨南大學', '暨大').replace('九族文化村', '九族').replace('日月老茶廠', '老茶廠').replace('牛耳石雕公園', '牛耳').replace('台中航空站', '航空站')}</text><text x="${(x + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" style="font:8px var(--mono);fill:var(--muted)">${fmt(e.t)}</text>`; });
  s += `<path d="${E.map((e, i) => (i ? 'L' : 'M') + (m.l + bw * (i + .5)).toFixed(1) + ' ' + Y(e.load).toFixed(1)).join('')}" fill="none" stroke="var(--strong)" stroke-width="1.6"/>`;
  E.forEach((e, i) => { s += `<circle cx="${(m.l + bw * (i + .5)).toFixed(1)}" cy="${Y(e.load).toFixed(1)}" r="2.2" fill="${e.load > CAP ? 'var(--lit)' : 'var(--strong)'}"><title>${e.sta} ${fmt(e.t)}：上 ${e.b}、下 ${e.a}、在車 ${e.load}</title></circle>`; });
  svg.innerHTML = s;
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
function goHome() { LIVE.follow = false; if (LIVE.sel) select(null); const [t, p] = viewOf('all'); flyTo(t, p); }
$('#views').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; if (b.dataset.v === 'all') return goHome(); LIVE.follow = false; const [t, p] = viewOf(b.dataset.v); flyTo(t, p); });
addEventListener('keydown', (e) => { if (e.target.closest && e.target.closest('input,select,textarea,[contenteditable]')) return; if (e.key === 'h' || e.key === 'H' || e.key === 'Escape') goHome(); });
host.addEventListener('dblclick', (e) => { if (!e.target.closest('.lb,.vm,button')) goHome(); });
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
// 面板拉寬時：圖表 viewBox 跟著實際寬度放寬（字級維持 1:1），高度只溫和放大，避免文字等比例變大
function fitBox(svg) {
  if (!svg.dataset.w0) { const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number); svg.dataset.w0 = w; svg.dataset.h0 = h; }
  const w0 = +svg.dataset.w0, h0 = +svg.dataset.h0, cw = svg.parentElement ? svg.parentElement.clientWidth : 0;
  const s = cw > w0 ? cw / w0 : 1, W = Math.round(w0 * s), H = Math.round(h0 * Math.min(1.6, Math.sqrt(s)));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.dataset.fit = '1'; return [0, 0, W, H];
}
function frame(svg, W, H, m, yMax, yTicks = 4, xLabels = [], xPos = null) {
  yTicks = nTicks(yMax); let s = '';
  for (let i = 0; i <= yTicks; i++) { const v = yMax * i / yTicks, y = H - m.b - (H - m.t - m.b) * i / yTicks; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--rule)" stroke-width="1"/><text x="${m.l - 4}" y="${y + 3}" text-anchor="end">${nfmt(v)}</text>`; }
  xLabels.forEach((t, i) => { if (t === '' || t == null) return; const x = xPos ? xPos(i) : m.l + (W - m.l - m.r) * i / Math.max(1, xLabels.length - 1); s += `<text x="${x}" y="${H - m.b + 12}" text-anchor="middle">${t}</text>`; });
  return s;
}
function lineChart(svg, { series, xLabels = [], yMax, band, marks = [] }) {
  const [, , W, H] = fitBox(svg), m = { l: 34, r: 8, t: 8, b: 18 };
  const n = Math.max(...series.map((s) => s.y.length)); yMax = yMax || niceMax(Math.max(...series.flatMap((s) => s.y.filter((v) => !isNaN(v))), ...(band ? band.hi : [])));
  const X = (i) => m.l + (W - m.l - m.r) * i / Math.max(1, n - 1), Y = (v) => H - m.b - (H - m.t - m.b) * v / yMax;
  let s = frame(svg, W, H, m, yMax, 4, xLabels, X);
  for (const mk of marks) s += `<rect x="${X(mk.i) - 2}" y="${m.t}" width="${Math.max(2, X(mk.i + 1) - X(mk.i))}" height="${H - m.t - m.b}" fill="${mk.color}" opacity=".5"/>`;
  if (band) { let d = ''; band.hi.forEach((v, i) => d += (i ? 'L' : 'M') + X(i) + ' ' + Y(v)); for (let i = band.lo.length - 1; i >= 0; i--) d += 'L' + X(i) + ' ' + Y(band.lo[i]); s += `<path d="${d}Z" fill="${band.color}" opacity="${band.op || .5}"/>`; }
  for (const se of series) { let d = '', pen = false; se.y.forEach((v, i) => { if (isNaN(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.w || 1.6}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`; if (se.dots) se.y.forEach((v, i) => { if (!isNaN(v)) s += `<circle cx="${X(i)}" cy="${Y(v)}" r="2" fill="${se.color}"/>`; }); }
  svg.innerHTML = s;
}
function barChart(svg, { groups, xLabels, colors, yMax, line, lineColor }) {
  const [, , W, H] = fitBox(svg), m = { l: 30, r: 6, t: 8, b: 18 };
  const n = groups[0].length, k = groups.length; yMax = yMax || niceMax(Math.max(...groups.flat(), ...(line || [])));
  const bw = (W - m.l - m.r) / n, Y = (v) => H - m.b - (H - m.t - m.b) * v / yMax;
  let s = frame(svg, W, H, m, yMax, 4, xLabels, (i) => m.l + bw * (i + .5));
  for (let i = 0; i < n; i++) groups.forEach((g, j) => { const w = (bw - 2) / k, x = m.l + bw * i + 1 + w * j; s += `<rect x="${x.toFixed(1)}" y="${Y(g[i]).toFixed(1)}" width="${Math.max(1, w - .6).toFixed(1)}" height="${(H - m.b - Y(g[i])).toFixed(1)}" rx="1" fill="${colors[j]}"/>`; });
  if (line) { let d = ''; line.forEach((v, i) => d += (i ? 'L' : 'M') + (m.l + bw * (i + .5)).toFixed(1) + ' ' + Y(v).toFixed(1)); s += `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="1.5"/>`; }
  svg.innerHTML = s;
}
function heatmap(svg, { rows, rowLabels, colLabels, color = 'var(--accent)' }) {
  const [, , W, H] = fitBox(svg), m = { l: 26, r: 4, t: 4, b: 16 };
  const mx = Math.max(...rows.flat()), cw = (W - m.l - m.r) / rows[0].length, ch = (H - m.t - m.b) / rows.length;
  let s = '';
  rows.forEach((r, i) => { s += `<text x="${m.l - 4}" y="${m.t + ch * (i + .5) + 3}" text-anchor="end" class="lbl">${rowLabels[i]}</text>`; r.forEach((v, j) => { s += `<rect x="${(m.l + cw * j + .5).toFixed(1)}" y="${(m.t + ch * i + .5).toFixed(1)}" width="${(cw - 1).toFixed(1)}" height="${(ch - 1).toFixed(1)}" rx="1.5" fill="${color}" opacity="${(.04 + .96 * (v / mx) ** .8).toFixed(3)}"><title>${rowLabels[i]} ${colLabels[j] || j}：${Math.round(v)}</title></rect>`; }); });
  colLabels.forEach((t, j) => { if (t) s += `<text x="${m.l + cw * (j + .5)}" y="${H - 4}" text-anchor="middle">${t}</text>`; });
  svg.innerHTML = s;
}
function hbars(svg, { items, colors, labelW = 92 }) {   // items: [{label, v:[a,b]}]
  const [, , W, H] = fitBox(svg), rh = (H - 6) / items.length, mx = Math.max(...items.map((it) => it.v.reduce((a, b) => a + b, 0)));
  let s = '';
  items.forEach((it, i) => {
    const y = 3 + rh * i; s += `<text x="${labelW - 6}" y="${y + rh * .5 + 3.5}" text-anchor="end" class="lbl" style="fill:var(--strong)">${it.label}</text>`;
    let x = labelW; it.v.forEach((v, j) => { const w = (W - labelW - 44) * v / mx; s += `<rect x="${x.toFixed(1)}" y="${(y + rh * .18).toFixed(1)}" width="${Math.max(.5, w).toFixed(1)}" height="${(rh * .64).toFixed(1)}" rx="1.5" fill="${(it.colors || colors)[j]}"/>`; x += w; });
    s += `<text x="${x + 4}" y="${y + rh * .5 + 3.5}">${nfmt(it.v.reduce((a, b) => a + b, 0))}</text>`;
  });
  svg.innerHTML = s;
}
const C = (n) => cssv(n);

/* ============================================================
   01 即時營運
   ============================================================ */
function kpiHtml(items) { return items.map(([k, v, cls]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div></div>`).join(''); }
function boardsRecentF(s, z, mins) { let n = 0; for (const e of s.events) { if (e.t > s.t) break; if (e.t > s.t - mins && e.z === z && lineOn(e.tr)) n += e.b; } return n; }
function liveAlerts() {   // 只列資料中看得到的事實（跟著子線篩選）
  const s = SIM(), t = s.t, out = [];
  for (const b of s.buses) if (b.state === 'run' && lineOn(b.trip) && b.load > CAP) out.push({ lv: 'hi', bus: b.id, t, txt: `${b.id}（${b.trip.code} ${dirTxt(b.trip)}）在車 ${b.load} 人，超過 ${CAP} 座`, sub: `刷卡上車減下車；${ZNAME[busLoc(b).prev]}附近` });
  for (const z of ['HSR', 'TC', 'PULI', 'SML']) { const n = boardsRecentF(s, z, 30); if (n > CAP) out.push({ lv: 'w', t, txt: `${ZNAME[z]}近 30 分鐘刷卡上車 ${n} 人`, sub: '超過一班座位數' }); }
  for (const tr of s.S.done.slice().reverse()) { if (t - tr.arr > 60) break; if (tr.peak < 5 && lineOn(tr)) out.push({ lv: 'w', bus: tr.bus, t: tr.arr, txt: `${tr.bus} ${fmt(tr.dep)} ${tr.code} ${dirTxt(tr)}：全程最多 ${tr.peak} 人`, sub: `已到站；上車 ${tr.board} 人、實扣 $${tr.rev}` }); }
  return out;
}
function renderOps() {
  const s = SIM(), info = s.info, t = s.t, all = LINE.size === LINE_CODES.length;
  const TR = all ? s.trips : s.trips.filter(lineOn), done = TR.filter((tr) => tr.arr <= t);
  const bs = s.buses.filter(busOn), run = s.buses.filter((b) => b.state === 'run' && lineOn(b.trip)), onb = run.reduce((a, b) => a + b.load, 0);
  let boarded = 0; for (const e of s.events) { if (e.t > t) break; if (all || lineOn(e.tr)) boarded += e.b; }
  const over = done.filter((x) => x.peak > CAP).length, low = done.filter((x) => x.peak < 5).length, rev = done.reduce((a, x) => a + x.rev, 0);
  const taps = all ? s.day.taps : TR.reduce((a, x) => a + x.board, 0), drv = new Set(TR.map((x) => x.drv).filter(Boolean)).size;
  $('#kpis').innerHTML = kpiHtml([
    ['行駛中車輛', `${run.length}<small>/ ${bs.length} 台出車</small>`], ['票證在車量', `${onb}<small>筆</small>`], ['已刷卡上車', `${boarded.toLocaleString()}<small>筆</small>`],
    ['已完成車次', `${done.length}<small>/ ${TR.length}</small>`], ['在車量 >43 車次', `${over}<small>班</small>`, over ? 'bad' : 'good'], ['少於 5 人車次', `${low}<small>班</small>`, low ? 'bad' : ''],
    ['已完成實扣', `${nfmt(rev)}<small>元</small>`], ['當日刷卡', `${taps.toLocaleString()}<small>筆</small>`], ['當日司機', `${drv}<small>人</small>`]]);
  $('#opsSrc').textContent = `${info.date}（週${DOW_ZH[info.dow]}，${info.label}）· 刷卡重播${all ? '' : ' · 只計子線 ' + [...LINE].map((c) => c.slice(4)).join('、')}`;
  const al = liveAlerts();
  $('#alerts').innerHTML = al.length ? al.slice(0, 6).map((a) => `<div class="al ${a.lv === 'hi' ? 'hi' : ''}"${a.bus ? ` data-bus="${a.bus}" style="cursor:pointer"` : ''}><i></i><span>${a.txt}<br><small>${a.sub}</small></span><small>${fmt(a.t)}</small></div>`).join('') : `<div class="al ok"><i></i><span>目前沒有超載、大量上車或低載事件</span><small>${fmt(s.t)}</small></div>`;
  drawTimeline(); drawGantt();
}
$('#alerts').addEventListener('click', (e) => { const a = e.target.closest('[data-bus]'); if (a) select(a.dataset.bus); });
function renderList(force) {
  const s = SIM(); if (!s) return;
  const rank = { run: 0, lay: 1, done: 2, off: 3 };
  const order = s.buses.filter(busOn).sort((a, b) => rank[a.state] - rank[b.state] || a.id.localeCompare(b.id));
  const sig = order.map((b) => b.id + b.state + b.load).join('|') + LIVE.sel + [...LINE];
  if (!force && sig === renderList.sig) return; renderList.sig = sig;
  $('#vlist').innerHTML = order.map((b) => {
    const tr = b.trip, [stz, cls] = STATE_ZH[b.state] || ['—', ''];
    let d;
    if (tr) { const L = busLoc(b); d = `${tr.code} ${dirTxt(tr)} · ${ZNAME[L.prev]}→${L.next ? ZNAME[L.next] : '終點'}`; }
    else { const nx = b.plan[b.k]; d = `${b.state === 'off' && !b.done ? '首班 ' + fmt(b.plan[0].dep) : ZNAME[b.term]}${nx && b.done ? ' · 下一班 ' + fmt(nx.dep) : !nx ? ' · 今日收班' : ''}`; }
    return `<button class="vr" data-id="${b.id}" aria-current="${LIVE.sel === b.id}"><span class="id">${b.id}</span><span><span class="d" style="color:var(--strong);font-size:12.5px">${d}</span>${tr ? `<div class="load"><i class="${b.load > CAP ? 'hot' : ''}" style="width:${Math.min(100, b.load / CAP * 100)}%"></i></div>` : ''}</span><span class="r">${tr ? `<span style="font:500 12px var(--mono);color:var(--strong)">${b.load}/${CAP}</span><br>` : ''}<span class="chip ${cls}">${stz}</span></span></button>`;
  }).join('');
}
$('#vlist').addEventListener('click', (e) => { const r = e.target.closest('.vr'); if (!r) return; select(LIVE.sel === r.dataset.id ? null : r.dataset.id); });
const tlc = $('#tl'), tlx = tlc.getContext('2d');
function drawTimeline() {
  const r = tlc.getBoundingClientRect(); if (!r.width) return; const dpr = Math.min(devicePixelRatio, 2);
  if (tlc.width !== Math.round(r.width * dpr)) { tlc.width = Math.round(r.width * dpr); tlc.height = Math.round(r.height * dpr); }
  const w = tlc.width, h = tlc.height, s = SIM(), X = (m) => 10 * dpr + (m - 300) / (1380 - 300) * (w - 20 * dpr);
  tlx.clearRect(0, 0, w, h); tlx.font = `${9.5 * dpr}px JetBrains Mono, monospace`; tlx.fillStyle = C('--muted'); tlx.strokeStyle = C('--muted');
  for (let hr = 6; hr <= 22; hr += 2) { const x = X(hr * 60); tlx.globalAlpha = .35; tlx.fillRect(x, 4 * dpr, dpr, h - 20 * dpr); tlx.globalAlpha = 1; tlx.fillText(pad2(hr), x - 6 * dpr, h - 4 * dpr); }
  const rows = [16, 34].map((v) => v * dpr);
  for (const tr of s.trips) {
    const y = rows[tr.dir];
    tlx.fillStyle = tr.done ? C('--muted') : tr.dir ? C('--accent2') : C('--accent');
    if (tr.peak > CAP) tlx.fillStyle = C('--lit');
    const len = 3 + Math.min(1, tr.peak / CAP) * 7;
    tlx.fillRect(X(tr.dep) - dpr, y - len * dpr / 2 - 2 * dpr, 2 * dpr, (len + 4) * dpr);
  }
  tlx.fillStyle = C('--muted'); tlx.font = `${9 * dpr}px Noto Sans TC, sans-serif`; tlx.fillText('往潭', w - 30 * dpr, rows[0] + 3 * dpr); tlx.fillText('往中', w - 30 * dpr, rows[1] + 3 * dpr);
  const x = X(nowT()); tlx.fillStyle = C('--strong'); tlx.fillRect(x - dpr * .75, 2 * dpr, 1.5 * dpr, h - 17 * dpr);
}
const gc = $('#gantt'), gx = gc.getContext('2d'); let GROWS = [];
function drawGantt() {
  const s = SIM(); if (!s) return; const rows = [...s.buses].sort((a, b) => a.plan[0].dep - b.plan[0].dep); GROWS = rows;
  const rh = 9, H = rows.length * rh + 22; gc.style.height = H + 'px';
  const r = gc.getBoundingClientRect(); if (!r.width) return; const dpr = Math.min(devicePixelRatio, 2);
  if (gc.width !== Math.round(r.width * dpr) || gc.height !== Math.round(H * dpr)) { gc.width = Math.round(r.width * dpr); gc.height = Math.round(H * dpr); }
  const w = gc.width, l = 30 * dpr, X = (m) => l + (m - 300) / (1440 - 300) * (w - l - 8 * dpr);
  gx.clearRect(0, 0, w, gc.height); gx.font = `${9 * dpr}px JetBrains Mono, monospace`;
  for (let hr = 6; hr <= 24; hr += 2) { const x = X(hr * 60); gx.fillStyle = C('--rule'); gx.fillRect(x, 0, dpr, rows.length * rh * dpr); gx.fillStyle = C('--muted'); gx.fillText(pad2(hr % 24), x - 6 * dpr, gc.height - 6 * dpr); }
  rows.forEach((b, i) => {
    const y = (i * rh + 1) * dpr, hh = (rh - 2) * dpr;
    if (LIVE.sel === b.id) { gx.fillStyle = C('--card'); gx.fillRect(0, y - dpr, w, hh + 2 * dpr); }
    gx.fillStyle = LIVE.sel === b.id ? C('--lit') : C('--muted'); gx.fillText(b.id, 2 * dpr, y + hh - dpr);
    b.plan.forEach((t, k) => {
      gx.fillStyle = t.peak >= CAP ? C('--lit') : t.peak < 5 ? C('--rule') : t.dir ? C('--accent2') : C('--accent');
      gx.globalAlpha = (t.arr < s.t ? .55 : 1) * (lineOn(t) ? 1 : .1); gx.fillRect(X(t.dep), y, Math.max(dpr, X(t.arr) - X(t.dep)), hh); gx.globalAlpha = 1;
      const nx = b.plan[k + 1]; if (nx && t.endZ !== nx.startZ && !(t.endZ === 'HSR' && nx.startZ === 'TC') && !(t.endZ === 'TC' && nx.startZ === 'HSR')) { gx.strokeStyle = C('--muted'); gx.setLineDash([2 * dpr, 2 * dpr]); gx.beginPath(); gx.moveTo(X(t.arr), y + hh / 2); gx.lineTo(X(nx.dep), y + hh / 2); gx.stroke(); gx.setLineDash([]); }
    });
  });
  const x = X(nowT()); gx.fillStyle = C('--strong'); gx.fillRect(x - dpr * .75, 0, 1.5 * dpr, rows.length * rh * dpr);
}
gc.addEventListener('click', (e) => { const r = gc.getBoundingClientRect(), i = Math.floor((e.clientY - r.top) / 9); const b = GROWS[i]; if (b) select(LIVE.sel === b.id ? null : b.id); });
let GL_ON = true; $('#gl3d').onclick = () => { GL_ON = !GL_ON; $('#gl3d').textContent = GL_ON ? '暫停 3D 繪圖（省電）' : '恢復 3D 繪圖'; };
tlc.addEventListener('click', (e) => { const r = tlc.getBoundingClientRect(); jumpTo(300 + (e.clientX - r.left - 10) / (r.width - 20) * (1380 - 300)); });

/* ============================================================
   02 需求預測
   ============================================================ */
function renderFC() {
  const B = FC.back;
  $('#fcKpi').innerHTML = kpiHtml([['迴歸 WAPE', (B.wapeM * 100).toFixed(1) + '<small>%</small>', B.wapeM < B.wapeB ? 'good' : ''], ['基準 WAPE', (B.wapeB * 100).toFixed(1) + '<small>%</small>'], ['迴歸 MAE', Math.round(B.maeM) + '<small>筆/日</small>']]);
  lineChart($('#fcBack'), { series: [{ y: B.pts.map((p) => p.y), color: C('--muted'), w: 1.3 }, { y: B.pts.map((p) => p.pb), color: C('--accent2'), w: 1.1, dash: '3 2' }, { y: B.pts.map((p) => p.pm), color: C('--accent'), w: 1.8 }], xLabels: B.pts.map((p, i) => i % 10 === 0 ? p.date.slice(5) : ''), marks: B.pts.map((p, i) => dayInfo(p.date).holi ? { i, color: C('--chip') } : null).filter(Boolean) });
  const d0 = isoD(FCD), days = []; for (let i = 0; i < 14; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); days.push(iso(d)); }
  const f = [0, 1].map((dir) => days.map((d) => forecast(d, dir)));
  $('#fcDayLbl').textContent = FCD;
  lineChart($('#fcAhead'), { series: [{ y: f[0].map((x) => x.mean), color: C('--accent'), w: 1.8, dots: true }, { y: f[1].map((x) => x.mean), color: C('--accent2'), w: 1.8, dots: true }], band: { lo: f[0].map((x, i) => Math.min(x.lo, f[1][i].lo)), hi: f[0].map((x, i) => Math.max(x.hi, f[1][i].hi)), color: C('--chip'), op: 1 }, xLabels: days.map((d, k) => { const i = dayInfo(d); return k % 2 ? '' : d.slice(5).replace('-', '/') + DOW_ZH[i.dow]; }), marks: days.map((d, i) => dayInfo(d).off ? { i, color: C('--chip') } : null).filter(Boolean) });
  const h0 = hourlyDemand(FCD, 0), h1 = hourlyDemand(FCD, 1);
  barChart($('#fcHour'), { groups: [h0.slice(5, 23), h1.slice(5, 23)], xLabels: h0.slice(5, 23).map((_, i) => (i + 5) % 3 === 0 ? i + 5 : ''), colors: [C('--accent'), C('--accent2')] });
  const w = FC.models[0].w, eff = [['週六', 7], ['週五', 6], ['週一', 2], ['國定假日', 19], ['連假首日', 20], ['連假末日', 21], ['假期前一天', 22], ['春節', 23], ['7月', 13], ['10月', 16], ['趨勢/年', 1]];
  const svg = $('#fcCoef'), [, , W2, H2] = fitBox(svg), rh = (H2 - 4) / eff.length, mid = 230, sc = 110;
  let s = `<line x1="${mid}" x2="${mid}" y1="0" y2="${H2}" stroke="var(--rule)"/>`;
  eff.forEach(([nm, i], k) => { const e = (Math.exp(w[i]) - 1), e1 = (Math.exp(FC.models[1].w[i]) - 1), y = 2 + rh * k;
    s += `<text x="${mid - 120}" y="${y + rh * .62}" text-anchor="end" class="lbl" style="fill:var(--strong)">${nm}</text>`;
    for (const [v, col, o] of [[e, '--accent', 0], [e1, '--accent2', rh * .38]]) { const x = mid + clamp(v, -1, 1) * sc; s += `<rect x="${Math.min(mid, x).toFixed(1)}" y="${(y + o + rh * .08).toFixed(1)}" width="${Math.abs(x - mid).toFixed(1)}" height="${(rh * .34).toFixed(1)}" rx="1" fill="var(${col})"/>`; }
    s += `<text x="${W2 - 2}" y="${y + rh * .62}" text-anchor="end">${e >= 0 ? '+' : ''}${(e * 100).toFixed(0)}% / ${e1 >= 0 ? '+' : ''}${(e1 * 100).toFixed(0)}%</text>`; });
  svg.innerHTML = s;
  const an = [...FC.anomalies.values()].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8);
  $('#fcAnom').innerHTML = an.map((a) => { const i = dayInfo(a.date), fx = [0, 1].map((d) => Math.round(Math.exp(predLog(FC.models[d].w, feats(a.date))) - 1));
    return `<div class="al"><i></i><span>${a.date}（週${DOW_ZH[i.dow]}${i.holi ? '・假日' : ''}）<br><small>實際 ${a.y[0] || '—'}／${a.y[1] || '—'} · 模型 ${fx[0]}／${fx[1]}（往潭／往中）</small></span><small>${a.y[0] + a.y[1] < fx[0] + fx[1] ? '偏低' : '偏高'}</small></div>`; }).join('') || '<div class="al ok"><i></i><span>無</span></div>';
  $('#fcNote').textContent = `訓練資料：${SERIES[0].date} 至 ${SERIES.at(-1).date}，共 ${SERIES.length} 天（缺 ${Math.round((isoD(SERIES.at(-1).date) - isoD(SERIES[0].date)) / 864e5) + 1 - SERIES.length} 天，未補零）。預測 ${FCD} 需外推趨勢 ${Math.round((isoD(FCD) - isoD(SERIES.at(-1).date)) / 864e5)} 天，區間會低估此不確定性。2026 假日為推算。需求指的是可觀測的刷卡上車數，不含現金與滿載未上車者。`;
}

/* ============================================================
   03 尖離峰
   ============================================================ */
const PK = { y: 1, d: 0 }, VZ = { y: 1 };
const FCD = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); })();   // 預測頁：從明天起（與資料重播日無關）
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
  const svg = $('#pkTrip'), [, , PW, PH] = svg.getAttribute('viewBox').split(' ').map(Number); svg.insertAdjacentHTML('beforeend', `<line x1="30" x2="${PW - 6}" y1="${8 + (PH - 26) * (1 - 43 / 50)}" y2="${8 + (PH - 26) * (1 - 43 / 50)}" stroke="var(--muted)" stroke-dasharray="3 3"/>`);
  const thAll = Y.trip_hour.filter((r) => r.dir === PK.d), hst = Y.trip_peak_hist, lowShare = (hst[0] + hst[1]) / hst.reduce((a, b) => a + b, 0), lowHrs = thAll.filter((r) => r.peak_mean < 12).map((r) => `${r.weekend ? '假日' : '平日'}${r.hour}時`);
  const pk = [...we.keys()].sort((a, b) => we[b] - we[a]).slice(0, 3).sort((a, b) => a - b), pkWd = [...wd.keys()].sort((a, b) => wd[b] - wd[a]).slice(0, 3).sort((a, b) => a - b);
  const over = thAll.filter((r) => r.share_over_43 > .01).map((r) => `${r.weekend ? '假日' : '平日'} ${r.hour} 時（${(r.share_over_43 * 100).toFixed(1)}%）`);
  $('#pkCall').innerHTML = `<b>${PK.d ? '往台中' : '往日月潭／埔里'}</b>：假日尖峰 ${pk.map((h) => h + ' 時').join('、')}；平日尖峰 ${pkWd.map((h) => h + ' 時').join('、')}。<br>全年推估車次中，最大票證在車量少於 10 人的佔 <b>${Math.round(lowShare * 100)}%</b>（兩方向合計）；平均最大在車低於 12 人的時段：${lowHrs.slice(0, 8).join('、') || '無'}（離峰空載候選，可併班或改用小車）。${over.length ? '<br>超過 43 人的車次比例 > 1%：' + over.join('、') + '（可能有站立或加開需求）。' : ''}`;
  const mh = Y.month_hour; const mrows = Object.keys(mh).sort((a, b) => a - b).map((k) => mh[k].slice(5, 23));
  heatmap($('#pkMonth'), { rows: mrows, rowLabels: Object.keys(mh).sort((a, b) => a - b).map((k) => k + '月'), colLabels: mrows[0].map((_, i) => (i + 5) % 2 === 0 ? i + 5 : ''), color: C('--strong') });
}

/* ============================================================
   04 票證分析
   ============================================================ */
const ZN = { off: 1, d: 0 };
const ZONESEG = [{ key: 'city', nm: '市區段', sub: '台中–高鐵', lo: 0, hi: 1, p: .5 }, { key: 'fwy', nm: '國道段', sub: '高鐵–埔里', lo: 1, hi: 2, p: 1.5 }, { key: 'mtn', nm: '山區段', sub: '埔里–日月潭', lo: 2, hi: 6, p: 2.5 }, { key: 'ext', nm: '延駛段', sub: '日月潭–向山', lo: 6, hi: 7, p: 6.5 }];
{ const D = PATHS.D[0].zd, F = PATHS.F[0].zd, k = 1.08; ZONESEG[0].km = (D.HSR - D.TC) * k; ZONESEG[1].km = (D.PULI - D.HSR) * k; ZONESEG[2].km = (D.SML - D.PULI) * k; ZONESEG[3].km = (F.XS - F.SML) * k; }
function zoneStats(year, off, dir) {   // 只用刷卡還原的車次
  const RZK = RSTA.map((n) => ZRANK[BILL2Z[n]]), out = ZONESEG.map(() => ({ n: 0, cross: 0, pk: [], byH: {} }));
  let days = 0;
  for (const d of RDAYS) {
    if (!d.startsWith(year) || RP.days[d].off !== off) continue; days++;
    for (const [dr, code, , , seq] of RP.days[d].trips) {
      if (dr !== dir) continue;
      const cap = code === '6670E' ? 9 : CAP, h = Math.floor(seq[0][1] / 60); let L = 0; const segs = [];
      seq.forEach((s, i) => { L += s[2] - s[3]; if (i + 1 < seq.length) segs.push([RZK[s[0]], RZK[seq[i + 1][0]], L]); });
      ZONESEG.forEach((z, zi) => {
        let mx = -1, cr = 0;
        for (const [r1, r2, l] of segs) { const a = Math.min(r1, r2), b = Math.max(r1, r2); if (a < z.hi && b > z.lo) mx = Math.max(mx, l); if (a < z.p && z.p < b) cr += l; }
        if (mx < 0) return; const o = out[zi]; o.n++; o.cross += cr; o.pk.push([mx, cap]); (o.byH[h] ||= []).push(mx);
      });
    }
  }
  return { days, z: out.map((o, zi) => { const p = o.pk.map((x) => x[0]).sort((a, b) => a - b), m = p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0;
    return { ...ZONESEG[zi], perDay: o.n / Math.max(1, days), cross: o.cross / Math.max(1, days), mean: m, p90: p.length ? p[Math.floor(p.length * .9)] : 0, low: p.length ? p.filter((v) => v < 10).length / p.length : 0, full: o.pk.length ? o.pk.filter(([v, c]) => v >= c).length / o.pk.length : 0, util: o.pk.length ? o.pk.reduce((a, [v, c]) => a + v / c, 0) / o.pk.length : 0, byH: o.byH }; }) };
}
function renderZones() {
  const yr = String(DATA.agg.years[VZ.y].source.slice(0, 4)), R = zoneStats(yr, ZN.off, ZN.d), Z = ZN.d ? R.z.slice().reverse() : R.z, pct = (v) => Math.round(v * 100) + '%';
  $('#znSrc').textContent = `${yr} 年${ZN.off ? '休息日' : '平日'} ${R.days} 天 · ${ZN.d ? '往台中' : '往日月潭／埔里'}`;
  // 示意圖：寬度＝路段長度（延駛段放大顯示），高度＝每日過點人次
  const svg = $('#znMap'), [, , W] = fitBox(svg), x0 = 8, w = (W - 16) / Z.length, mxc = Math.max(...Z.map((z) => z.cross), 1), base = 108;
  svg.setAttribute('viewBox', `0 0 ${W} ${svg.dataset.h0}`); let h = '';
  Z.forEach((z, i) => { const x = x0 + w * i, bh = 62 * z.cross / mxc, col = z.util >= .5 ? 'var(--accent)' : z.util >= .3 ? 'var(--route-b)' : 'var(--muted)';
    h += `<g><rect x="${(x + 4).toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${(w - 8).toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="3" fill="${col}" opacity=".85"><title>${z.nm} ${z.sub}：每日過點 ${Math.round(z.cross)} 人次</title></rect>`;
    h += `<text x="${(x + w / 2).toFixed(1)}" y="${(base - bh - 5).toFixed(1)}" text-anchor="middle" style="font:500 11px var(--mono);fill:var(--strong)">${Math.round(z.cross).toLocaleString()}</text>`;
    h += `<text x="${(x + w / 2).toFixed(1)}" y="${base + 15}" text-anchor="middle" class="lbl" style="fill:var(--strong)">${z.nm} · ${z.km.toFixed(0)} km</text><text x="${(x + w / 2).toFixed(1)}" y="${base + 28}" text-anchor="middle" class="lbl">${z.sub}</text><text x="${(x + w / 2).toFixed(1)}" y="${base + 41}" text-anchor="middle">利用 ${pct(z.util)}</text></g>`;
    if (i) h += `<line x1="${x}" x2="${x}" y1="36" y2="${base}" stroke="var(--rule)"/>`; });
  h += `<line x1="${x0}" x2="${W - 8}" y1="${base}" y2="${base}" stroke="var(--strong)" stroke-width="1.5"/><text x="${x0}" y="12" class="lbl">柱高＝每日過點人次；顏色＝平均利用率（藍 ≥50%、綠 30–50%、灰 &lt;30%）</text>`;
  svg.innerHTML = h;
  $('#znTbl').innerHTML = `<tr><th>分區</th><th>長度</th><th>每日班次</th><th>每日過點人次</th><th>每班平均最大</th><th>P90</th><th>&lt;10 人</th><th>坐滿</th><th>平均利用率</th></tr>` +
    Z.map((z) => `<tr><td style="font-family:inherit">${z.nm}<br><small style="color:var(--muted)">${z.sub}</small></td><td>${z.km.toFixed(0)} km</td><td>${z.perDay.toFixed(1)}</td><td>${Math.round(z.cross).toLocaleString()}</td><td>${z.mean.toFixed(1)}</td><td>${z.p90}</td><td>${pct(z.low)}</td><td>${(z.full * 100).toFixed(1)}%</td><td>${pct(z.util)}</td></tr>`).join('');
  const [c, f, m, e] = R.z;
  $('#znCall').innerHTML = `國道段（高鐵–埔里）每日過點 <b>${Math.round(f.cross).toLocaleString()}</b> 人次，是全線瓶頸，平均利用率 ${pct(f.util)}；過了埔里，山區段只剩 <b>${Math.round(m.cross).toLocaleString()}</b>（${pct(m.cross / Math.max(1, f.cross))}），卻有 ${m.perDay.toFixed(0)} 班要開進山區，${pct(m.low)} 的班次在山區段不到 10 人。市區段每日 ${Math.round(c.cross)} 人次、利用率 ${pct(c.util)}，${pct(c.low)} 的班次在市區段不到 10 人；延駛段每天約 ${e.perDay.toFixed(1)} 班、${Math.round(e.cross)} 人次。`;
  const hrs = []; for (let hh = 6; hh <= 21; hh++) hrs.push(hh);
  heatmap($('#znHeat'), { rows: Z.map((z) => hrs.map((hh) => { const a = z.byH[hh] || []; return a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0; })), rowLabels: Z.map((z) => z.nm), colLabels: hrs.map((hh) => hh % 2 === 0 ? hh : ''), color: ZN.d ? C('--accent2') : C('--accent') });
}
function renderDwell() {
  const C0 = DATA.chain; if (!C0) return; const Y = C0.years[VZ.y], off = ZN.off, Z = Y.zones.filter((z) => z.off === off).sort((a, b) => b.n - a.n);
  $('#dwSrc').textContent = `${Y.source.slice(0, 4)} 年${off ? '休息日' : '平日'} · ${Y.pairs.toLocaleString()} 組去回程（全年）`;
  const h = (v) => { const hh = Math.floor(v), mm = Math.round((v - hh) * 60); return `${hh}:${pad2(mm)}`; };
  $('#dwTbl').innerHTML = `<tr><th>目的地</th><th>樣本</th><th>停留 P25</th><th>中位</th><th>P75</th><th>P90</th></tr>` + Z.map((z) => `<tr><td style="font-family:inherit">${z.zone}</td><td>${z.n.toLocaleString()}</td><td>${h(z.p25)}</td><td><b>${h(z.p50)}</b></td><td>${h(z.p75)}</td><td>${h(z.p90)}</td></tr>`).join('');
  const sm = Z.find((z) => z.zone === '日月潭'); if (!sm) return; const hrs = []; for (let i = 6; i <= 21; i++) hrs.push(i);
  lineChart($('#dwHour'), { series: [{ y: sm.arr_hour.slice(6, 22), color: C('--accent'), w: 1.8, dots: true }, { y: sm.ret_hour.slice(6, 22), color: C('--accent2'), w: 1.8, dots: true }], xLabels: hrs.map((x) => x % 3 === 0 ? x : '') });
}
function renderVZ() {
  const Y = DATA.agg.years[VZ.y];
  renderZones(); renderDwell();
  const M = Object.fromEntries(ZONES.map((o) => [o, Object.fromEntries(ZONES.map((d) => [d, 0]))]));
  for (const r of Y.od) { const o = BILL2Z[r.o], d = BILL2Z[r.d]; if (o && d) M[o][d] += r.n; }
  const zs = ZONES, svg = $('#vzOD'), [, , W, H] = fitBox(svg), l = 70, t = 22, cw = (W - l - 4) / zs.length, ch = (H - t - 4) / zs.length, mx = Math.max(...zs.flatMap((o) => zs.map((d) => M[o][d])));
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
  $('#vzTbl').innerHTML = `<tr><th>起訖</th><th>筆數</th><th>中位時間</th><th>P85</th><th>票價</th></tr>` + top.map((r) => `<tr><td style="font-family:inherit">${r.o}→${r.d}</td><td>${nfmt(r.n)}</td><td>${r.tt_med ?? '—'}′</td><td>${r.tt_p85 ?? '—'}′</td><td>${r.fare ?? '—'}</td></tr>`).join('');
  const all = SERIES.map((r) => r.v[0] + r.v[1]); const ma = all.map((_, i) => { const a = all.slice(Math.max(0, i - 6), i + 1); return a.reduce((p, q) => p + q, 0) / a.length; });
  lineChart($('#vzDaily'), { series: [{ y: all, color: C('--rule'), w: .8 }, { y: ma, color: C('--strong'), w: 1.4 }], xLabels: SERIES.map((r, i) => r.date.endsWith('-01') && ['01', '04', '07', '10'].includes(r.date.slice(5, 7)) ? r.date.slice(2, 7) : '') });
  const tk = Y.ticket_prefix.slice(0, 10);
  hbars($('#vzTk'), { items: tk.map((x) => ({ label: x.code, v: [x.n] })), colors: [C('--strong')], labelW: 80 });
  const hst = Y.trip_peak_hist;
  barChart($('#vzHist'), { groups: [hst], xLabels: ['0–4', '5–9', '10–19', '20–29', '30–42', '43–59', '60+'], colors: [C('--accent')] });
  $('#vzNote').textContent = `${Y.source}：${Y.rows.toLocaleString()} 筆刷卡；推估車次 ${Y.n_trips.toLocaleString()}。${DATA.agg.method_notes.join(' ')} ${DATA.agg.privacy}。票種欄位只取前 4 字分組。`;
}

/* ============================================================
   05 班次最佳化
   ============================================================ */
const OV = { y: '2025', off: 1, d: 0 };
const CREWOPT = DATA.crewopt || {};
const money = (v) => '$' + Math.round(v).toLocaleString();
function renderOPT() {
  const R = tripCells(OV.y, OV.off), cells = R.cells.filter((c) => c.dir === OV.d), dn = OV.d ? '往台中' : '往日月潭／埔里', cls = OV.off ? '假日' : '平日';
  $('#ovKpi').innerHTML = kpiHtml([['天數', `${R.days}<small>天</small>`], ['每日車次', `${(R.trips / Math.max(1, R.days)).toFixed(1)}<small>班</small>`], ['每班票收', `${money(R.rev / Math.max(1, R.trips))}`],
    ['最大在車 <10 人', `${Math.round(R.low / R.trips * 100)}<small>%</small>`, R.low / R.trips > .3 ? 'bad' : ''], ['最大在車 >43 人', `${(R.over / R.trips * 100).toFixed(1)}<small>%</small>`, R.over ? 'bad' : ''], ['期間刷卡票收', `${nfmt(R.rev)}<small>元</small>`]]);
  const hrs = []; for (let h = 5; h <= 22; h++) hrs.push(h);
  const g = [[], [], [], []];
  for (const h of hrs) { const L = cells.filter((c) => c.h === h).flatMap((c) => c.pk); const k = (f) => L.filter(f).length / R.days; g[0].push(k((v) => v < 10)); g[1].push(k((v) => v >= 10 && v < 30)); g[2].push(k((v) => v >= 30 && v <= CAP)); g[3].push(k((v) => v > CAP)); }
  stackBars($('#ovBars'), { groups: g, xLabels: hrs.map((h) => h % 2 === 0 ? h : ''), colors: [C('--rule'), C('--muted'), C('--accent'), C('--lit')] });
  const tot = g.flat().reduce((a, b) => a + b, 0), lowSum = g[0].reduce((a, b) => a + b, 0), lowPk = hrs.map((h, i) => [h, g[0][i]]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter((x) => x[1] > .3);
  $('#ovCall').innerHTML = `${OV.y} 年${cls}${dn}：平均每天 <b>${tot.toFixed(1)}</b> 班，其中 <b>${lowSum.toFixed(1)}</b> 班（${Math.round(lowSum / tot * 100)}%）全程最多不到 10 人${lowPk.length ? `，集中在 ${lowPk.map((x) => x[0] + ' 時').join('、')}` : ''}。超過 43 人的每天約 ${g[3].reduce((a, b) => a + b, 0).toFixed(2)} 班（${(R.over / R.trips * 100).toFixed(2)}%，兩方向合計）。`;
  const row = (c) => `<td style="font-family:inherit">${pad2(c.h)} 時</td><td>${c.code}</td><td>${c.perDay.toFixed(1)}</td><td>${c.mean.toFixed(1)}</td><td>${c.p90}</td>`;
  const low = cells.filter((c) => c.perDay >= .5 && c.low / c.n >= .5).sort((a, b) => b.low / b.n - a.low / a.n || b.perDay - a.perDay).slice(0, 10);
  $('#ovLow').innerHTML = `<tr><th>發車</th><th>子線</th><th>每日班數</th><th>平均最大在車</th><th>P90</th><th>&lt;10 人比例</th><th>每班票收</th></tr>` + (low.map((c) => `<tr>${row(c)}<td>${Math.round(c.low / c.n * 100)}%</td><td>${money(c.rev / c.n)}</td></tr>`).join('') || '<tr><td colspan="7">無</td></tr>');
  const high = cells.filter((c) => c.perDay >= .3 && (c.over / c.n >= .03 || c.p90 >= 40)).sort((a, b) => b.over / b.n - a.over / a.n || b.p90 - a.p90).slice(0, 10);
  $('#ovHigh').innerHTML = `<tr><th>發車</th><th>子線</th><th>每日班數</th><th>平均最大在車</th><th>P90</th><th>&gt;43 人比例</th><th>天數</th></tr>` + (high.map((c) => `<tr>${row(c)}<td>${(c.over / c.n * 100).toFixed(1)}%</td><td>${c.n}</td></tr>`).join('') || '<tr><td colspan="7">無</td></tr>');
  // 班距
  const S = [['高鐵臺中站', 0, '--accent', '高鐵站→南投'], ['臺中', 0, '--route-b', '台中→南投'], ['埔里站', 1, '--route-h', '埔里→台中'], ['日月潭', 1, '--accent2', '日月潭→台中']];
  $('#obsWLeg').innerHTML = S.map((x) => `<span><i class="sl" style="background:var(${x[2]})"></i>${x[3]}（2025 ${cls}）</span>`).join('');
  const hw = []; for (let h = 6; h <= 21; h++) hw.push(h);
  lineChart($('#obsW'), { series: S.map(([st, dr, c]) => ({ y: obsWait(st, dr, OV.off).slice(6, 22).map((v) => v == null ? NaN : v), color: C(c) })), xLabels: hw.map((h) => h % 3 === 0 ? h : '') });
  { const f = fullAtPuli(OV.y, OV.off), top = f.hrs.map((v, h) => [h, v]).sort((a, b) => b[1] - a[1]).filter((x) => x[1]).slice(0, 3);
    $('#ovCall').insertAdjacentHTML('beforeend', `<br><b>滿載過站指標</b>：${OV.y} 年${OV.off ? '休息日' : '平日'}往台中、離開埔里站時已坐滿（≥43）的有 <b>${f.full}</b> 班（${(f.full / Math.max(1, f.n) * 100).toFixed(1)}%）${top.length ? '，集中在 ' + top.map((x) => x[0] + ' 時').join('、') : ''}；這些班次經過崎下、牛耳時，站上旅客很可能上不了車（資料只記錄上車者，被拒載的人看不到）。`); }
  renderDuty(); renderDayCost();
}
// 滿載過站指標：往台中、離開埔里站時票證在車量已達 43 → 之後崎下、牛耳等站的旅客很可能上不了車（資料看不到被拒載的人，這是間接指標）
function fullAtPuli(year, off) {
  const ip = RSTA.indexOf('埔里站'), hrs = Array(24).fill(0); let n = 0, full = 0;
  for (const d of RDAYS) { if (!d.startsWith(year) || RP.days[d].off !== off) continue;
    for (const [dr, , , , seq] of RP.days[d].trips) { if (dr !== 1) continue; let L = 0; for (const [si, t, b, a] of seq) { L += b - a; if (si === ip) { n++; if (L >= CAP) { full++; hrs[Math.floor(t / 60)]++; } break; } } } }
  return { n, full, hrs };
}
function renderDuty() {
  const o = DH.drivers[OV.y], pct = (v) => Math.round(v * 100) + '%', ds = SIM().drivers(), sp = ds.map((d) => d.span).sort((a, b) => a - b);
  $('#ovDuty').innerHTML = `<div style="overflow-x:auto"><table class="tbl"><tr><th>指標</th><th>${OV.y} 全年</th><th>${LIVE.date}</th></tr>
    <tr><td style="font-family:inherit">出勤司機（人／日）</td><td>平日 ${o.per_day_wd}・假日 ${o.per_day_off}</td><td>${ds.length}</td></tr>
    <tr><td style="font-family:inherit">值勤時間中位（時）</td><td>${o.span_med}</td><td>${sp.length ? sp[sp.length >> 1].toFixed(1) : '—'}</td></tr>
    <tr><td style="font-family:inherit">值勤 >10 小時</td><td>${pct(o.share_span_gt10)}</td><td>${ds.filter((d) => d.span > 10).length} 人</td></tr>
    <tr><td style="font-family:inherit">值勤 >12 小時</td><td>${pct(o.share_span_gt12)}</td><td>${ds.filter((d) => d.span > 12).length} 人</td></tr>
    <tr><td style="font-family:inherit">連續駕駛 >4 小時（休息 <30 分不重置）</td><td>${pct(o.share_cont_gt4)}</td><td>—</td></tr>
    <tr><td style="font-family:inherit">一天開超過一台車</td><td>${pct(o.share_multi_bus)}</td><td>${ds.filter((d) => d.buses > 1).length} 人</td></tr></table></div>
    <p class="note" style="margin-top:6px">值勤時間＝該司機當天第一筆上車刷卡到最後一筆下車刷卡，不含出入場與整備，所以實際值勤會更長。</p>`;
}
function renderDayCost() {
  const s = SIM();
  $('#costNote').innerHTML = `柴油價預設＝經濟部能源署全國超級柴油週均價 ${FUEL.diesel} 元/公升（${FUEL.week}，零售含稅，業者實際購價通常較低）。月薪預設取南投客運徵才區間 40,000–65,000 元的中段；超過 8 小時依勞基法 §24，時薪基準＝月薪 ÷ 240，前 2 小時 ×1.34、之後 ×1.67。`;
  const L = s.trips.slice().sort((a, b) => a.rev - b.rev).slice(0, 8);
  $('#ovTrips').innerHTML = `<tr><th>發車</th><th>車</th><th>子線</th><th>方向</th><th>上車</th><th>最大在車</th><th>票收</th><th>車公里</th></tr>` + L.map((t) => `<tr><td>${fmt(t.dep)}</td><td>${t.bus}</td><td>${t.code}</td><td style="font-family:inherit">${dirTxt(t)}</td><td>${t.board}</td><td>${t.peak}</td><td>${money(t.rev)}</td><td>${DUR_KM(t).toFixed(0)}</td></tr>`).join('');
  renderOptDay();
}
function renderOptContext() {
  const e = DATA.optref;
  const mode = DHM.mode === 'p85' ? '票證區間時間代理 P85' : DHM.mode === 'p50' ? '票證區間時間代理中位數' : '固定 45 km/h＋5 分';
  const text = `本次計算：${LIVE.date}，6670 全部子線；空車調度＝${mode}；司機${CREW.sw ? '允許端點換車' : '不換車（同車片段優先）'}；每日駕車 ${RULE.drive} 時、連續 ${RULE.cont} 時、休息 ${RULE.rest} 分、值勤跨度 ${RULE.span} 時、折返 ${RULE.turn} 分；需求 +${SCN.growth}%、改搭 ±${SCN.shift} 分、併班容量上限 ${Math.round(SCN.lf*100)}%、假設容量 ${CAP} 人；15–18 時延誤測試 ${DELAY.min} 分。`;
  $('#optContext').textContent = text + ` 成本參數：柴油 ${COST.dieselP} 元/L（來源週 ${FUEL.week}）、油耗 ${COST.lpk} L/km、保修 ${COST.maint} 元/km、月薪 ${COST.sal} 元、雇主負擔 ${Math.round(COST.emp*100)}%、每月出勤 ${COST.days} 天、每車固定 ${COST.bus} 元/日、加班費${COST.ot === 'add' ? '另計 1.34／1.67' : '含於月薪'}。整備前 ${RULE.signOn}／後 ${RULE.signOff} 分只納入薪資試算，不納入值勤門檻。`;
  if (!e) return;
  const d=e.results.find(r=>r.mode==='p85');
  $('#optReference').textContent = `文件基準 ${e.version}，核對日 ${e.verified_on}；營運日 ${e.service_date}、全部子線、P85、不換車、需求 +0%、改搭 ±0 分、每日駕車10／連續4／值勤12時、休息30／折返10分。固定 ${d.base.trips} 個推估車次：${d.base.buses} 車／${d.base.drivers} 位司機 → ${d.replanned.buses} 車／${d.replanned.drivers} 位司機；超出設定門檻 ${d.base.threshold_exceedances} → ${d.replanned.threshold_exceedances}。結果僅適用上述參數；0不代表法律合規。`;
}
let OPTR = null;
function renderOptDay() {
  const R = OPTR = optimizeDay(LIVE.date), { base: A, re: M, opt: B } = R, scn = SCN.growth > 0 || SCN.shift > 0;
  $('#optSrc').textContent = rpLabel(LIVE.date);
  renderOptContext();
  { const q = RP.days[LIVE.date].qc || [0, 0, 0, 0]; $('#optQc').innerHTML = `<small>資料檢查（${LIVE.date}）：旅次時間 ≤0 或 >4 小時 <b>${q[0]}</b> 筆未計入在車量；同站上下車 <b>${q[1]}</b> 筆（上下相抵）；缺車號 <b>${q[2]}</b> 筆；與同車大車次時間重疊的小片段 <b>${q[3] || 0}</b> 段已併入。車次切分＝同車同方向，車上票證乘客全部下車 30 分鐘後才算下一班。</small>`; }
  const nBad = (x) => x.duties.filter((d) => d.bad).length, gt10 = (x) => x.duties.filter((d) => d.span > 10).length, mx = (x) => Math.max(...x.duties.map((d) => d.span));
  const i0 = (v) => Math.round(v).toLocaleString(), f1 = (v) => v.toFixed(1);
  const cols = scn ? [A, M, B] : [A, M], hd = scn ? ['實際（資料）', '只重排', '情境＋重排（含假設）'] : ['實際（資料）', '最佳化重排'];
  const row = (nm, tag, f, fx, better) => { const v = cols.map(f), last = v.at(-1), d = last - v[0], cls = Math.abs(d) < 1e-9 ? '' : (better === 'lo' ? d < 0 : d > 0) ? 'dn' : 'up';
    return `<tr><td style="font-family:inherit">${nm}${tag}</td>${v.map((x) => `<td>${x == null || Number.isNaN(x) ? '—' : fx(x)}</td>`).join('')}<td class="${cls}">${Number.isNaN(d) ? '—' : (d >= 0 ? '+' : '') + fx(d)}</td></tr>`; };
  const D = '<em class="tagD">資料</em>', Lg = '<em class="tagL">設定門檻</em>', E = '<em class="tagE">外部</em>', As = '<em class="tagA">假設</em>', Al = '<em class="tagL">演算法</em>';
  $('#optTbl').innerHTML = `<tr><th>指標</th>${hd.map((h) => `<th>${h}</th>`).join('')}<th>差異</th></tr>` +
    row('車次', D, (x) => x.T.length, i0, 'lo') + row('刷卡上車', D, (x) => x.T.reduce((a, t) => a + t.board, 0), i0, 'hi') +
    row('出車數', Al, (x) => x.buses, i0, 'lo') + row('司機人數', Al, (x) => x.duties.length, i0, 'lo') +
    row('超出設定門檻的值勤', Lg, nBad, i0, 'lo') + row('值勤 >10 小時', D, gt10, i0, 'lo') + row('最長值勤（時）', D, mx, f1, 'lo') +
    row('載客車公里', As, (x) => x.km, i0, 'lo') + row('空車調度車公里', '<em class="tagA">距離推估</em>', (x) => x.dhKm == null ? NaN : x.dhKm, i0, 'lo') +
    row('燃料＋保修（元）', E, (x) => x.cost.fuel + x.cost.mt, i0, 'lo') + row('司機薪資（元）', E, (x) => x.cost.drv, i0, 'lo') + row('車輛固定（元）', As, (x) => x.cost.fix, i0, 'lo') +
    row(`延誤 ${DELAY.min} 分測試：連鎖晚發班次`, '<em class="tagA">情境</em>', (x) => x.cas.affected, i0, 'lo') + row('連鎖晚發總分鐘', '<em class="tagA">情境</em>', (x) => x.cas.lateSum, i0, 'lo') +
    row('<b>每日成本</b>', '', (x) => x.cost.total, i0, 'lo') + row('<b>刷卡實扣</b>', D, (x) => x.rev, i0, 'hi') + row('<b>實扣減試算成本（非損益）</b>', '', (x) => x.rev - x.cost.total, i0, 'hi');
  const bad = A.duties.filter((d) => d.bad), why = (d) => [d.span > RULE.span && '工時', d.drive > RULE.drive && '駕車', d.maxCont > RULE.cont && '連續駕車'].filter(Boolean);
  const cnt = (k) => bad.filter((d) => why(d).includes(k)).length;
  const LB = driverLB(scn ? B.T : M.T), got = (scn ? B : M).duties.length;
  $('#optCall').innerHTML = `票證基準：${A.buses} 台車、${A.duties.length} 位司機，其中 <b>${bad.length}</b> 位的值勤超出設定門檻（工時 ${cnt('工時')}、每日駕車 ${cnt('駕車')}、連續駕車 ${cnt('連續駕車')}；值勤時間由切班規則推估，需業者核對）。` +
    `<br>不改任何車次、只重排：需要 <b>${M.buses}</b> 台車、<b>${M.duties.length}</b> 位司機，尚有 ${nBad(M)} 段值勤超出設定門檻；試算成本 ${money(M.cost.total)}（${M.cost.total <= A.cost.total ? '少' : '多'} ${money(Math.abs(M.cost.total - A.cost.total))}）。` +
    `<br>司機人數理論下限 <b>${LB.lb}</b> 位（取大者：同一時刻最多 ${LB.conc} 班在路上；總駕駛時數 ÷ 每日駕車上限 ${RULE.drive} 小時＝${LB.byDrive} 位），演算法排出 ${got} 位（${(scn ? B : M).duties.method}）。${CREWOPT[LIVE.date] && CREW.sw && !scn && RULE.span === 12 && RULE.drive === 10 && RULE.cont === 4 && RULE.rest === 30 && RULE.turn === 10 ? ` 以 CP-SAT 整數規劃離線求得的精確最佳（可換車、預設設定門檻）為 <b>${CREWOPT[LIVE.date][0]}</b> 位。` : ''}` + `<br>延誤 ${DELAY.min} 分測試：票證基準串接連鎖晚發 ${A.cas.affected} 班、重排後 ${M.cas.affected} 班${M.cas.affected > A.cas.affected ? '——省下的車輛是用緩衝換來的，可調高「端點最短折返」找平衡點' : ''}。` + (scn ? `<br>情境（${SCN.growth ? '運量 +' + SCN.growth + '%' : ''}${SCN.growth && SCN.shift ? '、' : ''}${SCN.shift ? '改搭 ±' + SCN.shift + ' 分' : ''}）：加開 ${B.added.length} 班、併掉 ${B.merged.length} 班，需要 ${B.buses} 台車、${B.duties.length} 位司機。` : '');
  // 值勤分布
  const H = Array(16).fill(0), G = Array(16).fill(0); for (const d of A.duties) H[Math.min(15, Math.floor(d.span))]++; for (const d of (scn ? B : M).duties) G[Math.min(15, Math.floor(d.span))]++;
  barChart($('#optSpan'), { groups: [H, G], xLabels: H.map((_, i) => i % 2 === 0 ? i + (i === 14 ? '+' : '') : ''), colors: [C('--muted'), C('--accent')] });
  { const svg = $('#optSpan'), m = { l: 30, r: 6 }, bw = (400 - m.l - m.r) / 16, x = m.l + bw * RULE.span; svg.insertAdjacentHTML('beforeend', `<line x1="${x}" x2="${x}" y1="8" y2="132" stroke="var(--lit)" stroke-dasharray="3 2"/><text x="${x + 3}" y="16" style="fill:var(--lit)">${RULE.span} 時</text>`); }
  { const m = matchTimetable(LIVE.date);
    $('#ttMatch').innerHTML = !m ? `<p class="note">官網主表自 ${DATA.tt.effective_from} 實施，此日期之前無法比對。</p>` :
      `<div class="callout">官網快照參考 <b>${m.sched}</b> 班，在容差規則下匹配到 <b>${m.matched}</b> 班；<b>${m.miss.length}</b> 班未匹配到票證推估車次（原因未確認）；另有 <b>${m.extra.length}</b> 個推估車次未匹配（原因未確認）。比對規則：同方向、任一共同停靠區的時刻相差 ≤ ${MATCH_TOL} 分。</div>` +
      (m.miss.length ? `<div style="overflow-x:auto"><table class="tbl"><tr><th>表定發車</th><th>子線</th><th>方向</th><th>起訖</th></tr>${m.miss.slice(0, 12).map((t) => `<tr><td>${fmt(t.dep)}</td><td>${t.code}</td><td style="font-family:inherit">${t.dir ? '往台中' : '往潭／埔里'}</td><td style="font-family:inherit">${ZNAME[t.startZ]}→${ZNAME[t.endZ]}</td></tr>`).join('')}</table></div>` : ''); }
  $('#optAlgo').innerHTML = `<div><b>1. 最少車輛：最小路徑覆蓋（二分圖最大匹配）</b><br>把當天每一班當成一個點；若 A 班到站後，加上折返 ${RULE.turn} 分與空車調度時間（${DHM.mode === 'fixed' ? '固定 45 km/h 推估' : '兩年刷卡實測行車時間，依出發小時取 ' + (DHM.mode === 'p85' ? 'P85' : '中位數')}）仍趕得上 B 班，就連一條邊。最大匹配數 M 對應最少車輛＝車次數 − M，僅對給定銜接圖成立。先只用不需空車調度的銜接求匹配，再放寬，讓空車公里盡量少（空車公里不保證最少）。</div>
    <div><b>2. 司機排班：先切再接（啟發式）</b><br>司機跟車，在端點把車輛串接切成未超出設定門檻「工時 ${RULE.span}、駕車 ${RULE.drive}、連續 ${RULE.cont} 小時須休 ${RULE.rest} 分」的片段；再把同端點、休息夠長的片段接給同一人。不保證最少人數；正式排班可改用集合覆蓋整數規劃（set covering）。</div>
    <div><b>3. 併班（貪婪）</b><br>從載客最少的班開始，找 ±${SCN.shift || 'N'} 分鐘內、同方向、涵蓋其起訖、合併後不超過 ${Math.round(SCN.lf * 100)}% 座位的班次併入。旅客改搭是假設，資料只告訴我們他們實際搭了哪一班。</div>
    <div><b>4. 運量外推與加班車</b><br>每班載客 ×(1＋外推%)，超過 43 人就在同一時刻加開一班，再交給 1、2 重排。</div>`;
  const mg = scn ? B.merged.slice(0, 10) : [], ad = scn ? B.added.slice(0, 10) : [];
  $('#optChanges').innerHTML = (mg.length ? `<h2>併班清單（前 10）</h2><div style="overflow-x:auto"><table class="tbl"><tr><th>被併班次</th><th>併入</th><th>方向</th><th>受影響人數</th><th>時間差</th></tr>${mg.map((m) => `<tr><td>${fmt(m.a.dep)} ${m.a.code}</td><td>${fmt(m.b.dep)} ${m.b.code}</td><td style="font-family:inherit">${dirTxt(m.a)}</td><td>${Math.round(m.a.board)}</td><td>${m.dt >= 0 ? '+' : ''}${Math.round(m.dt)} 分</td></tr>`).join('')}</table></div>` : '') +
    (ad.length ? `<h2>加班車（前 10）</h2><div style="overflow-x:auto"><table class="tbl"><tr><th>時刻</th><th>子線</th><th>方向</th><th>外推後每班人數</th></tr>${ad.map((t) => `<tr><td>${fmt(t.dep)}</td><td>${t.code}</td><td style="font-family:inherit">${dirTxt(t)}</td><td>${Math.round(t.peak)}</td></tr>`).join('')}</table></div>` : '');
}
function stackBars(svg, { groups, xLabels, colors }) {
  const [, , W, H] = fitBox(svg), m = { l: 30, r: 6, t: 8, b: 18 }, n = groups[0].length;
  const tot = groups[0].map((_, i) => groups.reduce((a, g) => a + g[i], 0)), yMax = niceMax(Math.max(...tot)), bw = (W - m.l - m.r) / n, Y = (v) => (H - m.t - m.b) * v / yMax;
  let s = frame(svg, W, H, m, yMax, 4, xLabels, (i) => m.l + bw * (i + .5));
  for (let i = 0; i < n; i++) { let y = H - m.b; groups.forEach((g, j) => { const h = Y(g[i]); if (h > .2) s += `<rect x="${(m.l + bw * i + 1.5).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[j]}"><title>${xLabels[i] || ''}：${g[i].toFixed(1)} 班/日</title></rect>`; y -= h; }); }
  svg.innerHTML = s;
}

/* ============================================================
   06 小幫手（規則式；只用頁面上的資料）
   ============================================================ */
const BOT = { mode: 'pax' };
const ZKEY = [[/高鐵/, 'HSR'], [/干城|台中車站|臺中車站|火車站|台中市|臺中市|台中(?!.*高鐵)/, 'TC'], [/埔里/, 'PULI'], [/暨大|暨南/, 'JNU'], [/魚池/, 'YC'], [/九族/, 'J9'], [/日月潭|水社|潭/, 'SML'], [/向山/, 'XS']];
function zonesIn(q) { const hits = []; for (const [re, z] of ZKEY) { const m = q.match(re); if (m && !hits.find((h) => h.z === z)) hits.push({ z, i: m.index }); } return hits.sort((a, b) => a.i - b.i).map((h) => h.z); }
function odStat(o, d) { let best = null; for (const r of Y25.od) if (BILL2Z[r.o] === o && BILL2Z[r.d] === d && (!best || r.n > best.n)) best = r; return best; }
function answer(q) {
  const s = SIM(), t = s.t, zs = zonesIn(q), busM = q.match(/B\s?(\d{1,2})|(\d{1,2})\s*號車/i), ops = BOT.mode === 'ops';
  const src = (x) => `\n<span class="why">依據：${x}</span>`, day = `${LIVE.date} 刷卡重播，現在 ${fmt(t)}`;
  if (busM) {
    const id = 'B' + pad2(+(busM[1] || busM[2])), b = s.buses.find((x) => x.id === id); if (!b) return `這天沒有 ${id} 這台車（共 ${s.buses.length} 台出車）。` + src(day);
    select(id); const tr = b.trip;
    if (tr) { const L = busLoc(b); return `${id} 正在跑 ${tr.code} ${dirTxt(tr)}，位於${ZNAME[L.prev]}到${L.next ? ZNAME[L.next] : '終點'}之間。\n車上 ${b.load} 人（刷卡上車減下車）。${L.nextE ? `\n下一站${ZNAME[L.next]}的第一筆刷卡在 ${fmt(L.nextE.t)}。` : ''}\n右上角平面圖已標出位置。` + src(day); }
    const nx = b.plan[b.k]; return `${id} 目前${STATE_ZH[b.state][0]}${b.state !== 'off' ? '，在' + ZNAME[b.term] : ''}。${nx ? `\n下一班 ${fmt(nx.dep)} ${nx.code} ${dirTxt(nx)}。` : '\n當天已收班。'}` + src(day);
  }
  if (/延誤|誤點|塞車|晚到|遲到|延遲|gps|GPS/.test(q)) return '刷卡資料沒有表定時刻比對，也沒有 GPS，所以無法判斷誤點。可以查的是每班各站的實際刷卡時刻，例如「B03 在哪」或「高鐵站下一班」。' + src('資料欄位：上下車時間、站、子線、車號、司機、金額');
  if (/多久|多長|要多少時間|車程|幾分鐘到/.test(q) || (/票價|多少錢|車資|價錢/.test(q))) {
    let [o, d] = zs.length >= 2 ? zs : zs.length === 1 ? (zs[0] === 'HSR' ? ['HSR', 'SML'] : ['HSR', zs[0]]) : ['HSR', 'SML'];
    const r = odStat(o, d); if (!r) return `找不到 ${ZNAME[o]}→${ZNAME[d]} 的刷卡紀錄。`;
    return `${ZNAME[o]} → ${ZNAME[d]}：\n· 中位車程 ${r.tt_med ?? '—'} 分，85% 的旅客在 ${r.tt_p85 ?? '—'} 分內到\n· 刷卡實扣中位數 ${r.fare ?? '—'} 元（依票種與優惠不同）` + src(`2025 年 ${r.n.toLocaleString()} 筆刷卡（${r.o}→${r.d}）`);
  }
  if (/幾人|多少人|排隊|候車|人多|在等/.test(q)) {
    const list = zs.length ? zs : ['HSR', 'TC', 'PULI', 'SML'];
    return '刷卡資料沒有候車人數，只記錄上車的人。各站近 30 分鐘刷卡上車：\n' + list.map((z) => `· ${ZNAME[z]}：${s.boardsRecent(z, 30)} 人`).join('\n') + src(day);
  }
  if (/擠|座位|位子|滿|空位|人潮/.test(q) && !/預測|明天/.test(q)) {
    if (ops || !zs.length) { const run = s.buses.filter((b) => b.state === 'run').sort((a, b) => b.load - a.load).slice(0, 4); return run.length ? '目前票證在車量最多的車：\n' + run.map((b) => `· ${b.id} ${b.trip.code} ${dirTxt(b.trip)}：${b.load}/${CAP}`).join('\n') + src(day + '；刷卡上車減下車') : '目前沒有行駛中的車。' + src(day); }
    const z = zs[0], dir = zs[1] ? (ZRANK[zs[1]] > ZRANK[z] ? 0 : 1) : (z === 'SML' || z === 'XS' ? 1 : 0), nx = s.nextDeps(z, dir, 2, zs[1]);
    if (!nx.length) return `這天${ZNAME[z]}在 ${fmt(t)} 之後沒有${dir ? '往台中' : '往日月潭'}的上車紀錄。` + src(day);
    const x = nx[0], ld = rpLoad(x.tr, x.t);
    return `${ZNAME[z]} ${fmt(x.t)} 那班（${x.tr.code}，${x.tr.bus}）：在此站有 ${x.e.b} 人刷卡上車，離站時車上 ${ld} 人，全程最多 ${x.tr.peak} 人。${nx[1] ? `\n下一班 ${fmt(nx[1].t)}。` : ''}` + src(day);
  }
  if (/預測|明天|後天|週末|周末|假日|連假/.test(q)) {
    const d0 = isoD(FCD); if (/後天/.test(q)) d0.setDate(d0.getDate() + 1);
    const ds = iso(d0), i = dayInfo(ds), a = forecast(ds, 0), b = forecast(ds, 1);
    return `${ds}（週${DOW_ZH[i.dow]}，${i.label}）模型預測刷卡上車：\n· 往日月潭／埔里 ${Math.round(a.mean)} 人（未校準參考帶 ${Math.round(a.lo)}–${Math.round(a.hi)}）\n· 往台中 ${Math.round(b.mean)} 人（${Math.round(b.lo)}–${Math.round(b.hi)}）\n這是迴歸預測，不是資料。` + src(`02 需求預測（回測 WAPE ${(FC.back.wapeM * 100).toFixed(1)}%）`);
  }
  if (/尖峰|離峰|幾點人|什麼時候人/.test(q)) {
    const i = s.info, a = hourShare(i, 0), b = hourShare(i, 1), top = (v) => v.map((x, h) => [h, x]).sort((p, q2) => q2[1] - p[1]).slice(0, 3).map((x) => x[0]).sort((p, q2) => p - q2);
    return `${i.off ? '假日' : '平日'}的尖峰：\n· 往日月潭／埔里：${top(a).map((h) => h + ' 時').join('、')}\n· 往台中：${top(b).map((h) => h + ' 時').join('、')}` + src('2025 年刷卡 星期 × 小時 分布');
  }
  if (/加開|加班|減班|併班|調度|建議|怎麼辦|處理|調整/.test(q)) {
    const R = tripCells('2025', s.info.off ? 1 : 0), hi = R.cells.filter((c) => c.perDay >= .3 && c.over > 0).sort((a, b) => b.over / b.n - a.over / a.n).slice(0, 3), lo = R.cells.filter((c) => c.perDay >= .5 && c.low / c.n >= .6).sort((a, b) => b.low / b.n - a.low / a.n).slice(0, 3);
    return `2025 年${s.info.off ? '假日' : '平日'}的票證推估車次：\n高載（超過 43 人的比例高）：\n` + (hi.map((c) => `· ${c.dir ? '往台中' : '往潭'} ${c.h} 時 ${c.code}：${(c.over / c.n * 100).toFixed(1)}% 的班次超過 43 人`).join('\n') || '· 無') + `\n低載（全程不到 10 人的比例高）：\n` + (lo.map((c) => `· ${c.dir ? '往台中' : '往潭'} ${c.h} 時 ${c.code}：${Math.round(c.low / c.n * 100)}% 的班次不到 10 人，每日 ${c.perDay.toFixed(1)} 班`).join('\n') || '· 無') + '\n詳見「05 班次最佳化」。' + src('刷卡還原車次的最大票證在車量');
  }
  if (/異常|告警|狀況|現況/.test(q)) { const al = liveAlerts(); return (al.length ? al.map((x) => `· ${x.txt}`).join('\n') : '目前沒有超載、大量上車或低載事件。') + src(day); }
  if (/下一班|幾點|班次|末班|最後一班|首班|第一班|什麼時候有車|發車/.test(q) || zs.length) {
    const z = zs[0] || 'HSR', dir = zs[1] ? (ZRANK[zs[1]] > ZRANK[z] ? 0 : 1) : (z === 'SML' || z === 'XS' ? 1 : 0), dest = zs[1], dn = dest ? '往' + ZNAME[dest] : dir ? '往台中' : '往日月潭／埔里';
    const all = s.trips.filter((tr) => tr.dir === dir && tr.ev.some((e) => e.z === z && e.b > 0) && (!dest || tr.ev.some((e) => e.z === dest))).map((tr) => ({ tr, t: tr.ev.find((e) => e.z === z && e.b > 0).t })).sort((a, b) => a.t - b.t);
    if (/末班|最後一班/.test(q)) { const L = all.at(-1); return L ? `這天${ZNAME[z]}${dn}最後一班有人上車的是 ${fmt(L.t)}（${L.tr.code}）。` + src(day) : '找不到班次。'; }
    if (/首班|第一班/.test(q)) { const L = all[0]; return L ? `這天${ZNAME[z]}${dn}第一班有人上車的是 ${fmt(L.t)}（${L.tr.code}）。` + src(day) : '找不到班次。'; }
    const nx = all.filter((x) => x.t >= t).slice(0, 3);
    if (!nx.length) return `這天${ZNAME[z]}在 ${fmt(t)} 之後沒有${dn}的上車紀錄。` + src(day);
    return `${ZNAME[z]}${dn}接下來（這天實際有人上車的班次）：\n` + nx.map((x) => `· ${fmt(x.t)} ${x.tr.code}（${x.tr.bus}）`).join('\n') + '\n只列有刷卡上車的班次；沒人上車的班次不在資料裡。' + src(day);
  }
  return BOT.mode === 'pax' ? '我可以回答：下一班車、末班車、某班車擠不擠、車程與票價、尖峰時段、人數預測。' : '我可以回答：目前事件、在車最多的車、某台車在哪（如「B05 在哪」）、高載與低載時段、尖峰時段。';
}
const CHIPS = {
  pax: ['高鐵站下一班去日月潭幾點？', '高鐵到日月潭的那班擠嗎？', '日月潭回高鐵要多久、多少錢？', '日月潭回台中末班幾點？', '假日尖峰是幾點？', '明天人會很多嗎？'],
  ops: ['我是第一次使用，請帶我導覽網站', '票證重播的車上人數怎麼來？', '班次最佳化用了什麼方法？', '現在有哪些事件？', '哪一班最擠？', '哪些時段需要加班或減班？', 'B03 現在在哪？', '有沒有誤點？', '現在高鐵站排隊幾人？'],
};
function setMode(m) { m = 'ops'; BOT.mode = m; for (const b of $('#botMode').children) b.setAttribute('aria-pressed', b.dataset.m === m); $('#botLead').textContent = m === 'pax' ? '給旅客：查班次、擠不擠、車程票價。回答只用選定營運日的刷卡重播與兩年刷卡統計。' : '給客服與調度：看超載與低載事件、單一車輛位置、高低載時段。資料沒有的（候車人數、誤點）會直接說沒有。'; $('#botChips').innerHTML = CHIPS[m].map((c) => `<button>${c}</button>`).join(''); }
/* Hosted ask() is installed by the integration module below. */
$('#botMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });
$('#botChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
const chatGuard = createChatInputGuard();
$('#askIn').addEventListener('compositionstart', () => chatGuard.start());
$('#askIn').addEventListener('compositionend', () => chatGuard.end());
$('#askIn').addEventListener('keydown', e => {
  if (chatGuard.shouldSend(e)) { e.preventDefault(); $('#askForm').requestSubmit(); }
});
$('#askForm').addEventListener('submit', (e) => {
  e.preventDefault(); if (chatGuard.blocked() || assistantBusy || !$('#askIn').value.trim()) return;
  ask($('#askIn').value); $('#askIn').value = '';
});
setMode('ops');

/* ============================================================
   分頁與控制
   ============================================================ */
let TAB = 'ops';
const PANELS = ['ops','fc','pk','viz','opt','bot'];
let workbenchActive = true;
function setTab(t) {
  if (!PANELS.includes(t)) return;
  TAB = t; for (const b of $('#tabs').children) b.setAttribute('aria-selected', b.dataset.t === t);
  for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== 'p-' + t;
  if (t === 'fc') renderFC(); if (t === 'pk') renderPK(); if (t === 'viz') renderVZ(); if (t === 'opt') renderOPT(); if (t === 'ops') refreshUI(true);
  try { localStorage.setItem('tx-tab', t); } catch (e) {}
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.t); });
const segPick = (el, attr, fn) => el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; for (const x of el.children) x.setAttribute('aria-pressed', x === b); fn(b.dataset[attr]); });
segPick($('#speed'), 's', (v) => LIVE.speed = +v);
segPick($('#pkYear'), 'y', (v) => { PK.y = +v; renderPK(); }); segPick($('#pkDir'), 'd', (v) => { PK.d = +v; renderPK(); });
segPick($('#vzYear'), 'y', (v) => { VZ.y = +v; renderVZ(); });
segPick($('#znOff'), 'o', (v) => { ZN.off = +v; renderZones(); renderDwell(); }); segPick($('#znDir'), 'd', (v) => { ZN.d = +v; renderZones(); });
$('#play').onclick = () => { LIVE.paused = !LIVE.paused; $('#play').textContent = LIVE.paused ? '播放' : '暫停'; };
$('#day').innerHTML = [...RDAYS].reverse().map((d) => `<option value="${d}">${rpLabel(d)}</option>`).join(''); $('#day').value = LIVE.date;
$('#day').onchange = () => { LIVE.date = $('#day').value; if ($('#optDay')) $('#optDay').value = LIVE.date; buildLive(SIM().t); if (TAB !== 'ops') setTab(TAB); };
const tgl = (el, fn) => el.onclick = () => { const on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', on); fn(on); };
tgl($('#theme'), (on) => { document.documentElement.dataset.theme = on ? 'dark' : 'light'; applyTheme(); });
segPick($('#ovYear'), 'y', (v) => { OV.y = v; renderOPT(); }); segPick($('#ovOff'), 'o', (v) => { OV.off = +v; renderOPT(); }); segPick($('#ovDir'), 'd', (v) => { OV.d = +v; renderOPT(); });
for (const [id, k, f] of [['cDiesel', 'dieselP', (v) => '$' + v.toFixed(2) + '/L'], ['cLpk', 'lpk', (v) => v.toFixed(2) + ' L/km'], ['cMaint', 'maint', (v) => '$' + v + '/km'], ['cSal', 'sal', (v) => money(v)], ['cEmp', 'emp', (v) => Math.round(v * 100) + '%'], ['cDays', 'days', (v) => v + ' 天'], ['cBus', 'bus', (v) => money(v)]]) {
  $('#' + id).oninput = (e) => { const v = +e.target.value; COST[k] = v; $('#' + id + 'Out').textContent = f(v); renderDayCost(); };
}
$('#cDiesel').value = COST.dieselP; $('#cDieselOut').textContent = '$' + COST.dieselP.toFixed(2) + '/L';
segPick($('#cOt'), 'o', (v) => { COST.ot = v; renderDayCost(); });
const dhNote = () => { const o = DHOBS['SML>HSR'], m = DHOBS['PULI>HSR']; const f = (r, h) => r && r[h] ? Math.round(r[h].p85) : '—'; $('#dhNote').innerHTML = `例：日月潭→高鐵 P85 行車時間 10 時 ${f(o, 10)} 分、16 時 ${f(o, 16)} 分；埔里→高鐵 10 時 ${f(m, 10)} 分、16 時 ${f(m, 16)} 分（兩年刷卡，各站第一筆刷卡時間差）。空車不停站，用實測載客車程是保守估計。`; };
segPick($('#dhMode'), 'm', (v) => { DHM.mode = v; renderOptDay(); }); dhNote();
segPick($('#crewSw'), 's', (v) => { CREW.sw = v === '1'; renderOptDay(); });
$('#sDelay').oninput = (e) => { DELAY.min = +e.target.value; $('#sDelayOut').textContent = DELAY.min + ' 分'; renderOptDay(); };
for (const [id, obj, k, f] of [['rDrive', RULE, 'drive', (v) => v + ' 時'], ['rCont', RULE, 'cont', (v) => v + ' 時'], ['rRest', RULE, 'rest', (v) => v + ' 分'], ['rSpan', RULE, 'span', (v) => v + ' 時'], ['rTurn', RULE, 'turn', (v) => v + ' 分'], ['sGrowth', SCN, 'growth', (v) => '+' + v + '%'], ['sShift', SCN, 'shift', (v) => v ? '±' + v + ' 分' : '不併班'], ['sLf', SCN, 'lf', (v) => Math.round(v * 100) + '%']]) {
  $('#' + id).oninput = (e) => { const v = +e.target.value; obj[k] = v; $('#' + id + 'Out').textContent = f(v); renderOptDay(); };
}
$('#optDay').innerHTML = $('#day').innerHTML; $('#optDay').value = LIVE.date;
$('#optDay').onchange = () => { $('#day').value = $('#optDay').value; $('#day').onchange(); };

function applyTheme() {
  for (const t of THEMED) { if (t.fn) t.fn(); else t.mat[t.prop].set(cssv(t.token)); }
  colorTerrain(); hemi.color.set(cssv('--sky')); hemi.groundColor.set(cssv('--gnd'));
  const dark = document.documentElement.dataset.theme === 'dark'; hemi.intensity = dark ? .55 : 1.35; sun.intensity = dark ? 1.4 : 2.3; figMat.color.setScalar(dark ? .55 : 1);
  if (TAB !== 'ops' && TAB !== 'bot') setTab(TAB); refreshUI(true);
}
function refreshUI(force) {
  measureLabels(); updateStrip();
  const s = SIM(); if (!s) return; const i = s.info;
  $('#clock').textContent = fmt(nowT());
  $('#meta').textContent = `${i.date} 週${DOW_ZH[i.dow]} · ${i.label} · ×${LIVE.speed}${LIVE.paused ? ' · 暫停' : ''}`;
  $('#dayType').textContent = `週${DOW_ZH[i.dow]}`;
  if (TAB === 'ops') { renderOps(); renderList(force); renderStops(force); }
  updateMini();
}

/* ============================================================
   左右分割：拖曳中間的分隔條調整寬度；點兩下在「窄（看 3D）」與「寬（看圖表）」之間切換
   ============================================================ */
{
  const app = document.querySelector('.app'), sp = $('#split');
  const clampW = (w) => clamp(w, 320, Math.max(320, innerWidth - 360));
  const setW = (w, save) => { w = clampW(w); app.style.setProperty('--side', w + 'px'); if (save) try { localStorage.setItem('tx-side', String(Math.round(w))); } catch (e) {} afterSplit(); };
  let raf = 0; function afterSplit() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { renderList.sig = ''; STOP_SIG = ''; refreshUI(true); if (TAB !== 'ops' && TAB !== 'bot') setTab(TAB); }); }
  try { const v = +localStorage.getItem('tx-side'); if (v) app.style.setProperty('--side', clampW(v) + 'px'); } catch (e) {}
  let drag = null;
  sp.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, w: $('aside.panel').getBoundingClientRect().width }; sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); app.classList.add('dragging'); });
  sp.addEventListener('pointermove', (e) => { if (drag) { app.style.setProperty('--side', clampW(drag.w - (e.clientX - drag.x)) + 'px'); } });
  const end = () => { if (!drag) return; drag = null; sp.classList.remove('drag'); app.classList.remove('dragging'); setW($('aside.panel').getBoundingClientRect().width, true); };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => { const w = $('aside.panel').getBoundingClientRect().width; setW(w < innerWidth * .45 ? innerWidth * .6 : 440, true); });
  sp.addEventListener('keydown', (e) => { const w = $('aside.panel').getBoundingClientRect().width; if (e.key === 'ArrowLeft') setW(w + 40, true); if (e.key === 'ArrowRight') setW(w - 40, true); });
  addEventListener('resize', () => { const w = $('aside.panel').getBoundingClientRect().width; if (w > clampW(w)) setW(w, false); });
}

/* ============================================================
   主迴圈
   ============================================================ */
let homeFit = false;
function resize() {
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  if (!homeFit && r.width) { homeFit = true; const k = camera.aspect < 1.25 ? 1.25 / camera.aspect : 1; HOME.p.sub(HOME.t).multiplyScalar(k).add(HOME.t); camera.position.copy(HOME.p); }
}
new ResizeObserver(resize).observe(host); resize();
buildLive(390);
try { const t = localStorage.getItem('tx-tab'); if (t && t !== 'ops') setTab(t); } catch (e) {}
applyTheme();
let lastT = performance.now(), uiT = 0;
function loop(now) {
  const dt = Math.min(.1, (now - lastT) / 1000); lastT = now; if (!workbenchActive || document.hidden) { requestAnimationFrame(loop); return; } const s = SIM();
  if (!LIVE.paused && s.t < 24 * 60 + 30) { LIVE.acc += dt * LIVE.speed / 60; let n = 0; while (LIVE.acc >= 1 && n < 30) { s.step(); LIVE.acc -= 1; n++; } if (LIVE.acc > 1) LIVE.acc = 0; }
  updateVehicles(LIVE.acc);
  const bt = now / 1000;
  boats.forEach((b, i) => { const a = b.ph + bt * b.w * (LIVE.paused ? 0 : 1) * 3; const x = LAKE[0] + Math.cos(a) * b.r * 1.5, z = LAKE[1] + Math.sin(a) * b.r; b.g.position.set(x, WATER * EX + .002 + Math.sin(bt * 1.7 + i) * .0006, z); b.g.rotation.set(Math.sin(bt * 1.3 + i) * .03, -a - (b.w > 0 ? Math.PI / 2 : -Math.PI / 2), 0); });
  for (const k in figs) figs[k].count = 0;   // 資料沒有候車人數，不畫候車人形
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
  if (GL_ON) renderer.render(scene, camera);
  const r = host.getBoundingClientRect(); placeLabels(r.width, r.height);
  uiT += dt; if (uiT > .3) { uiT = 0; refreshUI(false); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__tx = { setTol: (v) => { MATCH_TOL = v; }, matchTimetable, zoneStats, optimizeDay, RULE, SCN, LIVE, SIM, jumpTo, select, flyTo, viewOf, setTab, ask, FC, COST, OV, RDAYS, tripCells, camera, controls, FACS };
