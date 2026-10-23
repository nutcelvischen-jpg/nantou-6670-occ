function buildSML() {
  const k = new Kit();
  k.box('paving', 112, .6, 60, 0, .3, -4);
  k.box('asphalt', 112, .62, 28, 0, .31, 27);
  k.box('concrete', 112, .9, 1, 0, .45, 13);
  for (const x of [-42, -14, 14, 42]) k.box('paintW', .3, .02, 4.6, x, .63, 18);
  k.box('paintY', 112, .02, .25, 0, .63, 24);
  k.box('wall', 34, 6, 14, 0, .6 + 3, -22);
  k.box('glassF', 34.1, 2, 14.1, 0, .6 + 3.2, -22);
  const tri = new THREE.Shape(); tri.moveTo(-8.6, 0); tri.lineTo(0, 4.4); tri.lineTo(8.6, 0); tri.closePath();
  k.add('roof', new THREE.ExtrudeGeometry(tri, { depth: 37, bevelEnabled: false }), [-18.5, .6 + 6, -22], [0, Math.PI / 2, 0]);
  k.box('roof', 80, .5, 8, 0, 5.6, 7.5);
  for (let x = -38; x <= 38; x += 9.5) for (const z of [4.4, 10.8]) k.cyl('wood', .22, 5, x, 3.1, z, 0, 0, 0, true);
  for (let x = -34; x <= 34; x += 17) k.box('wood', 6, .45, .8, x, 1.0, 5.6);
  k.box('dark', 3, 2.2, .2, 30, 2, 2.5); k.box('sign', 2.6, .3, .22, 30, 2.8, 2.5);
  treeInto(k, -50, -10, 1.2); treeInto(k, 50, -16, 1.1); treeInto(k, -48, -28, 1.0); treeInto(k, 46, -30, 1.3);
  const slots = [];
  for (const x of [-28, 0, 28]) slots.push([x, 18, 0]);
  for (const x of [-46, -23, 0, 23, 46]) slots.push([x, 30, 0]);
  return { kit: k, slots, entry: [0, 42], queue: { x0: -36, x1: 36, z0: 5.4, z1: 10.2, gap: 0 } };
}
