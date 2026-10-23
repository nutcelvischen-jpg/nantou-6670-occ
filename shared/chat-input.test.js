import {describe,it,expect} from 'vitest';
import {createChatInputGuard} from './chat-input.js';
describe('Chinese IME send guard shared by both chat entries',()=>{
 it('retains the draft throughout candidate selection and sends on a later deliberate Enter',()=>{
  let time=1000;const g=createChatInputGuard(()=>time),enter={key:'Enter'};
  g.start();expect(g.shouldSend(enter)).toBe(false);expect(g.blocked()).toBe(true);
  g.end();expect(g.shouldSend(enter)).toBe(false);expect(g.blocked()).toBe(true);
  time+=100;expect(g.shouldSend(enter)).toBe(true);expect(g.blocked()).toBe(false);
 });
 it('handles native IME flags, Safari 229, Shift newline and key repeat',()=>{
  const g=createChatInputGuard();
  for(const extra of [{isComposing:true},{keyCode:229},{shiftKey:true},{repeat:true}]) expect(g.shouldSend({key:'Enter',...extra})).toBe(false);
  expect(g.shouldSend({key:'a'})).toBe(false);expect(g.shouldSend({key:'Enter'})).toBe(true);
 });
});
