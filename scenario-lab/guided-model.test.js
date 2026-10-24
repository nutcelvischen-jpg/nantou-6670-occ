import {describe,it,expect} from 'vitest';
import {guidedOptions,guidedPreset,guidedKey} from './guided-model.js';
import spec from './data/scenario-spec.json';
describe('guided control settings',()=>{
 it('only offers implemented candidates for the chosen route',()=>{expect(guidedOptions('6670B').map(x=>x[0])).toEqual(['B-43','B-21']);for(const r of ['all','6670D','6670E','6670F'])expect(guidedOptions(r)).toEqual([]);});
 it('creates an independent preset preserving limits and changing the route window',()=>{const s=guidedPreset(spec,'6670H');expect(s).toMatchObject({scenario:'H',startHour:14,endHour:18,fleetLimit:41,serviceFloor:1});s.rule.drive=1;expect(spec.rule.drive).toBe(10);expect(guidedPreset(spec,'6670D')).toBeNull();});
 it('invalidates results on date, parameters, cost, deadhead or candidate changes',()=>{const base=guidedKey('2025-10-11',spec,'p85',{bus:3200},'B-21');for(const x of [guidedKey('2025-10-12',spec,'p85',{bus:3200},'B-21'),guidedKey('2025-10-11',{...spec,fleetLimit:10},'p85',{bus:3200},'B-21'),guidedKey('2025-10-11',spec,'p50',{bus:3200},'B-21'),guidedKey('2025-10-11',spec,'p85',{bus:3000},'B-21'),guidedKey('2025-10-11',spec,'p85',{bus:3200},'B-43')])expect(x).not.toBe(base);});
});
