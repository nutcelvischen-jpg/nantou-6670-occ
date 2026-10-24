/* A single-clock station diagram; no synthetic stop observations. */
const CS={route:'6670D',dir:0,key:'',stops:[],cache:new Map(),selected:'',open:true};
ccMount('cc-stations',`<div class="cs-head"><button id="csToggle" aria-expanded="true">▾ 公車與站點</button><label>站線 <select id="csRoute">${LINE_CODES.map(c=>`<option ${c===CS.route?'selected':''}>${c}</option>`).join('')}</select></label><label>方向 <select id="csDir"><option value="0">往南投／埔里</option><option value="1">往台中</option></select></label><button id="csFind">找到選取車輛</button><small>左右捲動看全站 · 點站定位 · 點車連動甘特圖</small></div><div id="csContent"><div id="csNote"></div><div id="csViewport" tabindex="0" aria-label="可左右捲動的公車站線圖"><div id="csTrack"></div></div><div id="csStatus" aria-live="off"></div></div>`);
function csStops(code,dir){
 const k=code.slice(-1),official=SHAPE_KEY[k],path=PATHS[official?k:({A:'D',E:'B',F:'F'}[k]||'D')][dir],key=code+'|'+dir;
 if(CS.cache.has(key))return CS.cache.get(key);
 let stops;
 if(official){let list=DATA.route.stops[official].map(([seq,name,lon,lat])=>{const [x,z]=P(lat,lon);return {seq,name,x,z};});if(dir)list.reverse();stops=stationProject(list,path.pts,path.cum);}
 else {stops=Object.entries(path.zd).map(([z,d],i)=>{const p=path.pts[path.cum.findIndex(v=>v>=d)]||path.pts.at(-1);return {seq:i,name:ZNAME[z]||z,x:p.x,z:p.z,d};}).sort((a,b)=>a.d-b.d);}
 const result={stops,official:!!official};CS.cache.set(key,result);return result;
}
function csRender(){
 if(!ccActive())return;
 const chosen=CC.rows.find(r=>r.id===CC.row)?.trips.find(t=>t.id===CC.trip),selected=[CC.mode,CC.row,CC.trip].join('|');
 if(chosen&&selected!==CS.selected){CS.route=chosen.code;CS.dir=chosen.dir;CS.key='';}CS.selected=selected;
 if(CC.route!=='all'&&CS.route!==CC.route){CS.route=CC.route;CS.key='';}
 $('#csRoute').value=CS.route;$('#csDir').value=CS.dir;
 const key=CS.route+'|'+CS.dir;
 if(key!==CS.key){CS.key=key;const data=csStops(CS.route,CS.dir);CS.stops=data.stops;
 $('#csNote').textContent=data.official?`${CS.route} · ${CS.stops.length} 個站序位置（重複停靠分開列） · TDX 2026-10-23 快照${CS.dir?'；回程沿去程站序反轉示意，非獨立回程站序':''}。並非每班的歷史停站證明。`:`${CS.route} · 計費區示意，尚無完整官方站序；不得視為所有停靠站。`;
 $('#csTrack').style.width=Math.max(700,CS.stops.length*100)+'px';
 $('#csTrack').innerHTML=`<div class="cs-rail" style="right:50px"></div>${CS.stops.map((s,i)=>`<button class="cs-stop" data-stop="${i}" style="left:${i*100+6}px" title="${escD(s.name)} · 站序 ${s.seq}"><i></i><span>${i+1}. ${escD(s.name)}</span></button>`).join('')}<div id="csBuses"></div>`;
 $('#csViewport').scrollLeft=0;
 }
 const busSig=[LIVE.date,CC.signature,CS.key,CC.row,CC.trip,nowT()].join('|');if(CS.busSig===busSig)return;CS.busSig=busSig;
 const active=[];for(const row of CC.rows){const tr=controlTripAt(row.trips,nowT());if(!tr||tr.code!==CS.route||tr.dir!==CS.dir)continue;
 const original=CC.result?SIM().trips.find(t=>t.id===(tr.sourceId||tr.id)):tr;if(!original?.ok)continue;
 const anchors=stationAnchors(original,CC.result?tr:null),d=rpD({...original,anchors},nowT()),at=stationBetween(CS.stops,d);if(!at)continue;
 active.push({row,tr,at});}
 $('#csBuses').innerHTML=active.map(({row,tr,at},i)=>`<button class="cs-bus ${tr.added?'added':''} ${tr.shifted?'shifted':''}" data-row="${escD(row.id)}" data-trip="${escD(tr.id)}" aria-pressed="${CC.row===row.id&&CC.trip===tr.id}" style="left:${at.index*100+50}px;top:${4+(i%3)*23}px" title="${row.id} ${tr.code} ${at.previous?.name||'起站'} → ${at.next?.name||'末站'}（線形內插）"><svg viewBox="0 0 24 15" aria-hidden="true"><rect x="1" y="1" width="22" height="10" rx="2" fill="currentColor"/><path d="M4 3h16v4H4z" fill="#f7faf8"/><circle cx="6" cy="12" r="2" fill="#344a40"/><circle cx="18" cy="12" r="2" fill="#344a40"/></svg> ${row.id}${tr.added?' ＋':''}</button>`).join('');
 const current=active.find(x=>x.row.id===CC.row&&x.tr.id===CC.trip);
 $('#csStatus').textContent=current?`${current.row.id} · ≈ ${current.at.previous?.name||'起站'} → ${current.at.next?.name||'末站'} · ${CC.result?'方案':'票證'}在車量 ${controlLoad(current.tr,nowT(),!!CC.result)} 人（站間內插，非到站回報）`:`${fmt(nowT())} · 此方向 ${active.length} 班可定位行駛中 · 車輛位置依刷卡／方案時刻內插；不是即時 GPS。`;
 $('#csFind').disabled=!current;
}
$('#csRoute').onchange=e=>{CS.route=e.target.value;CS.key='';CC.route=CS.route;$('#ccRoute').value=CS.route;$('#ccRoute').onchange({target:$('#ccRoute')});csRender();};
$('#csDir').onchange=e=>{CS.dir=+e.target.value;CS.key='';csRender();};
$('#csToggle').onclick=()=>{CS.open=!CS.open;$('.cc-stations').classList.toggle('cs-folded',!CS.open);$('#csContent').hidden=!CS.open;$('#csToggle').setAttribute('aria-expanded',String(CS.open));$('#csToggle').textContent=(CS.open?'▾':'▸')+' 公車與站點';resize();};
$('#csTrack').onclick=e=>{const b=e.target.closest('[data-row]');if(b){ccChoose(b.dataset.row,b.dataset.trip,null,true);return;}const st=e.target.closest('[data-stop]');if(!st)return;const s=CS.stops[+st.dataset.stop];CC.follow=LIVE.follow=false;const p=new THREE.Vector3(s.x,yAt(s.x,s.z),s.z);flyTo(p,p.clone().add(new THREE.Vector3(-.9,1.3,1.8)));};
$('#csFind').onclick=()=>{const b=$('#csBuses').querySelector('[aria-pressed="true"]');if(b)$('#csViewport').scrollLeft=Math.max(0,b.offsetLeft-$('#csViewport').clientWidth/2);};
const csOldRefresh=ccRefresh;ccRefresh=function(){csOldRefresh();csRender();};
