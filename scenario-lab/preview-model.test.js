import {describe,it,expect} from 'vitest';
import {previewClock,previewFitDistance} from './preview-model.js';
describe('independent single-bus preview',()=>{
 it('starts paused and does not mutate either caller state or driving state',()=>{
  const driving={minute:990,paused:false},preview={minute:390,paused:true,speed:120};
  expect(previewClock(preview,30,500)).toEqual(preview);
  expect(previewClock({...preview,paused:false},30,500).minute).toBe(450);
  expect(preview.minute).toBe(390);expect(driving).toEqual({minute:990,paused:false});
 });
 it('has the same result for different frame slicing and stops at the chosen trip end',()=>{
  const initial={minute:390,paused:false,speed:120};let s=initial;
  for(let i=0;i<100;i++)s=previewClock(s,.1,500);
  expect(s.minute).toBeCloseTo(previewClock(initial,10,500).minute,8);
  expect(previewClock(initial,300,500)).toEqual({...initial,minute:500,paused:true});
 });
 it('fits every corner in wide and narrow viewports',()=>{
  const points=[[-30,-20,10],[30,20,10],[-30,20,-10],[30,-20,-10]];
  for(const aspect of [.5,1,2.5]){const d=previewFitDistance(points,36,aspect),t=Math.tan(18*Math.PI/180);
   for(const [x,y,z] of points){expect(Math.abs(x)/(d-z)/t/aspect).toBeLessThan(.82);expect(Math.abs(y)/(d-z)/t).toBeLessThan(.82);}
  }
 });
});
