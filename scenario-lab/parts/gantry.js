function gantryKit(span) {
  const k = new Kit(), z = span / 2 + 3;
  for (const s of [-1, 1]) { k.cyl('steel', .45, 8.2, 0, 4.1, s * z); k.box('concrete', 1.6, .6, 1.6, 0, .3, s * z); }
  for (const y of [6.6, 8.0]) for (const x of [-.7, .7]) k.box('steel', .22, .22, span + 6.6, x, y, 0);
  for (let i = -Math.floor(z / 2.5); i < Math.floor(z / 2.5); i++) { k.box('steel', .1, 1.55, .1, .7, 7.3, i * 2.5, .9); k.box('steel', .1, 1.55, .1, -.7, 7.3, i * 2.5 + 1.25, -.9); }
  for (let i = 0; i < 4; i++) { const lz = -span * .38 + i * span * .25; k.box('dark', .8, .6, .9, .2, 6.1, lz); k.box('glass', .05, .25, .5, .62, 6.1, lz); }
  k.box('dark', .2, 1.6, 7, -.9, 7.3, -span * .2);
  return k;
}
