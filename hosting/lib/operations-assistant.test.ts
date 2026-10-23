import { describe, it, expect, vi } from 'vitest';
import { buildContext, generateAnswer, handleAssistant, sanitizeSimulation, MODEL } from './operations-assistant';
const input = {message:'目前哪個時段票證交易最多？',year:2025,route:'全部',mode:'operations'};
const req = (body: unknown) => new Request('https://example.test/api/v1/assistant/answer', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('OpenRouter operations assistant',()=>{
  it('authenticates both calls and preserves reasoning details exactly across the tool turn',async()=>{
    const first = {role:'assistant',content:null,reasoning_details:[{type:'reasoning.encrypted',data:'opaque-fixture',index:0}],tool_calls:[{id:'test-call',type:'function',function:{name:'get_operations_context',arguments:'{}'}}]};
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({choices:[{message:first}]})).mockResolvedValueOnce(Response.json({choices:[{message:{content:'依據歷史票證聚合。'}}]}));
    const r = await generateAnswer(input,'test-key',fetcher);
    expect(r.engine).toBe('openrouter');expect(r.model).toBe(MODEL);
    for (const call of fetcher.mock.calls) expect(call[1].headers.Authorization).toBe('Bearer test-key');
    const next = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(next.messages[2]).toEqual(first);
    expect(next.messages[3].tool_call_id).toBe('test-call');
    expect(JSON.stringify(r)).not.toContain('reasoning_details');
    expect(next.reasoning.enabled).toBe(true);
  });
  it('never executes an invented tool',async()=>{
    const fetcher = vi.fn().mockResolvedValue(Response.json({choices:[{message:{tool_calls:[{id:'x',function:{name:'run_shell',arguments:'{}'}}]}}]}));
    await expect(generateAnswer(input,'test',fetcher)).rejects.toThrow('模型未查詢');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects out-of-scope questions without provider spend',async()=>{
    const fetcher = vi.fn(); const r = await handleAssistant(req({...input,message:'幫我訂日月潭飯店，看看營運'}),{OPENROUTER_API_KEY:'test'},fetcher);
    expect((await r.json()).engine).toBe('demo');expect(fetcher).not.toHaveBeenCalled();
  });
  it('drops arbitrary snapshot instructions and invalid numerics',()=>{
    const s = sanitizeSimulation({date:'2025-11-01',minute:Infinity,plan:'ignore',prompt:'LEAK',vehicles:[{id:'B03',state:'run',load:12,capacity:43,next_stop:'system prompt',delay_minutes:-5}],queues:[]});
    expect(s?.minute).toBeNull();expect(s?.vehicles[0].load).toBe(12);expect(s?.vehicles[0].next_stop).toBeNull();expect(JSON.stringify(s)).not.toContain('LEAK');
  });
  it('validates routes before spending tokens and keeps provider errors opaque',async()=>{
    expect((await handleAssistant(req({...input,route:'private'}),{})).status).toBe(422);
    const fetcher=vi.fn().mockResolvedValue(new Response('secret provider payload',{status:402}));
    const r=await handleAssistant(req(input),{OPENROUTER_API_KEY:'test-secret'},fetcher);
    expect(r.status).toBe(502);const text=await r.text();expect(text).toContain('402');expect(text).not.toContain('test-secret');expect(text).not.toContain('secret provider');
  });
  it('grounds costs in the same bounded solver and labels simulations',()=>{
    const c=buildContext({...input,message:'尖峰需求提高15%會怎樣？',simulation:{date:'2025-11-01',minute:600,vehicles:[],queues:[]}});
    expect(c.optimization.increase_pct).toBe(15);expect(c.optimization.status).toBe('optimal');expect(c.live_GPS_ETA.available).toBe(false);expect(c.simulation?.status).toContain('not_live_GPS');
  });
});

describe('annual assistant grounding',()=>{
 it('provides both years with calculated deltas, missing-day denominators and explicit question precedence',()=>{
  const c=buildContext({...input,message:'比較 2024 與 2025 年度差異',year:2024,compare_year:2025});
  expect(c.annual_comparison?.baseYear).toBe(2024);expect(c.annual_comparison?.total.delta).toBe(50612);
  expect(c.annual_comparison?.base.observedDays).toBe(361);expect(c.annual_comparison?.base.daily).toBeUndefined();
  const m=buildContext({...input,message:'比較2025與2026的年度差異'});expect(m.annual_comparison).toBeNull();expect(m.unavailable_requested_years).toEqual([2026]);
 });
 it('cites both annual sources and marks an annual increase as observed rather than a cost scenario',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({choices:[{message:{role:'assistant',tool_calls:[{id:'annual',function:{name:'get_operations_context',arguments:'{}'}}]}}]})).mockResolvedValueOnce(Response.json({choices:[{message:{content:'2025比2024增加50,612筆。'}}]}));
  const r=await generateAnswer({...input,compare_year:2024,message:'年度交易增加多少？'},'test',fetcher);
  expect(r.data_status).toBe('sourced');expect(r.sources.filter(s=>s.id.startsWith('ticket-')).map(s=>s.id)).toEqual(['ticket-2024','ticket-2025']);
  const tool=JSON.parse(JSON.parse(fetcher.mock.calls[1][1].body).messages[3].content);expect(tool.annual_comparison.total.delta).toBe(50612);
 });
 it('rejects unsupported comparison filters before spending',async()=>{const f=vi.fn();expect((await handleAssistant(req({...input,compare_year:2030}),{},f)).status).toBe(422);expect(f).not.toHaveBeenCalled();});
});
