import {describe,it,expect} from 'vitest';
import {allocate,candidates,evaluate,runComparison,routeSummary,validateSpec} from './dispatch-model.js';
const spec=()=>({scenario:'H',direction:0,startHour:0,endHour:24,shift:30,serviceFloor:1,fleetLimit:5,types:{large:{cap:43,available:5,kmCost:10,fixed:100,crossRoute:true},medium:{cap:21,available:5,kmCost:6,fixed:70,crossRoute:true}},rule:{drive:10,cont:4,rest:30,span:12,turn:10,signOn:15,signOff:10}});
const trip=(id,dep=600,code='6670H')=>({id,code,dir:0,dep,arr:dep+60,startZ:'X',endZ:'Y',km:50,peak:40,observedPeak:40,stops:[{si:0,t:dep},{si:1,t:dep+30},{si:2,t:dep+60}],type:'large',cap:43});
const deps={minFleet:T=>({blocks:T.map(t=>[t])}),dhT:()=>10,dhKm:()=>5,dutyCost:span=>span*100};
describe('dispatch candidates and conservation',()=>{
 it('does not duplicate demand or receipts when adding trips',()=>{const s=spec(),base=[trip('T0')],cells=[[0,'6670H',0,10,0,2,50,12345]],before=JSON.stringify(base);const r=runComparison(base,cells,s,deps);for(const x of r.options){expect(x.assigned+x.unassigned).toBe(50);expect(x.assignedPaid+x.unassignedPaid).toBe(12345);expect(x.T.reduce((a,t)=>a+t.paid,0)).toBe(x.assignedPaid);for(const t of x.T)expect(t.loads.every(l=>l<=t.cap)).toBe(true);}expect(r.options[1].unassigned).toBe(0);expect(r.options[0].unassigned).toBe(7);expect(JSON.stringify(base)).toBe(before);});
 it('uses segment occupancy rather than total boardings',()=>{const t=trip('T0');t.cap=21;const a=allocate([t],[t],[[0,t.code,0,10,0,1,20,200],[0,t.code,0,10,1,2,20,200]],spec());expect(a.assigned).toBe(40);expect(a.T[0].peak).toBe(20);});
 it('keeps unmatched and same-station demand, cents and each bucket',()=>{const t=trip('T0');const a=allocate([t],[t],[[0,t.code,0,10,0,0,2,103],[0,t.code,0,10,0,9,3,99]],spec());expect(a.unassigned).toBe(5);for(const g of a.ledger){expect(g.assigned+g.unassigned).toBe(g.n);expect(g.assignedPaid+g.unassignedPaid).toBe(g.paid);}});
 it('B capacity change preserves observed low ratio and detects overflow',()=>{const s={...spec(),scenario:'B'},base=[trip('T0',600,'6670B')];base[0].peak=base[0].observedPeak=30;const r=runComparison(base,[[0,'6670B',0,10,0,2,30,300]],s,deps);expect(r.options[0].unassigned).toBe(0);expect(r.options[1].unassigned).toBe(9);expect(routeSummary(r.options[0],base)[0].observedLowPct).toBe(routeSummary(r.options[1],base)[0].observedLowPct);expect(r.options[1].feasible).toBe(false);});
 it('zero shift cannot place original demand on a delayed added bus',()=>{const s={...spec(),shift:0},t=trip('T0'),r=runComparison([t],[[0,t.code,0,10,0,2,50,500]],s,deps);expect(r.options[2].unassigned).toBe(7);});
 it('reports fleet shortage with a time and endpoint, not deleted trips',()=>{const s={...spec(),fleetLimit:0},t=trip('T0'),r=runComparison([t],[],s,deps);expect(r.fixed.T).toHaveLength(1);expect(r.fixed.issues.find(x=>x.code==='fleet_limit')).toMatchObject({minute:600,endpoint:'X'});expect(r.best).toBeNull();});
 it('rejects invalid inputs without mutation and handles no demand',()=>{const s=spec(),before=JSON.stringify(s);expect(()=>validateSpec({...s,shift:-1})).toThrow();expect(JSON.stringify(s)).toBe(before);const r=runComparison([trip('T0')],[],s,deps);expect(r.fixed.coverage).toBe(1);expect(r.fixed.assignedPaid).toBe(0);});
 it('never changes vehicle type within a chain',()=>{const s={...spec(),scenario:'B'},a=trip('T0',600,'6670B'),b=trip('T1',800,'6670H');const r=runComparison([a,b],[],s,{...deps,minFleet:T=>({blocks:[T]})});for(const block of r.options[1].blocks)expect(new Set(block.trips.map(t=>t.type)).size).toBe(1);});
 it('A shift moves every stop and preserves ids and raw inputs',()=>{const s={...spec(),scenario:'A'},base=[trip('T0',600,'6670A')],c=candidates(base,s);expect(c[2].T[0].stops[1].t).toBe(615);expect(c[2].T[0].id).toBe('T0');expect(base[0].dep).toBe(600);});
 it('reports an indivisible trip exceeding duty limits',()=>{const s=spec(),t=trip('T0');t.arr=t.dep+300;const r=evaluate([t],[],{id:'x',label:'x',T:[t],issues:[],changes:[]},s,deps);expect(r.thresholdExceedances).toBe(1);expect(r.issues.some(x=>x.code==='duty')).toBe(true);});
});
it('counts deadhead as driving and excludes turn time from qualifying rest',()=>{
 const s=spec();s.rule.cont=2;s.rule.rest=30;s.rule.turn=40;
 const a=trip('T0',600),b=trip('T1',710);a.arr=660;b.arr=770;
 const r=evaluate([a,b],[],{id:'x',T:[a,b],issues:[],changes:[]},s,{...deps,minFleet:T=>({blocks:[T]}),dhT:()=>10});
 expect(r.drivers).toBe(2);expect(r.duties.reduce((n,d)=>n+d.drive,0)).toBeCloseTo(130/60);
 expect(r.blocks[0].segments.some(j=>j.kind==='rest')).toBe(false);
});
