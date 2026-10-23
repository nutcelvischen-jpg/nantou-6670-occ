
/* ============================================================
   車輛與設施模型（單位：公尺）
   ============================================================ */
/*__BUS__*/
const BUS_T = makeBusModel();
/*__SMALL__*/
/*__HSR__*/
/*__SML__*/
// 客運轉運站（干城、埔里）：雨遮月台、站房、售票亭、停車格
function buildTerminal(nSlots, label) {
  const k = new Kit(), Wd = 26 * Math.ceil(nSlots / 2) + 30;
  k.box('paving', Wd, .6, 46, 0, .3, -16);
  k.box('asphalt', Wd, .62, 44, 0, .31, 26);
  k.box('concrete', Wd, .9, 1, 0, .45, 4);
  // 站房
  k.box('wall', 40, 9, 16, -Wd / 2 + 26, .6 + 4.5, -26);
  k.box('glassF', 40.1, 2.4, 16.1, -Wd / 2 + 26, .6 + 4.4, -26);
  k.box('roof', 42, .5, 18, -Wd / 2 + 26, .6 + 9.25, -26);
  k.box('amber', 18, 2, .3, -Wd / 2 + 26, .6 + 7.6, -17.9);
  k.box('glassF', 4, 3, 2, Wd / 2 - 14, .6 + 1.5, -24); k.box('roof', 5, .3, 3, Wd / 2 - 14, .6 + 3.2, -24);
  // 月台雨遮（鋸齒）
  for (let i = 0; i < Math.ceil(nSlots / 2) + 1; i++) {
    const x = -Wd / 2 + 18 + i * 26;
    k.box('roof', 22, .4, 9, x, 5.6, -1.5, .12);
    for (const dx of [-9, 9]) k.cyl('steel', .2, 5, x + dx, 3.1, -4.5, 0, 0, 0, true);
    k.box('wood', 6, .45, .8, x, 1.0, -4.8);
    k.box('sign', .8, .5, .12, x + 10, 4.6, -.5);
  }
  // 停車格（斜向月台）
  const slots = [];
  for (let i = 0; i < nSlots; i++) {
    const row = i % 2, col = Math.floor(i / 2), x = -Wd / 2 + 18 + col * 26 + (row ? 12 : 0), z = row ? 30 : 12;
    k.box('paintW', 13, .02, .3, x, .63, z - 2.2); k.box('paintW', 13, .02, .3, x, .63, z + 2.2);
    slots.push([x, z]);
  }
  for (let i = 0; i < 6; i++) treeInto(k, -Wd / 2 + 6 + i * (Wd - 12) / 5, -40, .9 + (i % 3) * .1);
  return { kit: k, slots: slots.map(([x, z]) => [x, z, 0]), entry: [Wd / 2 - 6, 44], queue: { x0: -Wd / 2 + 10, x1: Wd / 2 - 10, z0: -6, z1: -2.6 } };
}
// 路邊候車亭（中途站）
function stopKit() {
  const k = new Kit();
  k.box('concrete', 14, .3, 4.5, 0, .15, -3);
  k.box('roof', 7, .25, 2.6, 0, 3.1, -3.4);
  for (const dx of [-3.2, 3.2]) k.cyl('steel', .1, 2.9, dx, 1.6, -4.4, 0, 0, 0, true);
  k.box('glassF', 6.5, 2, .08, 0, 1.4, -4.6);
  k.box('wood', 4, .35, .6, 0, .8, -4.0);
  k.cyl('steel', .07, 3, 5, 1.5, -1.3, 0, 0, 0, true); k.box('sign', .9, .55, .08, 5, 2.9, -1.3);
  return k;
}

/* ---------- 放置設施 ---------- */
const facGroups = [];
function placeFac(f, b) {
  const g = b.kit.build(EDGE, 32);
  g.scale.setScalar(FAC); g.position.set(f.ox, f.oy, f.oz); g.rotation.y = f.yaw; scene.add(g); facGroups.push(g);
  g.updateMatrixWorld(true);
  const W3 = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(g.matrixWorld);
  f.slots = (b.slots || []).map(([lx, lz, ly]) => ({ pos: W3(lx, 1.1, lz), yaw: f.yaw + (ly || 0), busy: null }));
  f.entryW = W3(b.entry[0], 1.1, b.entry[1]); f.queue = b.queue; f.group = g; f.W3 = W3;
  // 連絡道
  const pts = [], N = 8, sy = hAt(f.sx, f.sz) * EX;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector3(lerp(f.sx, f.entryW.x, t), lerp(sy, f.oy, ss(0, 1, t)) - .001, lerp(f.sz, f.entryW.z, t))); }
  ribbon(pts, .02, 3, .0075);
}
placeFac(FACS.HSR, buildHSR());
placeFac(FACS.GC, buildTerminal(12));
placeFac(FACS.PL, buildTerminal(12));
placeFac(FACS.SML, buildSML());
// 中途站候車亭
const MIDSTOPS = ['臺中車站(民族路口)', '暨南大學(校內)', '暨南大學', '魚池', '埔里遊客中心', '崎下', '向山行政中心', '大雁', '桃米坑', '日月老茶廠', '民興公園(執行分署)', '捷運大慶站(建國北路)', '牛耳石雕公園', '大成國小', '榮民醫院', '埔里酒廠', '中華電信', '三育神學院', '九族文化村'];
for (const name of MIDSTOPS) {
  const s = STOPS[name]; if (!s) continue;
  const { p } = nearRoad(s[0], s[1], 1); if (!p) continue;
  const side = 1, ox = s[0] - p.tz * (p.hw + .02) * side, oz = s[1] + p.tx * (p.hw + .02) * side;
  const g = stopKit().build(EDGE, 32); g.scale.setScalar(FAC);
  g.position.set(ox, yAt(ox, oz) + .001, oz); g.rotation.y = Math.atan2(-p.tz * side, p.tx * side) + Math.PI / 2; scene.add(g);
}
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(roadNor, 3));
  g.setAttribute('aRoad', new THREE.Float32BufferAttribute(roadAttr, 3));
  g.setIndex(roadIdx);
  const roads = new THREE.Mesh(g, roadMat); roads.receiveShadow = true; scene.add(roads);
}
/*__GANTRY__*/
// ETC 門架：國道段每隔約 9 km 一座
{
  const R = ROUTES.D; let next = 6;
  for (let i = 1; i < R.pts.length - 1; i++) {
    if (R.cls[i] !== 'hw' || R.cum[i] < next) continue;
    next = R.cum[i] + 9;
    const p = R.pts[i], q = R.pts[i + 1];
    const g = gantryKit(CLS.hw.hw * 2 / FAC).build(EDGE, 32);
    g.scale.setScalar(FAC); g.position.set(p.x, R.h[i] * EX + .006, p.z); g.rotation.y = Math.atan2(-(q.z - p.z), q.x - p.x); scene.add(g);
  }
}

/* ============================================================
   城鎮建築
   ============================================================ */
const TOWNS = [ // 緯度、經度、半徑、棟數、最高高度（km）
  [24.148, 120.675, 4.0, 220, .16], [24.140, 120.700, 2.4, 90, .1], [24.105, 120.630, 1.3, 40, .06], [24.100, 120.680, 1.8, 70, .07],
  [24.062, 120.700, 1.4, 40, .05], [23.975, 120.683, 1.6, 50, .05], [23.912, 120.684, 1.7, 50, .06], [24.040, 120.857, .55, 12, .025],
  [23.968, 120.962, 1.7, 80, .06], [23.896, 120.935, .55, 14, .025], [23.868, 120.909, .45, 16, .03], [23.951, 120.928, .45, 10, .03],
];
const townCenters = [];
{
  const k = new Kit(); const pads = Object.values(FACS);
  for (const [lat, lon, R, cnt, maxH] of TOWNS) {
    const [cx, cz] = P(lat, lon); townCenters.push([cx, cz, R]);
    let tries = 0, placed = 0;
    while (placed < cnt && tries < cnt * 8) {
      tries++;
      const a = wr() * Math.PI * 2, r = R * Math.sqrt(wr()), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (x < X0 + .3 || x > X0 + W - .3 || z < Z0 + .3 || z > Z0 + D - .3) continue;
      if (lakeD(x, z) < 1.15) continue;
      if (pads.some((f) => Math.hypot(x - f.ox, z - f.oz) < PADR[f.type] + .08)) continue;
      const { p, d } = nearRoad(x, z, 1);
      const w = .045 + wr() * .08, dd = .04 + wr() * .07;
      if (p && d < p.hw * 1.5 + Math.max(w, dd) * .75 + .015) continue;
      const yaw = p ? Math.atan2(-p.tz, p.tx) : 0;
      const fall = 1 - r / R, hgt = .012 + maxH * (.25 + .75 * fall * fall) * (.5 + wr() * .7);
      const y = yAt(x, z) - .01;
      k.box('bldg', w, hgt + .01, dd, x, y + (hgt + .01) / 2, z, 0, yaw, 0);
      k.box('broof', w - .006, .003, dd - .006, x, y + hgt + .0115, z, 0, yaw, 0);
      const c = Math.cos(yaw), s = Math.sin(yaw), L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      const roll = wr();
      if (roll < .55) { const [tx, tz] = L((wr() - .5) * w * .5, (wr() - .5) * dd * .5); k.cyl('steel', .005, .01, tx, y + hgt + .018, tz, 0, 0, 0, true); }
      if (roll > .35) { const [tx, tz] = L((wr() - .5) * w * .5, (wr() - .5) * dd * .5); k.box('broof', .012, .006, .009, tx, y + hgt + .016, tz, 0, yaw, 0); }
      placed++;
    }
  }
  scene.add(k.build(EDGE_FAR, 30));
  const bm = MATS.bldg; const uBand = { value: new THREE.Color() };
  bm.onBeforeCompile = (sh) => {
    sh.uniforms.uBand = uBand;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP2; varying vec3 vN2;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP2 = position; vN2 = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uBand; varying vec3 vP2; varying vec3 vN2;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fy = vP2.y / 0.0105; float fwy = fwidth(fy);
        float side = 1.0 - smoothstep(0.3, 0.6, abs(vN2.y));
        float bandm = smoothstep(0.45 - fwy, 0.45 + fwy, fract(fy)) * (1.0 - smoothstep(0.8 - fwy, 0.8 + fwy, fract(fy)));
        float fade = 1.0 - smoothstep(0.25, 0.6, fwy);
        diffuseColor.rgb = mix(diffuseColor.rgb, uBand, bandm * side * fade * 0.55);`);
  };
  const setBand = () => uBand.value.set(cssv('--bldg-band')); setBand(); THEMED.push({ fn: setBand });
}
/*__VEG__*/
/*__BOATS__*/

/* ---------- 候車旅客（每人一個） ---------- */
/*__PEOPLE__*/
const QSPOTS = {};   // 區 → 位置陣列
{
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const mkQ = (key, list) => {
    const m = new THREE.InstancedMesh(figGeo, figMat, list.length); m.castShadow = true; m.count = 0; m.frustumCulled = false; scene.add(m);
    const rr = mulberry32(key.length * 97 + list.length);
    list.forEach(([pos, yaw], i) => { qq.setFromAxisAngle(up, yaw + (rr() - .5) * 1.2); m4.compose(pos, qq, new THREE.Vector3(FAC, FAC * (.9 + rr() * .2), FAC)); m.setMatrixAt(i, m4); c.set(PEOPLE_C[Math.floor(rr() * PEOPLE_C.length)]); m.setColorAt(i, c); });
    figs[key] = m;
  };
  const inFac = (f) => { const Q = f.queue || { x0: -30, x1: 30, z0: -6, z1: -2 }, rr = mulberry32(7), out = []; const cols = Math.floor((Q.x1 - Q.x0) / 1.25);
    for (let i = 0; i < MAXQ; i++) { const row = Math.floor(i / cols), col = i % cols; out.push([f.W3(Q.x0 + col * 1.25 + (rr() - .5) * .4, 1.05, Q.z1 - row * .95 + (rr() - .5) * .3), f.yaw]); } return out; };
  mkQ('HSR', inFac(FACS.HSR)); mkQ('SML', inFac(FACS.SML)); mkQ('GC', inFac(FACS.GC)); mkQ('PL', inFac(FACS.PL));
}
