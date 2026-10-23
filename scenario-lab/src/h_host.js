/* Host integration: read-only replay snapshot, never raw ticket identifiers. */
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.channel !== 'tanxing-workbench') return;
  if (event.data.type === 'visibility' && typeof event.data.active === 'boolean') {
    workbenchActive = event.data.active;
    if (workbenchActive) { resize(); refreshUI(true); }
  }
  if (event.data.type === 'panel') setTab(event.data.panel);
});
$('#reset').onclick = () => { LIVE.paused = true; $('#play').textContent = '播放'; buildLive(390); };
$('#seekGo').onclick = () => { const v = $('#seek').value; if (!/^\d{2}:\d{2}$/.test(v)) return; LIVE.paused = true; $('#play').textContent = '播放'; jumpTo(hm(v)); };
const linkedPanel = new URLSearchParams(location.search).get('panel');
if (PANELS.includes(linkedPanel)) setTab(linkedPanel);
$('#botLead').textContent = '內部營運專用 · OpenRouter。回答選定日期的票證重播與需求分析；不提供旅遊規劃。';
function assistantSnapshot(q) {
  const ds = isoD(FCD); if (/後天/.test(q)) ds.setDate(ds.getDate() + 1);
  const date = iso(ds), s = SIM();
  const r = /排班|最佳化|重排|成本|司機|配置|加班|併班/.test(q) ? optimizeDay(LIVE.date) : null;
  const optimization = r ? {trips:r.base.T.length,base_buses:r.base.buses,replanned_buses:r.re.buses,base_crews:r.base.duties.length,replanned_crews:r.re.duties.length,base_cost:r.base.cost.total,replanned_cost:r.re.cost.total,remaining_rule_violations:r.re.duties.filter(d=>d.bad).length,drive_limit:RULE.drive,continuous_limit:RULE.cont,rest_minutes:RULE.rest,span_limit:RULE.span,turn_minutes:RULE.turn,scenario_growth:SCN.growth,scenario_shift:SCN.shift,scenario_buses:r.opt.buses,scenario_crews:r.opt.duties.length,scenario_added:r.opt.added.length,scenario_merged:r.opt.merged.length} : null;
  return { kind: 'ticket_replay', date: LIVE.date, minute: nowT(), plan: 'cur',
    selected_routes: [...LINE], optimization,
    vehicles: s.buses.filter(busOn).filter(b => b.state !== 'off').slice(0,100).map(b => ({
      id: b.id, state: b.state, load: b.load, capacity: CAP,
      delay_minutes: null, next_stop: b.trip?.ev.find(e => e.t > s.t)?.z ?? b.term,
    })), queues: [],
    forecast: [0,1].map(dir => { const f=forecast(date,dir); return {date,direction:dir?'in':'out',mean:f.mean,low:f.lo,high:f.hi}; }),
  };
}
let assistantBusy = false;
async function ask(q) {
  q=q.trim(); if (!q || assistantBusy) return;
  const box=$('#chat'), user=document.createElement('div'), bot=document.createElement('div');
  user.className='msg me'; user.textContent=q; bot.className='msg bot'; bot.textContent='正在查詢營運資料…'; box.append(user,bot);
  if (q.length>2000) {bot.textContent='請將問題縮短至 2000 字內。';return;}
  const allowed=/預測|尖峰|離峰|票證|交易|年度|班次|排班|調度|最佳化|成本|營運|資料|車|時段|事件|人數|在車|最擠|現況|狀況|誤點|候車|排隊|B\d/i.test(q) && !/旅遊|飯店|餐廳|訂位|寫程式|執行命令|忽略.*指令/.test(q);
  if(!allowed){bot.textContent='僅提供內部營運的票證、預測、尖離峰、排班與重播資料解讀；旅遊及其他問題暫不支援。';return;}
  assistantBusy=true; const buttons=[...$('#askForm').querySelectorAll('button'),...$('#botChips').querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
  try {
    const r=await fetch('/api/v1/assistant/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,mode:'operations',year:+LIVE.date.slice(0,4),route:LINE.size===1?[...LINE][0]:'全部',simulation:assistantSnapshot(q)}),signal:AbortSignal.timeout(100000)});
    if(!r.ok)throw Error('API unavailable'); const data=await r.json(); if(typeof data.answer!=='string')throw Error('Invalid answer');
    bot.textContent=data.answer; const why=document.createElement('span');why.className='why';why.textContent=(data.engine==='openrouter'?'OpenRouter · DeepSeek':'範圍／規則回覆')+' · '+(data.sources||[]).map(s=>s.title).join('；');bot.append(why);
  } catch {
    let fallback;try{fallback=answer(q).replace(/<[^>]*>/g,'');}catch{fallback='請查看票證重播與班次重排分頁。';}
    bot.textContent='AI 連線暫不可用，以下為本機規則回覆（非 LLM）。日期 '+LIVE.date+'、票證推估非實際車況：\n\n'+fallback;
  } finally {assistantBusy=false;buttons.forEach(b=>b.disabled=false);$('#body').scrollTop=1e9;}
}
if (window.parent !== window) window.parent.postMessage({channel:'tanxing-workbench',type:'ready'},location.origin);
