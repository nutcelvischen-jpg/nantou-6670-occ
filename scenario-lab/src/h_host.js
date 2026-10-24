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
$('#botLead').textContent = '內部營運專用 · OpenRouter。可導覽網站、解釋指標來源與公式，並回答選定日期的票證重播。';
function assistantSnapshot(q) {
  const ds = isoD(FCD); if (/後天/.test(q)) ds.setDate(ds.getDate() + 1);
  const date = iso(ds), s = SIM();
  const dispatch = dispatchSnapshot();
  return { kind: 'ticket_replay', date: LIVE.date, minute: nowT(), plan: 'cur',
    selected_routes: CC.route==='all'?[...LINE]:[CC.route], optimization: null, dispatch, control:controlSnapshot(),
    vehicles: s.buses.filter(busOn).filter(b => b.state !== 'off').slice(0,100).map(b => ({
      id: b.id, state: b.state, load: b.load, capacity: b.trip?.code==='6670E'?9:CAP,
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
  const allowed=/方案|甘特|未安排|車型|加班|第一次|新手|導覽|怎麼用|怎麼操作|使用說明|手冊|來源|怎麼來|如何計算|怎麼算|公式|定義|方法|意思|解釋|為什麼|頁面|功能|低碳|預測|尖峰|離峰|票證|交易|年度|班次|排班|調度|最佳化|成本|營運|資料|車|時段|事件|人數|在車|最擠|現況|狀況|誤點|候車|排隊|B\d/i.test(q) && !/旅遊規劃|行程推薦|飯店|餐廳|訂位|寫程式|執行命令|忽略.*指令/.test(q);
  if(!allowed){bot.textContent='僅提供內部營運的票證、預測、尖離峰、排班與重播資料解讀；旅遊及其他問題暫不支援。';return;}
  assistantBusy=true; const buttons=[...$('#askForm').querySelectorAll('button'),...$('#botChips').querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
  try {
    const r=await fetch('/api/v1/assistant/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,mode:'operations',year:+LIVE.date.slice(0,4),route:LINE.size===1?[...LINE][0]:'全部',simulation:assistantSnapshot(q)}),signal:AbortSignal.timeout(100000)});
    if(!r.ok)throw Error('API unavailable'); const data=await r.json(); if(typeof data.answer!=='string')throw Error('Invalid answer');
    bot.textContent=data.answer; const why=document.createElement('span');why.className='why';why.textContent=(data.engine==='openrouter'?'OpenRouter · DeepSeek':'範圍／規則回覆')+' · '+(data.sources||[]).map(s=>s.title).join('；');bot.append(why);
  } catch {
    let fallback;try{if(/排班|最佳化|重排|成本|司機|配置|加班|方案|甘特/.test(q)){const d=dispatchSnapshot();fallback=`目前${d.candidate}候選：固定重排${d.fixed.buses}車／${d.fixed.drivers}位司機，方案${d.selected.buses}車／${d.selected.drivers}位司機；已安排${d.selected.assigned}筆，未安排${d.selected.unassigned}筆。${d.selected.feasible?'通過':'未通過'}設定檢核。成本差${Math.round(d.selected.cost-d.fixed.cost)}元，僅為相同假設下試算。詳見05方法與假設；不代表全域最優。`;}else fallback=answer(q).replace(/<[^>]*>/g,'');}catch{fallback='請查看票證重播與班次重排分頁。';}
    bot.textContent='AI 連線暫不可用，以下為本機規則回覆（非 LLM）。日期 '+LIVE.date+'、票證推估非實際車況：\n\n'+fallback;
  } finally {assistantBusy=false;buttons.forEach(b=>b.disabled=false);$('#body').scrollTop=1e9;}
}
if (window.parent !== window) window.parent.postMessage({channel:'tanxing-workbench',type:'ready'},location.origin);
