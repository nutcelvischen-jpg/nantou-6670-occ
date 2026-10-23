const terrainUniforms = { uContour: { value: new THREE.Color() }, uEX: { value: EX }, uWall: { value: new THREE.Color() }, uStrata: { value: new THREE.Color() } };
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 });
terrainMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, terrainUniforms);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aField;\nvarying float vField;\nvarying vec3 vWP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvField = aField;\nvWP = (modelMatrix * vec4(position,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uContour;\nuniform float uEX;\nvarying float vField;\nvarying vec3 vWP;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float hm = vWP.y / uEX * 10.0;
      float fw = fwidth(hm);
      float ln = 1.0 - min(abs(fract(hm - 0.5) - 0.5) / max(fw, 1e-4), 1.0);
      float h5 = hm / 5.0; float fw5 = fwidth(h5);
      float mj = 1.0 - min(abs(fract(h5 - 0.5) - 0.5) / max(fw5, 1e-4), 1.0);
      float fade = 1.0 - smoothstep(0.22, 0.6, fw);
      float fadeM = 1.0 - smoothstep(0.08, 0.25, fw5);
      diffuseColor.rgb = mix(diffuseColor.rgb, uContour, max(ln * 0.22 * fade, mj * 0.42 * fadeM));
      vec2 fp = vWP.xz / 0.22; vec2 fwp = fwidth(fp);
      vec2 fg = abs(fract(fp - 0.5) - 0.5) / max(fwp, vec2(1e-4));
      float fl = 1.0 - min(min(fg.x, fg.y), 1.0);
      float ff = (1.0 - smoothstep(0.12, 0.4, max(fwp.x, fwp.y))) * vField;
      diffuseColor.rgb = mix(diffuseColor.rgb, uContour, fl * ff * 0.07);`);
};
const tGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 3), fld = new Float32Array(NX * NZ), idx = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = X0 + i * CELL, z = Z0 + j * CELL;
    pos[k * 3] = x; pos[k * 3 + 1] = HG[k] * EX; pos[k * 3 + 2] = z;
    const h = HG[k];
    fld[k] = h < .3 ? (1 - ss(.14, .3, h)) * ss(.35, .55, fbm(x * .6 + 40, z * .6, 2)) * (1 - riverW(x, z)) : 0;
  }
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; idx.push(a, c, b, b, c, d); }
  tGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tGeo.setAttribute('aField', new THREE.BufferAttribute(fld, 1));
  tGeo.setIndex(idx); tGeo.computeVertexNormals();
}
function colorTerrain() {
  const C = { p: new THREE.Color(cssv('--t-plain')), h: new THREE.Color(cssv('--t-hill')), m: new THREE.Color(cssv('--t-mount')), k: new THREE.Color(cssv('--t-peak')), r: new THREE.Color(cssv('--t-river')) };
  const col = tGeo.attributes.color.array, c = new THREE.Color();
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = X0 + i * CELL, z = Z0 + j * CELL, h = HG[k] + .04 * (vnoise(x * 1.3, z * 1.3) - .5);
    c.copy(C.p).lerp(C.h, ss(.12, .45, h)).lerp(C.m, ss(.6, 1.2, h)).lerp(C.k, ss(1.6, 2.2, h));
    c.lerp(C.r, riverW(x, z) * (1 - ss(.3, .5, h)));
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  tGeo.attributes.color.needsUpdate = true;
  terrainUniforms.uContour.value.set(cssv('--t-contour'));
  terrainUniforms.uWall.value.set(cssv('--t-wall'));
  terrainUniforms.uStrata.value.set(cssv('--t-strata'));
}
colorTerrain();
const terrain = new THREE.Mesh(tGeo, terrainMat); terrain.receiveShadow = true; terrain.castShadow = true;
scene.add(terrain);

// 側壁（地層）
const SKIRT = -.55;
{
  const ring = [];
  for (let i = 0; i < NX; i++) ring.push([i, 0]);
  for (let j = 1; j < NZ; j++) ring.push([NX - 1, j]);
  for (let i = NX - 2; i >= 0; i--) ring.push([i, NZ - 1]);
  for (let j = NZ - 2; j >= 1; j--) ring.push([0, j]);
  ring.push([0, 0]);
  const pos = [];
  for (let k = 0; k < ring.length - 1; k++) {
    const [i0, j0] = ring[k], [i1, j1] = ring[k + 1];
    const x0 = X0 + i0 * CELL, z0 = Z0 + j0 * CELL, x1 = X0 + i1 * CELL, z1 = Z0 + j1 * CELL;
    const y0 = HG[j0 * NX + i0] * EX, y1 = HG[j1 * NX + i1] * EX;
    pos.push(x0, y0, z0, x0, SKIRT, z0, x1, y1, z1, x1, y1, z1, x0, SKIRT, z0, x1, SKIRT, z1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, terrainUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uWall; uniform vec3 uStrata; varying float vY;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float b = step(0.5, fract(vY / 0.28));
        float ln = 1.0 - min(abs(fract(vY / 0.14 - 0.5) - 0.5) / max(fwidth(vY / 0.14), 1e-4), 1.0);
        diffuseColor.rgb = mix(uWall, uStrata, b * 0.55 + ln * 0.35);`);
  };
  const skirt = new THREE.Mesh(g, m); skirt.receiveShadow = true; scene.add(skirt);
  const sedge = []; for (let k = 0; k < ring.length - 1; k++) { const [i0, j0] = ring[k], [i1, j1] = ring[k + 1]; sedge.push(X0 + i0 * CELL, HG[j0 * NX + i0] * EX, Z0 + j0 * CELL, X0 + i1 * CELL, HG[j1 * NX + i1] * EX, Z0 + j1 * CELL); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(sedge, 3));
  scene.add(new THREE.LineSegments(eg, EDGE));
}
// 底板、腳座、刻度尺、標牌、指北
const BASE_M = 1.1;
{
  const k = new Kit();
  const cx = X0 + W / 2, cz = Z0 + D / 2;
  k.rbox('base', W + BASE_M * 2, .5, D + BASE_M * 2, .22, cx, SKIRT - .25, cz, 0, 0, 0, 3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const fx = cx + sx * (W / 2 + BASE_M - 1.4), fz = cz + sz * (D / 2 + BASE_M - 1.4);
    k.cyl('baseLo', .75, .14, fx, SKIRT - .57, fz); k.cyl('baseLo', .55, .4, fx, SKIRT - .78, fz);
    k.cyl('steel', .16, .03, cx + sx * (W / 2 + BASE_M - .45), SKIRT + .01, cz + sz * (D / 2 + BASE_M - .45), 0, 0, 0, true);
  }
  // 刻度尺（南側）
  const rz = Z0 + D + .62;
  k.box('rule', W, .03, .38, cx, SKIRT + .015, rz);
  for (let km = 0; km <= Math.floor(W); km++) { const major = km % 5 === 0; k.box('ruleTick', .03, .035, major ? .26 : .13, X0 + km, SKIRT + .02, rz - .19 + (major ? .13 : .065)); }
  // 指北箭頭（北側右角）
  const ax = X0 + W - .8, az = Z0 - .6, sh = new THREE.Shape();
  sh.moveTo(0, -.42); sh.lineTo(.18, .2); sh.lineTo(0, .1); sh.lineTo(-.18, .2); sh.closePath();
  k.add('ruleTick', new THREE.ExtrudeGeometry(sh, { depth: .03, bevelEnabled: false }), [ax, SKIRT + .005, az], [Math.PI / 2, 0, 0]);
  TOK.base = '--t-base'; TOK.baseLo = '--t-wall'; TOK.rule = '--card'; TOK.ruleTick = '--muted';
  const g = k.build(EDGE); g.traverse(o => { if (o.isMesh) o.castShadow = false; }); scene.add(g);
  // 前緣標牌（雕刻字）
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const plateMat = new THREE.MeshStandardMaterial({ map: tex, roughness: .9 });
  const drawPlate = () => { x.fillStyle = cssv('--t-base'); x.fillRect(0, 0, 1024, 64); x.fillStyle = cssv('--muted'); x.font = '500 26px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.fillText('TAICHUNG — NANTOU  ·  1 : 100 000  ·  VERT ×1.7', 512, 41); tex.needsUpdate = true; };
  drawPlate(); THEMED.push({ fn: drawPlate });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(9, .5625), plateMat);
  plate.position.set(cx, SKIRT - .25, Z0 + D + BASE_M + .002); scene.add(plate);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, D * 1.35), themed(new THREE.MeshBasicMaterial({ map: haloTex(.9), transparent: true, opacity: .28, depthWrite: false }), '--halo'));
  halo.rotation.x = -Math.PI / 2; halo.position.set(cx, SKIRT - 1.0, cz + .6); scene.add(halo);
}

