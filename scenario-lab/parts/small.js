function carInto(k, x, z, yaw, key) {
  const c = Math.cos(yaw), s = Math.sin(yaw), P2 = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = P2(0, 0); k.rbox(key, 4.4, .72, 1.78, .22, p[0], .62, p[1], 0, yaw, 0);
  p = P2(-.25, 0); k.rbox('glass', 2.3, .56, 1.6, .2, p[0], 1.2, p[1], 0, yaw, 0);
  p = P2(-.25, 0); k.box(key, 1.9, .05, 1.5, p[0], 1.49, p[1], 0, yaw, 0);
  const side = Math.abs(Math.sin(yaw)) > .7;
  for (const [lx, lz] of [[1.4, .8], [1.4, -.8], [-1.4, .8], [-1.4, -.8]]) { p = P2(lx, lz); k.cyl('tire', .33, .22, p[0], .33, p[1], side ? 0 : Math.PI / 2, 0, side ? Math.PI / 2 : 0, true); }
}
function treeInto(k, x, z, s = 1) { k.cyl('trunk', .18 * s, 2.6 * s, x, 1.3 * s, z, 0, 0, 0, true); k.add('tree', new THREE.IcosahedronGeometry(1.7 * s, 0), [x, 3.6 * s, z], [0, x, 0], [1, .9, 1]); }
TOK.trunk = '--trunk';
