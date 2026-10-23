const TREE_S = { value: 1 };
/* ============================================================
   植被：闊葉樹、針葉樹、檳榔樹（InstancedMesh）
   ============================================================ */
{
  const spots = { broad: [], conifer: [], palm: [] };
  for (let z = Z0 + .3; z < Z0 + D - .3; z += .2) for (let x = X0 + .3; x < X0 + W - .3; x += .2) {
    const jx = x + (wr() - .5) * .18, jz = z + (wr() - .5) * .18, h = hAt(jx, jz);
    if (h < .12) continue;
    const forest = fbm(jx * .35 + 7, jz * .35 - 3, 3);
    if (forest < .44 + (h < .3 ? .12 : 0)) continue;
    if (wr() > .62) continue;
    if (lakeD(jx, jz) < 1.9) continue;
    if (townCenters.some(([cx, cz, R]) => Math.hypot(jx - cx, jz - cz) < R * .9)) continue;
    if (Object.values(FACS).some(f => Math.hypot(jx - f.ox, jz - f.oz) < PADR[f.type] + .05)) continue;
    const { p, d } = nearRoad(jx, jz, 1); if (p && d < p.hw * 1.6 + .06) continue;
    const kind = h > 1.0 ? 'conifer' : (h < .6 && wr() < .3 ? 'palm' : 'broad');
    spots[kind].push([jx, yAt(jx, jz), jz]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const mk = (geo, tok, list, sFn, yOff, tint) => {
    geo = geo.clone(); geo.translate(0, yOff, 0);
    const mat = themed(new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true }), tok);
    mat.onBeforeCompile = (sh) => { sh.uniforms.uTreeS = TREE_S; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTreeS;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= uTreeS;'); };
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z], i) => { const s = sFn(); q.setFromAxisAngle(up, wr() * 6.28); m4.compose(new THREE.Vector3(x, y - .002, z), q, new THREE.Vector3(s, s * (.9 + wr() * .3), s)); mesh.setMatrixAt(i, m4); if (tint) { col.setScalar(.9 + wr() * .14); mesh.setColorAt(i, col); } });
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  const broad = new THREE.IcosahedronGeometry(.032, 0); broad.scale(1, .85, 1);
  const cone = new THREE.ConeGeometry(.026, .085, 6);
  const trunk = new THREE.CylinderGeometry(.004, .005, .03, 5);
  const palmT = new THREE.CylinderGeometry(.0018, .0025, .07, 4);
  const palmC = new THREE.IcosahedronGeometry(.012, 0); palmC.scale(1, .5, 1);
  const rs = () => .8 + wr() * .55;
  const s1 = spots.broad.map(() => rs()), s2 = spots.conifer.map(() => rs()), s3 = spots.palm.map(() => rs());
  let i1 = 0, i2 = 0, i3 = 0;
  mk(broad, '--tree', spots.broad, () => s1[i1++], .046, true); i1 = 0;
  mk(trunk, '--trunk', spots.broad, () => s1[i1++], .015, false);
  mk(cone, '--conifer', spots.conifer, () => s2[i2++], .052, true); i2 = 0;
  mk(trunk, '--trunk', spots.conifer, () => s2[i2++], .012, false);
  mk(palmT, '--trunk', spots.palm, () => s3[i3++], .035, false); i3 = 0;
  mk(palmC, '--palm', spots.palm, () => s3[i3++], .072, true);
}

