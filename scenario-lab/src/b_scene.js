
/* ============================================================
   Three.js 場景
   ============================================================ */
const host = $('#gl');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, .02, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.minDistance = .08; controls.maxDistance = 140; controls.maxPolarAngle = 1.46; controls.screenSpacePanning = false;
const HOME = { t: new THREE.Vector3(-.6, .3, -4.2), p: new THREE.Vector3(-8, 47, 46) };
camera.position.copy(HOME.p); controls.target.copy(HOME.t);
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d6cc, 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
const SUN_DIR = new THREE.Vector3(-.55, 1, -.42).normalize();
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004;
scene.add(sun, sun.target);
/*__MATS__*/
TOK.base = '--t-base'; TOK.baseLo = '--t-wall'; TOK.rule = '--card'; TOK.ruleTick = '--muted'; TOK.trunk = '--trunk';
/*__TERRAIN__*/

/* ---------- 日月潭水面 ---------- */
{
  const sh = new THREE.Shape(), N = 120;
  for (let i = 0; i <= N; i++) { const th = i / N * Math.PI * 2, r = 1.55 * lakeR(th); const px = LAKE[0] + Math.cos(th) * r * 1.25, pz = LAKE[1] + Math.sin(th) * r; i ? sh.lineTo(px, pz) : sh.moveTo(px, pz); }
  const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);
  const m = themed(new THREE.MeshStandardMaterial({ roughness: .18, metalness: .05, transparent: true, opacity: .92, side: THREE.DoubleSide }), '--water');
  const lake = new THREE.Mesh(g, m); lake.position.y = WATER * EX + .002; lake.receiveShadow = true; scene.add(lake);
}

/* ============================================================
   道路：TDX 線形畫成帶狀路面；重疊段只畫一次
   ============================================================ */
/*__ROAD__*/
{
  const drawn = new Map(); const dk = (x, z) => Math.floor(x / .08) * 100000 + Math.floor(z / .08);
  const near = (x, z) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = drawn.get(dk(x, z) + i * 100000 + j); if (L) for (const [a, b] of L) if ((a - x) ** 2 + (b - z) ** 2 < .05 ** 2) return true; } return false; };
  let lift = 0;
  for (const k of ['D', 'B', 'H', 'F']) {
    const R = ROUTES[k], N = R.pts.length, keep = R.pts.map((p) => !near(p.x, p.z));
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        // 依路段等級切開畫
        let s = 0;
        for (let i = 1; i <= run.length; i++) {
          if (i === run.length || R.cls[run[i]] !== R.cls[run[s]]) {
            const idx = run.slice(Math.max(0, s - 1), i);
            if (idx.length > 1) {
              const pts3 = idx.map((j) => new THREE.Vector3(R.pts[j].x, R.h[j] * EX, R.pts[j].z)), c = CLS[R.cls[run[s]]];
              ribbon(pts3, c.hw * 1.5, 9, .004 + lift); ribbon(pts3, c.hw, c.kind, .008 + lift); lift += .00004;
            }
            s = i;
          }
        }
      }
      run = [];
    };
    for (let i = 0; i < N; i++) { if (keep[i] || (i + 1 < N && keep[i + 1]) || (i > 0 && keep[i - 1])) run.push(i); else flush(); }
    flush();
    R.pts.forEach((p) => { const key = dk(p.x, p.z); if (!drawn.has(key)) drawn.set(key, []); drawn.get(key).push([p.x, p.z]); });
  }
}
// 路線色線：同一條路上並排顯示經過的子線
const ROUTE_LINES = {};
{
  const mk = (tok) => themed(new THREE.LineBasicMaterial({ transparent: true, opacity: .95, depthWrite: false }), tok);
  const M = { D: mk('--route'), B: mk('--route-b'), H: mk('--route-h'), F: null };
  const OFF = { D: 0, B: 1, H: -1 };
  for (const k of ['D', 'B', 'H']) {
    const R = ROUTES[k], a = [];
    const pt = (i, o) => { const p = R.pts[i], q = R.pts[Math.min(R.pts.length - 1, i + 1)], r = R.pts[Math.max(0, i - 1)]; let tx = q.x - r.x, tz = q.z - r.z; const tl = Math.hypot(tx, tz) || 1; return [p.x - tz / tl * o, R.h[i] * EX + .014, p.z + tx / tl * o]; };
    for (let i = 0; i < R.pts.length - 1; i++) { const o = OFF[k] * .028; a.push(...pt(i, o), ...pt(i + 1, o)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    const ls = new THREE.LineSegments(g, M[k]); ls.renderOrder = 2; scene.add(ls); ROUTE_LINES[k] = ls;
  }
}
