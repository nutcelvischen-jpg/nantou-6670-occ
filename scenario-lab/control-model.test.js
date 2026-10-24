import {describe,it,expect} from 'vitest';
import {controlTripAt,controlLoad,controlRows,controlEvents} from './control-model.js';
const a={id:'T1',bus:'B01',code:'6670A',dep:60,arr:120,peak:43,ev:[{t:60,load:20},{t:90,load:43}],stops:[{t:60},{t:90},{t:120}],loads:[7,9]};
describe('control center single-clock selectors',()=>{
 it('uses half-open trip intervals to avoid two active trips at a boundary',()=>{expect(controlTripAt([a],120)).toBeNull();expect(controlTripAt([a],60)).toBe(a);});
 it('keeps scenario allocations separate from inherited historical events',()=>{expect(controlLoad(a,100,true)).toBe(9);expect(controlLoad(a,100,false)).toBe(43);expect(controlLoad(a,120,true)).toBe(0);});
 it('seek and minute stepping produce the same stateless answer',()=>{let x;for(let t=0;t<=100;t++)x=controlLoad(a,t,true);expect(x).toBe(controlLoad(a,100,true));});
 it('retains distinct historical and scenario vehicle identities',()=>{expect(controlRows([a])[0].id).toBe('B01');expect(controlRows([a],{blocks:[{id:'V01',trips:[a]}]})[0].id).toBe('V01');});
 it('distinguishes reached from exceeded capacity and does not mutate inputs',()=>{const before=JSON.stringify(a);expect(controlEvents([a])[0].label).toContain('達到');expect(controlEvents([{...a,peak:44}])[0].label).toContain('超出');expect(JSON.stringify(a)).toBe(before);});
 it('keeps unknown-time constraints global rather than fabricating a time',()=>{const e=controlEvents([],{issues:[{message:'車隊不足'}],changes:[],ledger:[]});expect(e[0].minute).toBeNull();});
});
