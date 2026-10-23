/* ---------- 材質（全部由 CSS 變數上色） ---------- */
const THEMED = [];
function themed(mat, token, prop = 'color') { THEMED.push({ mat, token, prop }); mat[prop].set(cssv(token) || '#888'); return mat; }
const MATS = {};
const EMIT = new Set(['lightW', 'lightR', 'lightA', 'sign']);
const TOK = {
  bus: '--v-bus', cab: '--v-cab', box: '--v-box', blue: '--accent', amber: '--accent2', glass: '--v-glass', dark: '--v-dark',
  tire: '--v-tire', rim: '--v-rim', chrome: '--v-chrome', lightW: '--v-lightw', lightR: '--v-lightr', lightA: '--v-lighta', sign: '--v-sign',
  paintW: '--paint-w', paintY: '--paint-y', paving: '--f-paving', asphalt: '--f-asphalt', concrete: '--f-concrete', wall: '--f-wall',
  wall2: '--f-wall2', roof: '--f-roof', steel: '--f-steel', glassF: '--f-glass', green: '--f-green', wood: '--f-wood', carton: '--f-carton',
  rail: '--f-rail', ballast: '--f-ballast', train: '--f-train', carA: '--car-a', carB: '--car-b', carC: '--car-c', carD: '--car-d',
  tree: '--tree', bldg: '--bldg', broof: '--bldg-roof', water: '--water',
};
function MAT(key) {
  if (MATS[key]) return MATS[key];
  const glossy = key === 'glass' || key === 'glassF';
  const m = new THREE.MeshStandardMaterial({ roughness: glossy ? .35 : .82, metalness: (key === 'chrome' || key === 'rim') ? .35 : 0 });
  themed(m, TOK[key] || '--edge');
  if (EMIT.has(key)) { themed(m, TOK[key], 'emissive'); m.emissiveIntensity = .55; }
  return (MATS[key] = m);
}
const EDGE = themed(new THREE.LineBasicMaterial({ transparent: true, opacity: .55 }), '--edge');
const EDGE_FAR = themed(new THREE.LineBasicMaterial({ transparent: true, opacity: .35 }), '--edge');
const EDGE_LIT = themed(new THREE.LineBasicMaterial({ transparent: true, opacity: 1 }), '--lit');
const NOEDGE = new Set(['tire', 'lightW', 'lightR', 'lightA', 'sign', 'paintW', 'paintY', 'glass', 'tree', 'chrome']);

/* ---------- Kit：把許多小零件合併成少數幾個網格 ---------- */
const UBOX = new THREE.BoxGeometry(1, 1, 1), UCYL = new THREE.CylinderGeometry(1, 1, 1, 18), UCYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
class Kit {
  constructor() { this.p = {}; }
  add(key, geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    g.clearGroups();
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e); _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
    g.applyMatrix4(_m);
    (this.p[key] ||= []).push(g); return this;
  }
  box(key, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(key, UBOX, [x, y, z], [rx, ry, rz], [w, h, d]); }
  rbox(key, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 2) { return this.add(key, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)), [x, y, z], [rx, ry, rz]); }
  cyl(key, r, h, x, y, z, rx = 0, ry = 0, rz = 0, lo = false) { return this.add(key, lo ? UCYL8 : UCYL, [x, y, z], [rx, ry, rz], [r, h, r]); }
  build(edgeMat = EDGE, thr = 32) {
    const grp = new THREE.Group();
    for (const [key, list] of Object.entries(this.p)) {
      const g = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(g, MAT(key)); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.key = key;
      grp.add(mesh);
      if (edgeMat && !NOEDGE.has(key)) { const ls = new THREE.LineSegments(new THREE.EdgesGeometry(g, thr), edgeMat); ls.userData.edge = true; grp.add(ls); }
    }
    return grp;
  }
}

/* ---------- 柔和陰影貼圖（halo） ---------- */
function haloTex(soft = .5) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 64 * (1 - soft) * .6, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); return t;
}
const HALO_T = haloTex(.7);
const haloMat = themed(new THREE.MeshBasicMaterial({ map: HALO_T, transparent: true, opacity: .32, depthWrite: false }), '--halo');
const haloLitMat = themed(new THREE.MeshBasicMaterial({ map: HALO_T, transparent: true, opacity: .55, depthWrite: false }), '--lit');

