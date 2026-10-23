import {it,expect,vi} from 'vitest';
import {askTransitAssistant} from './dataClient';
it('sends a first-use question through the client scope gate',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({answer:'先看營運總覽',engine:'openrouter',sources:[{id:'site-guide',title:'手冊',status:'documented_method'}],suggested_actions:[],request_id:'test-guide'}));
 const result=await askTransitAssistant({message:'我是第一次使用，請帶我導覽網站',year:2025,route:'全部'},fetcher);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(result.sources[0].status_label).toBe('操作與方法文件');
});
it('returns explicitly local guidance when the API is offline',async()=>{
 const r=await askTransitAssistant({message:'我是第一次使用，請帶我導覽網站',year:2025,route:'全部'},vi.fn().mockRejectedValue(Error('offline')));
 expect(r.engine).toBe('demo');expect(r.answer).toContain('非LLM');expect(r.sources[0].id).toBe('site-guide');
});
