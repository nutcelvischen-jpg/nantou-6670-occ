import {describe,it,expect} from 'vitest';
import {stationProject,stationBetween,stationAnchors} from './station-model.js';
import route from './data/route-6670.json';
describe('station diagram',()=>{
 it('retains repeated stop occurrences through a loop',()=>{
  const pts=[0,1,2,3,2,1,0].map(x=>({x,z:0}));
  const ss=stationProject([0,2,3,2,0].map(x=>({name:String(x),x,z:0})),pts,[0,1,2,3,4,5,6]);
  expect(ss.map(s=>s.d)).toEqual([0,2,3,4,6]);
 });
 it('interpolates and handles both endpoints without inventing a next stop',()=>{
  const ss=[{name:'A',d:0},{name:'B',d:10},{name:'C',d:20}];
  expect(stationBetween(ss,5)).toMatchObject({index:.5,previous:ss[0],next:ss[1]});
  expect(stationBetween(ss,10)).toMatchObject({index:1,previous:ss[1],next:ss[2]});
  expect(stationBetween(ss,20).next).toBeNull();expect(stationBetween([],5)).toBeNull();
 });
 it('uses planned stop times rather than copied historical events',()=>{
  const original={dep:400,anchors:[{z:'A',d:0,t:400},{z:'B',d:10,t:430}]};
  const planned={dep:420,stops:[{z:'A',t:420},{z:'B',t:455}],ev:[{t:400},{t:430}]};
  expect(stationAnchors(original,planned).map(a=>a.t)).toEqual([420,455]);
  expect(original.anchors[0].t).toBe(400);
 });
 it('preserves every published B/D/H stop sequence including reverse order',()=>{
  for(const [k,n] of [['B',29],['D',46],['H',16]]){
   const ll=route.shapes['THB6670'+k+'1'];
   const points=ll.map(([lon,lat])=>({x:lon*101.7,z:lat*110.6}));
   let cum=[0];for(let i=1;i<points.length;i++)cum.push(cum.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
   const stops=route.stops['THB6670'+k+'1'].map(([seq,name,lon,lat])=>({seq,name,x:lon*101.7,z:lat*110.6}));
   const mapped=stationProject(stops,points,cum);expect(mapped).toHaveLength(n);expect(Math.max(...mapped.map(x=>x.error))).toBeLessThan(.2);
   expect(mapped.every((s,i)=>i===0||s.d>mapped[i-1].d)).toBe(true);
   const rev=stationProject(stops.toReversed(),points.toReversed(),cum.map(x=>cum.at(-1)-x).reverse());expect(rev[0].name).toBe(stops.at(-1).name);expect(rev).toHaveLength(n);
  }
 });
});
