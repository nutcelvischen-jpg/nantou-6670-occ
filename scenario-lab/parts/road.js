const roadU = {};
const ROADTOK = { uRHw: '--road-hw', uRPv: '--road', uRMt: '--road-mt', uRSh: '--shoulder', uMk: '--mark', uMkY: '--mark-y', uMed: '--median' };
for (const k in ROADTOK) roadU[k] = { value: new THREE.Color() };
function colorRoads() { for (const k in roadU) roadU[k].value.set(cssv(ROADTOK[k])); }
colorRoads(); THEMED.push({ fn: colorRoads });
const roadMat = new THREE.MeshStandardMaterial({ roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
roadMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, roadU);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRoad;\nvarying vec3 vRoad;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
  const decl = Object.keys(roadU).map(k => `uniform vec3 ${k};`).join('\n');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + decl + '\nvarying vec3 vRoad;\nfloat band(float u, float c, float w){ float f = fwidth(u); return 1.0 - smoothstep(w - f, w + f, abs(u - c)); }')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float u = vRoad.x, v = vRoad.y, kd = vRoad.z, au = abs(u);
      vec3 base = kd < 0.5 ? uRHw : (kd < 1.5 ? uRPv : (kd < 2.5 ? uRMt : (kd < 3.5 ? uRPv : uRSh)));
      float fade = 1.0 - smoothstep(0.08, 0.3, fwidth(u));
      float dfade = 1.0 - smoothstep(0.004, 0.012, fwidth(v));
      vec3 col = base;
      if (kd < 0.5) {
        col = mix(col, uMed, band(u, 0.0, 0.05) * fade);
        col = mix(col, uMk, band(au, 0.9, 0.018) * fade);
        float dash = step(fract(v / 0.06), 0.42);
        col = mix(col, uMk, band(au, 0.47, 0.014) * dash * fade * dfade);
      } else if (kd < 1.5 || (kd > 2.5 && kd < 3.5)) {
        col = mix(col, uMk, band(au, 0.88, 0.022) * fade);
        float dash = step(fract(v / 0.05), 0.5);
        col = mix(col, uMkY, band(u, 0.0, 0.022) * dash * fade * dfade);
      } else if (kd < 2.5) {
        col = mix(col, uMkY, (band(u, 0.06, 0.02) + band(u, -0.06, 0.02)) * fade);
        col = mix(col, uMk, band(au, 0.88, 0.02) * fade * 0.7);
      }
      diffuseColor.rgb = col;`);
};
const roadPos = [], roadNor = [], roadAttr = [], roadIdx = [];
function ribbon(pts3, hw, kind, lift) {
  const base = roadPos.length / 3; let s = 0;
  for (let i = 0; i < pts3.length; i++) {
    const p = pts3[i], q = pts3[Math.min(pts3.length - 1, i + 1)], r = pts3[Math.max(0, i - 1)];
    let tx = q.x - r.x, tz = q.z - r.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i > 0) s += Math.hypot(p.x - pts3[i - 1].x, p.z - pts3[i - 1].z);
    for (const sd of [-1, 1]) { roadPos.push(p.x - tz * hw * sd, p.y + lift, p.z + tx * hw * sd); roadNor.push(0, 1, 0); roadAttr.push(sd, s, kind); }
    if (i > 0) { const a = base + (i - 1) * 2, b = a + 1, c = a + 2, d = a + 3; roadIdx.push(a, b, c, b, d, c); }
  }
}
