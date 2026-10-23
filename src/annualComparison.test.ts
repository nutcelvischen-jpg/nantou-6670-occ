import {describe,it,expect} from 'vitest';
import data from './data/ticket-aggregates.json';
import {availableYears,buildAnnualComparison,change,comparisonSelection} from './annualComparison';
describe('annual evidence',()=>{
 it('reconciles real daily, month, hourly and route totals, retaining missing days',()=>{
  const c=buildAnnualComparison(data,2024,2025);
  expect(c.total).toMatchObject({base:875149,target:925761,delta:50612});
  expect(c.total.percent).toBeCloseTo(5.783244,5);
  expect(c.base.observedDays).toBe(361);expect(c.base.expectedDays).toBe(366);expect(c.target.observedDays).toBe(364);
  for(const s of [c.base,c.target]){expect(s.months.reduce((n,m)=>n+(m.total??0),0)).toBe(s.total);expect(s.hourly.reduce((n,h)=>n+(h.total??0),0)).toBe(s.total);expect(s.routes.reduce((n,r)=>n+r.transactions,0)).toBe(s.total);}
  expect(c.routes.reduce((n,r)=>n+(r.delta??0),0)).toBe(c.total.delta);expect(c.commonCalendar.days).toBe(359);
  expect(c.base.missingDates).toContain('2024-07-24');expect(c.dailyMean.target).toBeCloseTo(925761/364);
 });
 it('handles swapped/same years, zero bases and absent months without fabricated zeros',()=>{
  expect(comparisonSelection(data,{year:2024,compare_year:2025,message:'比較2025與2024年的年度差異'})).toMatchObject({baseYear:2025,targetYear:2024});
  const reverse=buildAnnualComparison(data,2025,2024);expect(reverse.total.delta).toBe(-50612);expect(reverse.total.percent).toBeCloseTo(-50612/925761*100);
  expect(buildAnnualComparison(data,2024,2024).total.delta).toBe(0);expect(change(0,4).percent).toBeNull();expect(change(null,4).delta).toBeNull();
  const fixture=structuredClone(data);fixture.years[1].daily=fixture.years[1].daily.filter(d=>!d.date.startsWith('2025-02'));
  expect(buildAnnualComparison(fixture,2024,2025).target.months[1].total).toBeNull();
 });
 it('does not pass whole-family daily data off as route-specific',()=>{
  const c=buildAnnualComparison(data,2024,2025,'6670D');expect(c.total.delta).toBe(-6299);expect(c.target.dailyMean).toBeNull();expect(c.target.months[0].total).toBeNull();
 });
 it('discovers future years and rejects unavailable requested years',()=>{
  const fixture=structuredClone(data);fixture.years.push({...fixture.years[1],source:'2026年_6670刷卡資料.xlsx',daily:[{date:'2026-01-01',transactions:12}]});
  expect(availableYears(fixture)).toEqual([2024,2025,2026]);expect(buildAnnualComparison(fixture,2025,2026).target.total).toBe(12);
  expect(comparisonSelection(data,{year:2025,message:'比較2024與2026年的年度差異'}).missing).toEqual([2026]);
 });
});
