/* ---------- 日月潭遊艇 ---------- */
const boats = [];
{
  const k = new Kit();
  const hull = new THREE.Shape(); hull.moveTo(-6, -1.7); hull.lineTo(4, -1.7); hull.quadraticCurveTo(7.5, 0, 4, 1.7); hull.lineTo(-6, 1.7); hull.closePath();
  k.add('bus', new THREE.ExtrudeGeometry(hull, { depth: 1.3, bevelEnabled: true, bevelSize: .15, bevelThickness: .15, bevelSegments: 1 }), [0, -.2, 0], [Math.PI / 2, 0, 0]);
  k.box('blue', 11.6, .2, 3.5, -.6, -.55, 0);
  k.rbox('bus', 6, 1.8, 2.8, .2, -1.4, .95, 0);
  k.box('glass', 5.6, .7, 2.82, -1.4, 1.2, 0);
  k.box('cab', 6.8, .2, 3.2, -1.6, 1.95, 0);
  for (const s of [-1, 1]) k.cyl('steel', .05, .9, 3.2, .55, s * 1.4, 0, 0, 0, true);
  for (let i = 0; i < 3; i++) {
    const g = k.build(EDGE, 32); g.scale.setScalar(FAC); scene.add(g);
    boats.push({ g, r: .55 + i * .35, w: (.05 + i * .02) * (i % 2 ? -1 : 1), ph: i * 2.1 });
  }
}

