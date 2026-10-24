/* Control-center presentation adapter. No demand generation and no second clock. */
const CC={mode:'history',route:'all',row:null,trip:null,event:null,ghost:false,follow:false,signature:'',rows:[],events:[],result:null,visuals:new Map(),frame:[]};
const ccApp=document.querySelector('.app');
const ccNav=$('#tabs');ccNav.classList.add('cc-nav');ccApp.before(ccNav);ccNav.querySelector('[data-t="ops"]').innerHTML='<span class="n">01</span>行控重播';
function ccMount(cls,html){const el=document.createElement('section');el.className='cc '+cls;el.innerHTML=html;ccApp.append(el);return el;}
ccMount('cc-top',`<div class="cc-controls"><div class="cc-title"><small>TANXING / OPERATIONS CONTROL</small><b>6670 行控工作台</b></div><label>營運日 <input id="ccDate" type="date" min="${RDAYS[0]}" max="${RDAYS.at(-1)}" value="${LIVE.date}"></label><label>資料模式 <select id="ccMode"><option value="history">歷史票證重播</option><option value="fixed">固定車次重排</option><option value="scenario">子線調度方案</option></select></label><span class="cc-clock" id="ccClock"></span><button id="ccPlay">播放</button><label>速度 <select id="ccSpeed"><option value="60">×60</option><option value="180">×180</option><option value="360" selected>×360</option><option value="720">×720</option></select></label></div><div class="cc-mode-note" id="ccModeNote"></div><div class="cc-kpis" id="ccKpis"></div><div class="cc-error" id="ccError" role="alert"></div>`);
ccMount('cc-left',`<h2>路線與事件</h2><label>子線 <select id="ccRoute"><option value="all">全網</option>${LINE_CODES.map(r=>`<option>${r}</option>`).join('')}</select></label><details><summary>各子線全日班次</summary><div id="ccRoutes"></div></details><h2 style="margin-top:18px">全日事件 <small id="ccEventCount"></small></h2><small>點擊事件定位時間與班次；未來事件也是歷史回放資料，並非預警預測。</small><div id="ccEvents"></div>`);
ccMount('cc-right',`<h2>選取對象</h2><div id="ccDetail"></div><div class="cc-actions"><button id="ccLocate">定位車輛</button><button id="ccFollow" aria-pressed="false">跟隨車輛</button><button id="ccAsk">問小幫手</button></div><h2 style="margin-top:20px">同日方案對照</h2><div id="ccCompare"></div><label><input type="checkbox" id="ccGhost">顯示歷史車輛影像</label><button id="ccParameters" style="margin-top:10px">開啟 05 方案與參數</button><details style="margin-top:14px"><summary>怎麼閱讀這個畫面？</summary><p>事件 → 班次 → 地圖 → 甘特圖共用同一時間。歷史車輛為當日匿名編號；方案 V 編號是模型工作鏈，兩者不代表同一台實車。</p><p>實心藍為候選班次、橙色為新增、虛線邊框為調時。灰色歷史影像不計入方案指標。空駛只在甘特圖顯示，不虛構其道路位置。</p><p>歷史在車量由上下車刷卡還原；方案在車量由 OD 容量分配。沒有觀測到的候車人數、誤點與零刷卡班次保持未知。</p></details>`);
ccMount('cc-bottom',`<button id="ccCollapse" aria-expanded="true" style="align-self:flex-start;padding:2px 7px">▾ 車輛甘特圖 · 點色塊定位班次</button><div class="cc-timeline"><span>05:00</span><input id="ccSeek" aria-label="共用重播時間" type="range" min="300" max="1470" step="1" value="390"><span>24:30</span><output id="ccTime"></output></div><div class="cc-legend">藍：載客　橙：新增　紫：空駛　米：折返　綠：可休息　灰：空檔　紅線：目前時間</div><div class="cc-gantt" id="ccGantt"></div>`);
const ccMapNote=document.createElement('div');ccMapNote.className='cc-map-note';$('#stage').append(ccMapNote);
function ccActive(){return TAB==='ops';}
function ccSelectedResult(){return CC.mode==='history'?null:CC.mode==='fixed'?DISPATCH_RESULT.fixed:DISPATCH_RESULT.options.find(x=>x.id===DISPATCH_SELECTED);}
function ccSyncData(){
 if(!DISPATCH_RESULT||DISPATCH_RESULT.date!==LIVE.date)dispatchRender();
 const sig=[LIVE.date,CC.mode,CC.route,DISPATCH_RESULT.signature,DISPATCH_SELECTED].join('|');
 if(CC.signature===sig)return;CC.signature=sig;CC.result=ccSelectedResult();
 CC.rows=controlRows(SIM().trips,CC.result).map(r=>({...r,trips:r.trips.filter(t=>CC.route==='all'||t.code===CC.route),segments:r.segments.filter(s=>CC.route==='all'||r.trips.some(t=>t.id===s.trip&&t.code===CC.route))})).filter(r=>r.trips.length);
 CC.events=controlEvents(SIM().trips,CC.result).filter(e=>CC.route==='all'||!e.route||e.route===CC.route);
 if(!CC.rows.some(r=>r.id===CC.row)){CC.row=null;CC.trip=null;CC.follow=false;}
 ccDrawGantt();ccDrawEvents();
 $('#ccRoutes').innerHTML=LINE_CODES.map(code=>{const ts=(CC.result?.T||SIM().trips).filter(t=>t.code===code);return `<div class="cc-route"><span>${code}</span><span>${ts.length} 班 <small>全日</small></span></div>`;}).join('');
}
function ccDrawEvents(){
 $('#ccEventCount').textContent=CC.events.length+' 件';
 $('#ccEvents').innerHTML=CC.events.length?CC.events.map((e,i)=>`<button class="cc-event" data-kind="${e.kind}" data-ce="${i}" aria-pressed="${CC.event===e.id}"><small>${e.minute==null?'全日條件':fmt(Math.ceil(e.minute))} · ${escD(e.source)}</small>${escD(e.label)}</button>`).join(''):'<p class="cc-note">目前篩選沒有列出的容量／資料事件；不代表已驗證所有營運狀況。</p>';
}
function ccDrawGantt(){
 const percent=t=>(t-300)/1170*100;
 $('#ccGantt').innerHTML=`<div class="cc-gantt-inner"><div class="cc-ticks">${[5,8,11,14,17,20,24].map(h=>`<span style="position:absolute;left:${(h*60-300)/1170*100}%">${h}:00</span>`).join('')}</div>${CC.rows.map((r,i)=>`<div class="cc-track"><span>${r.id}</span>${r.segments.map((s,j)=>{const t=r.trips.find(t=>t.id===s.trip);return `<button data-cr="${i}" data-cs="${j}" class="${s.kind} ${t?.shifted?'shifted':''}" aria-label="${escD(`${r.id} ${s.route||t?.code||''} ${{trip:'載客',added:'新增',empty:'空駛',turn:'折返',rest:'可休息',idle:'空檔'}[s.kind]} ${fmt(s.start)}–${fmt(s.end)}`)}" title="${escD(`${r.id} ${s.route||t?.code||''} ${fmt(s.start)}–${fmt(s.end)}`)}" style="left:${Math.max(0,percent(s.start))}%;width:${Math.max(.1,Math.min(100,percent(s.end))-Math.max(0,percent(s.start)))}%"></button>`}).join('')}</div>`).join('')}<i class="cc-now" id="ccNow"></i></div>`;
}
function ccChoose(row,trip,minute,focus=true){
 CC.row=row;CC.trip=trip;CC.segment=null;CC.follow=false;LIVE.paused=true;$('.cc-right').scrollTop=0;
 if(minute!=null)jumpTo(Math.ceil(minute));
 if(CC.mode==='history'){const old=CC.event;select(row);CC.event=old;CC.trip=trip;}
 ccRefresh();if(focus)ccLocate();
 const r=CC.rows.findIndex(r=>r.id===row),j=CC.rows[r]?.segments.findIndex(s=>s.trip===trip);
 const track=$('#ccGantt').querySelector(`[data-cr="${r}"][data-cs="${j}"]`)?.parentElement;if(track)$('#ccGantt').scrollTop=Math.max(0,track.offsetTop-40);
}
function ccLocate(){CC.pendingFocus=true;}
function ccResolveFocus(){
 if(!CC.pendingFocus)return;CC.pendingFocus=false;
 const v=CC.mode==='history'?VIS[CC.row]:CC.visuals.get('plan:'+CC.row);
 if(!v?.root.visible)return;const target=v.root.position.clone();flyTo(target,target.clone().add(new THREE.Vector3(.22,.18,.27)));
}
function ccRefresh(){
 if(!ccActive())return;ccSyncData();const minute=nowT(),planned=!!CC.result;
 const active=CC.rows.map(r=>({r,t:controlTripAt(r.trips,minute)})).filter(x=>x.t);
 const inVehicle=active.reduce((s,x)=>s+controlLoad(x.t,minute,planned),0),done=CC.rows.flatMap(r=>r.trips).filter(t=>t.arr<=minute).length;
 const capEvents=active.filter(({t})=>controlLoad(t,minute,planned)>=(planned?t.cap:t.code==='6670E'?9:43)).length;
 $('#ccClock').textContent=fmt(minute);$('#ccTime').textContent=fmt(minute);$('#ccSeek').value=minute;$('#ccDate').value=LIVE.date;$('#ccPlay').textContent=LIVE.paused?'▶ 播放':'Ⅱ 暫停';
 $('#ccModeNote').textContent=planned?`${CC.mode==='fixed'?'固定車次重排':CC.result.label} · ${DISPATCH_RESULT.version} · 方案位置為線形內插；不是即時 GPS`:`2024–2025 電子票證 · ${LIVE.date} · 推估車次與刷卡站時刻內插；不是即時 GPS`;
 ccMapNote.hidden=!ccActive();ccMapNote.textContent=planned?'方案演練 · 橙色新增／虛線調時 · 灰色為歷史對照 · 空駛路徑未知，僅列甘特圖':'歷史票證重播 · 位置依前後刷卡站內插 · 車上量只含可還原的票證';
 $('#ccKpis').innerHTML=[['目前行駛班次',active.length,'依選取子線'],[planned?'配置在車量':'票證在車量',inVehicle,planned?'OD分配／人次':'推估／非全部旅客'],['完成班次',done,'目前時間以前'],['達到設定容量',capEvents+' 班',planned?'車型容量假設':'E 9座／其餘43座假設'],[planned?'全日未安排需求':'定位不足班次',planned?CC.result.unassigned:CC.rows.flatMap(r=>r.trips).filter(t=>!t.ok).length,planned?'全網／不等於拒載':'所選子線／資料品質']].map(([a,b,c])=>`<div><span>${a}</span><strong>${typeof b==='number'?dNum(b):b}</strong><span>${c}</span></div>`).join('');
 // dNum only accepts numeric metrics; units remain visible.
 $('#ccKpis').children[3].querySelector('strong').textContent=capEvents+' 班';
 const r=CC.rows.find(r=>r.id===CC.row);if(CC.follow&&r){const current=controlTripAt(r.trips,minute);if(current)CC.trip=current.id;}const t=r?.trips.find(t=>t.id===CC.trip)|| (r&&controlTripAt(r.trips,minute));
 const ev=CC.events.find(e=>e.id===CC.event);
 if(t){
   const cap=planned?t.cap:t.code==='6670E'?9:43,load=controlLoad(t,minute,planned),stops=planned?t.stops:t.ev.map(e=>({t:e.t,z:e.z})),prev=stops.filter(s=>s.t<=minute).at(-1),next=stops.find(s=>s.t>minute),running=t.dep<=minute&&minute<t.arr;
   $('#ccDetail').innerHTML=`<span class="cc-badge">${planned?'方案工作鏈':'歷史匿名車輛'} ${escD(r.id)}</span><h2 style="margin-top:12px">${t.code} · ${t.dir?'往台中':'往南投／埔里'}</h2><small>${escD(t.id)} · ${t.added?'新增班次':t.shifted?'調時班次':'保留班次'}</small><div class="cc-facts"><div><small>${planned?'配置':'票證'}在車量</small><strong>${running?load:'—'} <small>／${cap}座</small></strong></div><div><small>全班峰值</small><strong>${planned?t.peak:t.peak}</strong></div><div><small>發車代理時刻</small><strong>${fmt(t.dep)}</strong></div><div><small>末站代理時刻</small><strong>${fmt(t.arr)}</strong></div></div><p>${running?`${ZNAME[prev?.z]||'起站'} → ${ZNAME[next?.z]||'終站'}`:minute<t.dep?'尚未到此班時段':'此班時段已結束'}</p><p class="cc-note">${ev?escD(ev.label):'點甘特圖切換班次、拖曳時間軸觀察在車量。'}<br>${planned?'已分配旅客依計費站上下車更新。未安排需求另列，不能當成實際拒載。':'班次、在車量與時刻來自票證還原；不是即時定位或實際誤點紀錄。'}</p>`;
 }else $('#ccDetail').innerHTML=`<p class="cc-note">${ev?escD(ev.label):'選取左側事件、地圖車輛，或下方甘特圖色塊。'}</p><small>${ev&&ev.minute==null?'全日條件沒有可定位的時間與單一車輛。':'事件與車輛將同步顯示在這裡。'}</small>`;
 if(CC.segment&&['empty','turn','rest','idle'].includes(CC.segment.kind))$('#ccDetail').insertAdjacentHTML('afterbegin',`<p class="cc-note">選取時段：${({empty:'估計空駛（路徑未知，不畫位置）',turn:'端點折返',rest:'可休息空檔（非實際休息紀錄）',idle:'未配置空檔'}[CC.segment.kind])} ${fmt(CC.segment.start)}–${fmt(CC.segment.end)}。以下為銜接班次。</p>`);
 $('#ccFollow').setAttribute('aria-pressed',String(CC.follow));$('#ccLocate').disabled=!r;$('#ccFollow').disabled=!r;
 const x=DISPATCH_RESULT.options.find(x=>x.id===DISPATCH_SELECTED),f=DISPATCH_RESULT.fixed;
 $('#ccCompare').innerHTML=`<span class="cc-badge ${x.feasible?'':'warn'}">${x.feasible?'通過設定檢核':'未通過設定檢核 · 僅供演練'}</span><p>${escD(x.label)} · ${DSPEC.direction===1?'往台中':DSPEC.direction===0?'往南投':'雙向'} ${DSPEC.startHour}–${DSPEC.endHour}時</p><div class="cc-facts"><div><small>成本差／固定重排</small><strong>${money(x.cost.total-f.cost.total)}</strong></div><div><small>未安排／全日全網</small><strong>${f.unassigned} → ${x.unassigned}</strong></div></div><small>車輛 ${f.buses} → ${x.buses}；司機配置 ${f.drivers} → ${x.drivers}。有限候選，非全域最優。方向、容量、改搭與車隊上限見 05。</small>`;
 $('#ccGhost').disabled=!planned;
 const now=$('#ccNow');if(now)now.style.left=`calc(66px + (100% - 66px) * ${(minute-300)/1170})`;
 $('#ccGantt').querySelectorAll('[data-cr]').forEach(b=>{const r=CC.rows[+b.dataset.cr],s=r.segments[+b.dataset.cs];b.classList.toggle('selected',r.id===CC.row&&s.trip===CC.trip);});
 $('#ccEvents').querySelectorAll('[data-ce]').forEach(b=>b.setAttribute('aria-pressed',String(CC.events[+b.dataset.ce]?.id===CC.event)));
}
function ccPose(tr,minute,planned){
 const original=planned?SIM().trips.find(t=>t.id===(tr.sourceId||tr.id)):tr;
 if(!original?.ok)return null;
 const anchors=planned?original.anchors.map(a=>{const s=tr.stops.find(s=>s.z===a.z);return {...a,t:s?.t??a.t+(tr.dep-original.dep)};}):original.anchors;
 const temp={...original,anchors};pathPoint(original.path,rpD(temp,minute),_st);
 return {pos:_st.pos.clone(),yaw:Math.atan2(-_st.dir.z,_st.dir.x)};
}
function ccVisual(key,ghost){
 if(CC.visuals.has(key))return CC.visuals.get(key);
 const root=BUS_T.grp.clone(true);root.traverse(o=>{if(o.isMesh||o.isLineSegments){o.material=o.material.clone();if(ghost){o.material.transparent=true;o.material.opacity=.22;o.material.depthWrite=false;}}});scene.add(root);root.userData.ccrow=key;
 const ring=new THREE.Mesh(new THREE.RingGeometry(5,6,32),new THREE.MeshBasicMaterial({color:0x6e87a2,transparent:true,opacity:ghost?.15:.6,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.1;root.add(ring);
 const label=document.createElement(ghost?'span':'button');label.className='cc-map-label';label.hidden=true;labelsEl.append(label);
 if(!ghost)label.onclick=()=>{const row=CC.rows.find(r=>r.id===key.slice(5)),t=row&&controlTripAt(row.trips,nowT());if(row&&t)ccChoose(row.id,t.id,null,false);};
 const v={root,label,ring};CC.visuals.set(key,v);return v;
}
function ccDrawVehicles(){
 for(const v of CC.visuals.values()){v.root.visible=false;v.label.hidden=true;}CC.frame=[];
 if(!ccActive()||!CC.result)return;
 for(const v of Object.values(VIS)){v.root.visible=false;v.mk.style.display='none';v.mk.dataset.vis='0';}
 const sources=CC.rows.map(r=>({r,t:controlTripAt(r.trips,nowT()),ghost:false}));
 if(CC.ghost)for(const r of controlRows(SIM().trips))sources.push({r,t:controlTripAt(r.trips.filter(t=>CC.route==='all'||t.code===CC.route),nowT()),ghost:true});
 for(const {r,t,ghost} of sources){if(!t)continue;const p=ccPose(t,nowT(),!ghost);if(!p)continue;
   const v=ccVisual((ghost?'ghost:':'plan:')+r.id,ghost);v.root.visible=true;const mag=clamp(camera.position.distanceTo(p.pos)*.42,3,40);v.root.scale.setScalar(mag*.001);v.root.position.copy(p.pos);v.root.position.y+=mag*.00012;v.root.rotation.y=p.yaw;
   v.ring.material.color.set(t.added?'#d39853':t.shifted?'#8d73a5':'#6e87a2');v.label.textContent=(ghost?'歷史 ':'')+r.id+(t.added?' ＋':'');v.label.className='cc-map-label'+(ghost?' ghost':t.added?' added':t.shifted?' shifted':'')+(CC.row===r.id&&!ghost?' selected':'');CC.frame.push(v);
   if(CC.follow&&CC.row===r.id&&!ghost){const d=p.pos.clone().sub(controls.target).multiplyScalar(.12);controls.target.add(d);camera.position.add(d);}
 }
}
const ccOldVehicles=updateVehicles;updateVehicles=function(a){ccOldVehicles(a);if(ccActive()){for(const b of SIM().buses){const v=VIS[b.id];if(v&&b.trip&&b.trip.arr<=nowT()){v.root.visible=false;v.mk.dataset.vis='0';}if(v&&CC.route!=='all'&&!(b.trip?b.trip.code===CC.route:b.plan.some(t=>t.code===CC.route))){v.root.visible=false;v.mk.dataset.vis='0';}}}ccDrawVehicles();ccResolveFocus();};
const ccOldLabels=placeLabels;placeLabels=function(w,h){ccOldLabels(w,h);if(!ccActive()||!CC.result)return;for(const v of Object.values(VIS))v.mk.style.display='none';for(const L of LABELS)L.el.querySelectorAll('em').forEach(e=>e.textContent='');for(const v of CC.frame){const p=v.root.position.clone().project(camera);v.label.hidden=p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;v.label.style.transform=`translate(${(p.x*.5+.5)*w}px,${(-p.y*.5+.5)*h}px) translate(-50%,-100%)`;}};
const ccOldRefresh=refreshUI;refreshUI=function(force){ccOldRefresh(force);ccRefresh();};
const ccOldSelect=select;select=function(id){ccOldSelect(id);if(ccActive()&&CC.mode==='history'){CC.row=id;CC.trip=SIM().buses.find(b=>b.id===id)?.trip?.id||null;CC.event=null;CC.follow=false;ccRefresh();}};
const ccOldTab=setTab;setTab=function(t){ccOldTab(t);ccApp.classList.toggle('cc-active',t==='ops');document.querySelectorAll('.cc').forEach(e=>e.hidden=t!=='ops');ccMapNote.hidden=t!=='ops';if(t==='ops'){LINE.clear();(CC.route==='all'?LINE_CODES:[CC.route]).forEach(c=>LINE.add(c));applyLines();}if(t!=='ops'){for(const v of CC.visuals.values()){v.root.visible=false;v.label.hidden=true;}}else ccRefresh();requestAnimationFrame(resize);};
$('#ccPlay').onclick=()=>{LIVE.paused=!LIVE.paused;ccRefresh();};$('#ccSpeed').onchange=e=>LIVE.speed=+e.target.value;
$('#ccSeek').oninput=e=>{LIVE.paused=true;jumpTo(+e.target.value);ccRefresh();};
$('#ccDate').onchange=e=>{if(!RDAYS.includes(e.target.value)){$('#ccError').textContent='這一天沒有票證重播資料，請選其他營運日。';e.target.value=LIVE.date;return;}$('#ccError').textContent='';CC.row=CC.trip=CC.event=CC.segment=null;$('#day').value=e.target.value;$('#day').onchange();ccRefresh();};
$('#ccMode').onchange=e=>{CC.mode=e.target.value;CC.row=CC.trip=CC.event=CC.segment=null;CC.follow=false;LIVE.follow=false;LIVE.sel=null;ccRefresh();};
$('#ccRoute').onchange=e=>{CC.route=e.target.value;CC.row=CC.trip=CC.event=CC.segment=null;LINE.clear();(CC.route==='all'?LINE_CODES:[CC.route]).forEach(c=>LINE.add(c));applyLines();ccRefresh();};
$('#ccGhost').onchange=e=>CC.ghost=e.target.checked;
$('#ccEvents').onclick=e=>{const b=e.target.closest('[data-ce]');if(!b)return;const ev=CC.events[+b.dataset.ce];CC.event=ev.id;const row=CC.rows.find(r=>r.trips.some(t=>t.id===ev.trip));ccChoose(row?.id||null,ev.trip,ev.minute);};
$('#ccGantt').onclick=e=>{const b=e.target.closest('[data-cr]');if(!b)return;const row=CC.rows[+b.dataset.cr],seg=row.segments[+b.dataset.cs];CC.event=null;ccChoose(row.id,seg.trip,seg.start);CC.segment=seg;ccRefresh();};
$('#ccLocate').onclick=ccLocate;$('#ccFollow').onclick=()=>{CC.follow=!CC.follow;if(CC.mode==='history'){LIVE.follow=CC.follow;LIVE.sel=CC.row;}ccRefresh();};
$('#ccParameters').onclick=()=>setTab('opt');
$('#ccCollapse').onclick=()=>{const folded=ccApp.classList.toggle('cc-collapsed');$('#ccCollapse').setAttribute('aria-expanded',String(!folded));$('#ccCollapse').textContent=(folded?'▸':'▾')+' 車輛甘特圖 · 點色塊定位班次';resize();};
$('#ccAsk').onclick=()=>{const mode=CC.mode==='history'?'歷史票證重播':CC.mode==='fixed'?'固定車次重排':'子線調度方案',e=CC.events.find(e=>e.id===CC.event);const q=`請解釋行控工作台 ${LIVE.date} ${fmt(nowT())} 的${mode}。${CC.row?'我選了'+CC.row+'／'+(CC.trip||'')+'。':''}${e?'事件：'+e.label+'。':''}請說明這些數據的來源、假設與處理建議，不要把方案當成即時實況。`;setTab('bot');ask(q);};
const ccPreview=document.createElement('button');ccPreview.className='btn';ccPreview.textContent='在行控地圖預覽此方案';ccPreview.onclick=()=>{CC.mode='scenario';$('#ccMode').value='scenario';CC.signature='';CC.row=CC.trip=CC.event=CC.segment=null;CC.route='all';$('#ccRoute').value='all';LIVE.paused=true;setTab('ops');const added=CC.result.T.find(t=>t.added)||CC.result.T.find(t=>t.shifted)||CC.result.T.find(t=>t.code==='6670'+DSPEC.scenario);if(added){const row=CC.rows.find(r=>r.trips.some(t=>t.id===added.id));if(row)ccChoose(row.id,added.id,added.dep);}};$('#dispatchStatus').after(ccPreview);
$('#views').addEventListener('click',()=>{CC.follow=false;});
renderer.domElement.addEventListener('pointerdown',()=>{CC.follow=false;});
renderer.domElement.addEventListener('pointerup',e=>{if(!ccActive()||!CC.result||!downXY||Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1])>5)return;const hit=ray.intersectObjects([...CC.visuals.entries()].filter(([k,v])=>k.startsWith('plan:')&&v.root.visible).map(([,v])=>v.root),true)[0];if(!hit)return;let o=hit.object;while(o&&!o.userData.ccrow)o=o.parent;if(o){const row=CC.rows.find(r=>r.id===o.userData.ccrow.slice(5)),t=row&&controlTripAt(row.trips,nowT());if(t)ccChoose(row.id,t.id,null,false);}});
LIVE.paused=true;setTab(TAB);
function controlSnapshot(){
 ccSyncData();const r=CC.rows.find(r=>r.id===CC.row),t=r?.trips.find(t=>t.id===CC.trip)||(r&&controlTripAt(r.trips,nowT()));
 return {mode:CC.mode,route:CC.route,vehicle:r?.id||null,trip:t?.id||null,code:t?.code||null,minute:nowT(),active:!!t&&t.dep<=nowT()&&nowT()<t.arr,load:t?controlLoad(t,nowT(),!!CC.result):null,peak:t?.peak??null,capacity:t?(CC.result?t.cap:t.code==='6670E'?9:43):null,departure:t?.dep??null,arrival:t?.arr??null};
}
