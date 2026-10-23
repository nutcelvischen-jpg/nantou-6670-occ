function wheelKit(r, w, dual) {
  const k = new Kit(), zs = dual ? [-w * .55, w * .55] : [0];
  for (const oz of zs) {
    k.cyl('tire', r, w, 0, 0, oz, Math.PI / 2);
    k.cyl('tire', r * .93, w * 1.04, 0, 0, oz, Math.PI / 2);          // 胎肩
    k.cyl('rim', r * .6, w * 1.06, 0, 0, oz, Math.PI / 2);
    k.cyl('chrome', r * .22, w * 1.12, 0, 0, oz, Math.PI / 2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.cyl('chrome', r * .045, w * 1.14, Math.cos(a) * r * .38, Math.sin(a) * r * .38, oz, Math.PI / 2, 0, 0, true); }
  }
  return k.build(EDGE, 40);
}
function makeBusModel() {
  const k = new Kit(), L = 12, Wd = 2.5, H = 3.3, y0 = .4;
  k.rbox('bus', L, H - y0, Wd, .26, 0, y0 + (H - y0) / 2, 0, 0, 0, 0, 3);
  k.box('dark', L - .9, .4, Wd + .02, 0, y0 + .3, 0);                         // 裙板
  k.box('glass', 10.3, 1.12, Wd + .03, -.55, 2.06, 0);                        // 車窗帶
  for (let i = 0; i < 9; i++) k.box('bus', .1, 1.14, Wd + .05, -5.6 + .45 + i * 1.18, 2.06, 0);
  k.box('blue', L - .5, .13, Wd + .035, 0, 1.33, 0);                          // 色帶
  k.box('blue', L - .5, .05, Wd + .035, 0, 1.47, 0);
  k.box('glass', .06, 1.75, Wd - .3, L / 2 + .005, 1.95, 0);                  // 擋風玻璃
  k.box('glass', .06, .85, Wd - .55, -L / 2 - .005, 2.25, 0);                 // 後窗
  k.box('sign', .07, .24, 1.7, L / 2 + .02, 2.98, 0);                         // LED 路線牌
  k.box('sign', .2, .2, .9, -L / 2 - .02, 2.98, 0);
  k.box('sign', 1.5, .2, .06, 4.2, 2.86, Wd / 2 + .02);                       // 側面路線牌
  for (const dx of [4.65, -.3]) {                                              // 車門（右側）
    k.box('glass', .95, 2.08, .03, dx, 1.52, Wd / 2 + .006);
    k.box('dark', .03, 2.1, .04, dx, 1.52, Wd / 2 + .01);
    k.box('dark', 1.0, .03, .04, dx, 2.57, Wd / 2 + .01);
  }
  for (const s of [-1, 1]) {
    k.rbox('dark', .26, .38, .9, .06, L / 2 + .06, .7, s * .78);              // 前保險桿
    k.rbox('dark', .26, .38, .9, .06, -L / 2 - .06, .7, s * .78);
    k.box('lightW', .06, .18, .44, L / 2 + .03, 1.02, s * .86);
    k.box('lightA', .06, .11, .16, L / 2 + .03, 1.02, s * .5);
    k.box('lightR', .06, .78, .14, -L / 2 - .03, 1.25, s * 1.08);
    k.box('lightA', .06, .2, .14, -L / 2 - .03, .73, s * 1.08);
    // 兔耳後照鏡
    k.box('dark', .55, .05, .05, L / 2 + .22, 2.72, s * (Wd / 2 - .08));
    k.box('dark', .05, .6, .05, L / 2 + .47, 2.44, s * (Wd / 2 - .08));
    k.rbox('dark', .13, .42, .26, .04, L / 2 + .5, 2.02, s * (Wd / 2 - .04));
    // 雨刷
    k.box('dark', .03, .9, .04, L / 2 + .04, 1.42, s * .42, s * .55);
  }
  k.box('dark', .3, .38, Wd - 1.8, L / 2 + .06, .7, 0);
  k.box('paintW', .03, .2, .5, L / 2 + .2, .7, 0); k.box('paintW', .03, .2, .5, -L / 2 - .2, .7, 0);
  k.box('dark', .04, .32, 1.3, L / 2 + .02, 1.33, 0);                         // 水箱罩
  // 車頂冷氣、逃生口
  k.rbox('cab', 3.4, .34, 1.75, .12, -1.3, H + .17, 0);
  for (let i = 0; i < 6; i++) k.box('dark', .06, .02, 1.45, -2.8 + i * .6, H + .345, 0);
  k.box('cab', .85, .07, .85, 2.7, H + .035, 0); k.box('cab', .85, .07, .85, -4.6, H + .035, 0);
  // 輪弧
  for (const ax of [3.9, -2.75]) for (const s of [-1, 1]) k.add('dark', new THREE.TorusGeometry(.62, .07, 6, 18, Math.PI), [ax, .48, s * (Wd / 2 + .004)]);
  const grp = new THREE.Group(); grp.add(k.build(EDGE, 30));
  const wheels = [];
  for (const [ax, dual] of [[3.9, false], [-2.75, true]]) for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.userData.wheel = true; piv.position.set(ax, .5, s * (Wd / 2 - (dual ? .36 : .2))); piv.add(wheelKit(.5, .3, dual)); grp.add(piv); wheels.push(piv);
  }
  return { grp, wheels, L, Wd, r: .5 };
}
