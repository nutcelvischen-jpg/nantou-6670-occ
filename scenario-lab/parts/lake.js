/* ---------- 日月潭水面與船 ---------- */
{
  const sh = new THREE.Shape(), N = 96;
  for (let i = 0; i <= N; i++) { const th = i / N * Math.PI * 2, r = 1.75 * lakeR(th); const px = LAKE[0] + Math.cos(th) * r, pz = LAKE[1] + Math.sin(th) * r; i ? sh.lineTo(px, pz) : sh.moveTo(px, pz); }
  const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);
  const m = themed(new THREE.MeshStandardMaterial({ roughness: .18, metalness: .05, transparent: true, opacity: .92, side: THREE.DoubleSide }), '--water');
  const lake = new THREE.Mesh(g, m); lake.position.y = WATER * EX + .002; lake.receiveShadow = true; scene.add(lake);
}

