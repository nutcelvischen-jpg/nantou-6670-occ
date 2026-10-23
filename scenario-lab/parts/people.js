const MAXQ = 96;
const figGeo = (() => { const k = new Kit(); k.add('x', new THREE.CapsuleGeometry(.27, .8, 3, 8), [0, .67, 0]); k.add('x', new THREE.SphereGeometry(.19, 10, 8), [0, 1.48, 0]); return mergeGeometries(k.p.x, false); })();
const figMat = new THREE.MeshStandardMaterial({ roughness: .9 });
const PEOPLE_C = ['#5d6c7d', '#9b9da1', '#c96f53', '#e2b45a', '#4f7a63', '#f1f1ee', '#303134', '#8a6f9e'];
const figs = {};
