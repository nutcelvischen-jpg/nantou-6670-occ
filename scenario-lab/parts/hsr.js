function buildHSR() {
  const k = new Kit();
  k.box('paving', 300, 1, 112, 0, .5, -11);                                   // 廣場
  k.box('asphalt', 300, 1.04, 26, 0, .52, 28);                                // 公車道
  k.box('concrete', 280, 1.3, 1.2, 0, .65, 14.6);                             // 月台緣石
  for (let x = -60; x <= 60; x += 24) k.box('paintW', .35, .02, 4.6, x, 1.05, 22);
  k.box('paintW', 120, .02, .3, 0, 1.05, 19.6);
  for (let x = -48; x <= 48; x += 24) k.box('paintW', .35, .02, 4.6, x, 1.05, 34);
  k.box('paintY', 300, .02, .25, 0, 1.05, 28.2);
  // 站房
  const hz = -55;
  k.box('wall', 170, 14, 40, 0, 8, hz);
  k.box('glassF', 156, 10, .4, 0, 7, hz + 20.1);
  for (let i = 0; i <= 26; i++) k.box('wall', .5, 10, .9, -78 + i * 6, 7, hz + 20.2);
  for (const y of [4.2, 8.8]) k.box('wall', 156, .45, .9, 0, y, hz + 20.2);
  k.box('dark', 64, 1.8, .4, 0, 13.4, hz + 20.4);
  k.add('roof', new THREE.CylinderGeometry(24, 24, 178, 28, 1, false, 0, Math.PI), [0, 15, hz], [0, 0, Math.PI / 2], [.32, 1, 1]);
  for (let i = 0; i < 17; i++) k.add('steel', new THREE.TorusGeometry(24.15, .22, 4, 28, Math.PI), [-88 + i * 11, 15, hz], [0, Math.PI / 2, 0], [1, .32, 1]);
  k.box('roof', 44, .8, 12, 0, 12, hz + 26);                                  // 入口雨遮
  for (const x of [-19, -6.5, 6.5, 19]) k.cyl('steel', .45, 11, x, 6.5, hz + 30.5);
  // 連通廊、高架橋、月台
  k.box('wall', 32, 8, 12, 0, 14, -81);
  const vz = -100;
  k.box('concrete', 430, 2.2, 28, 0, 12.1, vz);
  for (let x = -195; x <= 195; x += 30) { k.box('concrete', 3.2, 11.2, 7, x, 5.6, vz); k.box('concrete', 4, 1, 22, x, 10.6, vz); }
  for (const s of [-1, 1]) k.box('concrete', 430, 1.4, .6, 0, 13.9, vz + s * 13.7);
  for (const o of [-9.5, -4.2, 4.2, 9.5]) {
    k.box('ballast', 430, .5, 3.4, 0, 13.45, vz + o);
    for (const r of [-.72, .72]) k.box('rail', 430, .22, .14, 0, 13.82, vz + o + r);
  }
  k.box('paving', 300, 1.15, 5.4, 0, 13.8, vz);
  k.box('paintY', 300, .02, .3, 0, 14.39, vz - 2.4); k.box('paintY', 300, .02, .3, 0, 14.39, vz + 2.4);
  k.box('roof', 290, .6, 15, 0, 22.4, vz);
  for (let x = -140; x <= 140; x += 20) k.cyl('steel', .4, 8, x, 18.2, vz);
  // 高鐵列車（橘色帶）
  const train = (x0, z, n) => {
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * 25.6;
      k.rbox('train', 25, 3.6, 3.4, .7, cx, 16.0, z, 0, 0, 0, 3);
      k.box('glass', 21.5, .72, 3.42, cx, 16.6, z);
      k.box('amber', 25.02, .26, 3.43, cx, 15.6, z);
      for (const b of [-8.5, 8.5]) k.box('dark', 3, .8, 2.6, cx + b, 13.9, z);
      if (i < n - 1) k.box('dark', .8, 3.0, 3.0, cx + 12.8, 16.0, z);
    }
    for (const [ex, sg] of [[x0 - 12.5, -1], [x0 + (n - 1) * 25.6 + 12.5, 1]]) {
      k.add('train', new THREE.SphereGeometry(1.7, 18, 12), [ex, 15.95, z], [0, 0, 0], [5.2, 1.05, 1]);
      k.add('glass', new THREE.SphereGeometry(1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), [ex + sg * 4.6, 16.4, z], [0, 0, -sg * 1.15], [1.4, .6, 1.02]);
      k.add('amber', new THREE.SphereGeometry(1.72, 18, 6, 0, Math.PI * 2, Math.PI * .58, .08), [ex, 15.95, z], [0, 0, 0], [5.22, 1.05, 1.01]);
    }
  };
  train(-90, vz - 4.2, 8);
  // 公車候車亭
  for (const x of [-48, -24, 0, 24, 48]) {
    k.box('roof', 18, .4, 5.2, x, 5.2, 9.6);
    for (const dx of [-7.5, 7.5]) k.cyl('steel', .15, 4.4, x + dx, 3.2, 11.6, 0, 0, 0, true);
    k.box('glassF', 6, 2.4, .1, x - 4.5, 2.4, 7.2);
    k.box('wood', 7, .45, .8, x + 3, 1.55, 7.8);
    k.box('sign', .9, .5, .12, x + 8.5, 4.2, 11.6);
  }
  // 停車場與停放車輛
  k.box('asphalt', 74, 1.02, 92, -192, .51, 2);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 24; c++) {
    const x = -226 + c * 2.8, z = -36 + r * 22;
    k.box('paintW', .12, .02, 5, x - 1.4, 1.03, z);
    if (wr() < .72) carInto(k, x, z, Math.PI / 2, ['carA', 'carA', 'carB', 'carC', 'carD'][Math.floor(wr() * 5)]);
  }
  // 植栽與路燈
  for (let x = -140; x <= 140; x += 14) { k.box('green', 4, 1.0, 4, x, 1.5, -6); treeInto(k, x, -6, .9 + wr() * .3); }
  for (let x = -130; x <= 130; x += 26) { k.cyl('steel', .14, 8, x, 5, 41.5, 0, 0, 0, true); k.box('steel', 2.2, .12, .2, x - .9, 9, 41.5); k.box('lightW', .8, .1, .3, x - 1.8, 8.92, 41.5); }
  const slots = [];
  for (const x of [-48, -24, 0, 24, 48]) slots.push([x - 2, 22, 0]);
  for (const x of [-36, -12, 12]) slots.push([x, 34, 0]);
  return { kit: k, slots, entry: [92, 36], queue: { x0: -58, x1: 58, z0: 7.6, z1: 12.8, gap: 24 } };
}
