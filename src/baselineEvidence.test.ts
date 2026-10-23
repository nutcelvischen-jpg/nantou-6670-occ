import {describe,it,expect} from 'vitest';
import baseline from './data/baseline-dashboard.json';
import aggregates from './data/ticket-aggregates.json';
import {buildContext} from '../hosting/lib/operations-assistant';
describe('reviewed baseline dashboard',()=>{
 it('reconciles money and transaction group totals with existing annual evidence',()=>{
  for(const y of baseline.years){
   const original=aggregates.years.find(r=>r.source===y.source)!;
   expect(y.rows).toBe(original.rows);
   expect(y.routes.reduce((s,r)=>s+r.transactions,0)).toBe(y.rows);
   expect(y.categories.reduce((s,r)=>s+r.transactions,0)).toBe(y.rows);
   expect(y.routes.reduce((s,r)=>s+r.actual_sum,0)).toBe(y.actual_sum);
   expect(y.categories.reduce((s,r)=>s+r.actual_sum,0)).toBe(y.actual_sum);
   for(const r of y.routes){const values=Object.entries(y.route_month).filter(([k])=>k.startsWith(r.route+'|'));const shown=values.reduce((s,[,v])=>s+(v??0),0),hidden=values.filter(([,v])=>v===null).length;expect(shown).toBeLessThanOrEqual(r.transactions);expect(r.transactions-shown).toBeLessThanOrEqual(hidden*9);if(!hidden)expect(shown).toBe(r.transactions);}
  }
  expect(baseline.years[1].actual_sum).toBe(90515410);
 });
 it('retains station names and does not invent early E-line monthly observations',()=>{
  expect(baseline.years[0].route_month).not.toHaveProperty('6670E|2024-01');
  expect(baseline.years[1].stations.find(s=>s.name==='臺中')?.boardings).toBe(160852);
  expect(baseline.years[1].od[0].transactions).toBe(172520);
 });
 it('provides scoped evidence to the hosted assistant and rejects absent years',()=>{
  const c=buildContext({message:'比較2024與2025的站點與實扣差異',year:2025,compare_year:2024,route:'全部'});
  expect(c.baseline_evidence?.years).toHaveLength(2);
  expect(c.baseline_evidence?.scope).toContain('全部子線');
  expect(c.baseline_evidence?.duration_definition).toContain('非延誤');
  expect(buildContext({message:'比較2024與2026年度差異',year:2025,route:'全部'}).baseline_evidence).toBeNull();
 });
 it('exports aggregate fields only, without card/vehicle/driver identifiers',()=>{
  const forbidden=['card_id','raw_card_id','vehicle_day','driver_id','vehicles','cards','drivers','duplicate_hashes'];
  const inspect=(o:unknown)=>{if(o&&typeof o==='object')for(const [k,v]of Object.entries(o)){expect(forbidden).not.toContain(k);inspect(v);}};inspect(baseline);
 });
});
