/* Independent single-vehicle illustration for prediction pages. Does not mutate LIVE. */
function predictionActive(){return PRED.active;}
function predictionVisual(){const tr=PRED.trip;return {buses:tr?[{id:PRED.bus,state:'run',trip:tr,load:rpLoad(tr,PRED.clock.minute)}]:[]};}
const predStage=$('.stage'),predMap=document.createElement('div');predMap.id='predMap';
predStage.prepend(predMap);predMap.append(host,labelsEl);
const predControls=document.createElement('section');predControls.id='predControls';
predControls.innerHTML=`<div class="pred-heading"><div><b>單車路線演示</b><small>獨立播放 · 不連動行車模擬 · 非即時 GPS</small></div><button id="predHome">鳥瞰全圖</button></div>
<div class="pred-selectors"><label>示範日期<select id="predDate"></select></label><label>單一車輛<select id="predBus"></select></label><label class="pred-trip">推估車次<select id="predTrip"></select></label></div>
<div class="pred-play"><button id="predPlay">啟動</button><button id="predReset">回到起點</button><label>速度<select id="predSpeed"><option value="60">×60</option><option value="120" selected>×120</option><option value="360">×360</option></select></label><strong id="predClock"></strong><span id="predState"></span></div>`;
predStage.prepend(predControls);
const predStations=document.createElement('section');predStations.id='predStations';
predStations.innerHTML=`<div class="pred-station-head"><b>公車與站點</b><button id="predFind">找到車輛</button><small>左右捲動查看全部站序</small></div><div id="predStopViewport" tabindex="0" aria-label="單車演示完整站線圖"><div id="predStopTrack"></div></div><p id="predLocation"></p><small id="predStopSource"></small>`;
predStage.append(predStations);
$('#predDate').innerHTML=RDAYS.map(d=>`<option>${d}</option>`).join('');$('#predDate').value=PRED.date;
function predictionLoadDay(){
 PRED.trips=RP.days[PRED.date].trips.map(mkRTrip).filter(t=>t.ok&&t.arr>t.dep).sort((a,b)=>a.dep-b.dep);
 const buses=[...new Set(PRED.trips.map(t=>t.bus))].sort();
 $('#predBus').innerHTML=buses.map(id=>`<option>${id}</option>`).join('');
 PRED.bus=buses.includes(PRED.bus)?PRED.bus:buses[0];$('#predBus').value=PRED.bus||'';
 predictionChooseBus();
}
function predictionChooseBus(){
 const trips=PRED.trips.filter(t=>t.bus===PRED.bus);
 $('#predTrip').innerHTML=trips.map(t=>`<option value="${t.id}">${t.code} · ${fmt(t.dep)}–${fmt(t.arr)} · ${escD(dirTxt(t))}</option>`).join('');
 predictionChooseTrip(trips[0]?.id);
}
function predictionChooseTrip(id){
 PRED.trip=PRED.trips.find(t=>t.id===id&&t.bus===PRED.bus)||null;
 PRED.clock={...PRED.clock,minute:PRED.trip?.dep||0,paused:true};PRED.stationKey='';PRED.renderKey='';
 if(PRED.trip)$('#predTrip').value=PRED.trip.id;
 for(const el of [$('#predPlay'),$('#predReset'),$('#predFind')])el.disabled=!PRED.trip;
 if(PRED.active){predictionRender();predictionFit();}
}
function predictionFit(){
 if(!PRED.active)return;
 const r=host.getBoundingClientRect();if(!r.width||!r.height)return;
 const target=new THREE.Vector3(X0+W/2,1,(Z0+D/2)),towards=new THREE.Vector3(-.12,.85,1).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),towards).normalize(),up=new THREE.Vector3().crossVectors(towards,right).normalize();
 const corners=[];for(const x of [X0-1,X0+W+1])for(const y of [SKIRT-1,5])for(const z of [Z0-1,Z0+D+2]){const p=new THREE.Vector3(x,y,z).sub(target);corners.push([p.dot(right),p.dot(up),p.dot(towards)]);}
 const distance=previewFitDistance(corners,camera.fov,r.width/r.height);
 controls.maxDistance=Math.max(140,distance*1.8);fly=null;camera.position.copy(target).addScaledVector(towards,distance);controls.target.copy(target);controls.update();
}
function predictionSurface(active){
 if(active===PRED.active)return;
 if(active){PRED.drivingCamera={p:camera.position.clone(),t:controls.target.clone(),max:controls.maxDistance};PRED.active=true;PRED.autoFit=true;PRED.clock.paused=true;}
 else{PRED.clock.paused=true;PRED.active=false;const c=PRED.drivingCamera;if(c){fly=null;camera.position.copy(c.p);controls.target.copy(c.t);controls.maxDistance=c.max;controls.update();}applyLines();}
 document.body.classList.toggle('prediction-preview',active);
 for(const v of Object.values(VIS)){v.root.visible=false;v.mk.dataset.vis='0';v.mk.style.display='none';v.last=null;}
 requestAnimationFrame(()=>{resize();if(active){predictionFit();predictionRender();}else refreshUI(true);});
}
function predictionRender(){
 if(!PRED.active)return;
 const tr=PRED.trip,t=PRED.clock.minute;
 $('#predClock').textContent=fmt(t);$('#predState').textContent=!tr?'當日沒有可定位車次':t>=tr.arr?'已抵達末站':PRED.clock.paused?'尚未啟動／已暫停':'播放中';
 $('#predPlay').textContent=PRED.clock.paused?(tr&&t>=tr.arr?'重新啟動':'啟動'):'暫停';
 if(!tr)return;
 for(const [k,line] of Object.entries(ROUTE_LINES))line.visible=k===LINE_PATH[tr.code];
 const key=tr.code+'|'+tr.dir;
 if(key!==PRED.stationKey){
  PRED.stationKey=key;const result=csStops(tr.code,tr.dir);PRED.stops=result.stops;
  $('#predStopSource').textContent=result.official?`${tr.code} · ${PRED.stops.length} 個站序位置 · TDX 2026-10-23${tr.dir?'，回程沿去程反轉示意':''}；不代表歷史每班皆停靠。`:`${tr.code} · 計費區站序示意，非完整官方站點。`;
  $('#predStopTrack').style.width=Math.max(700,PRED.stops.length*100)+'px';
  $('#predStopTrack').innerHTML=`<div class="cs-rail" style="right:50px"></div>${PRED.stops.map((s,i)=>`<button class="cs-stop" data-pstop="${i}" style="left:${i*100+6}px"><i></i><span>${i+1}. ${escD(s.name)}</span></button>`).join('')}<button id="predStopBus" class="cs-bus" aria-label="選取的演示公車"></button>`;
  $('#predStopViewport').scrollLeft=0;
 }
 const at=stationBetween(PRED.stops,rpD(tr,t));
 if(at){$('#predStopBus').style.left=(at.index*100+50)+'px';$('#predStopBus').textContent='▰ '+PRED.bus;
 $('#predLocation').textContent=`${PRED.bus} · ≈ ${at.previous?.name||'起站'} → ${at.next?.name||'末站'} · 票證在車量 ${rpLoad(tr,t)} 人。位置依刷卡時刻沿線內插。`;}
}
function advancePrediction(seconds){if(!PRED.active||!PRED.trip)return;PRED.clock=previewClock(PRED.clock,seconds,PRED.trip.arr);predictionRender();}
$('#predDate').onchange=e=>{PRED.date=e.target.value;predictionLoadDay();};
$('#predBus').onchange=e=>{PRED.bus=e.target.value;predictionChooseBus();};
$('#predTrip').onchange=e=>predictionChooseTrip(e.target.value);
$('#predPlay').onclick=()=>{if(!PRED.trip)return;if(PRED.clock.minute>=PRED.trip.arr)PRED.clock.minute=PRED.trip.dep;PRED.clock.paused=!PRED.clock.paused;predictionRender();};
$('#predReset').onclick=()=>predictionChooseTrip(PRED.trip?.id);
$('#predSpeed').onchange=e=>PRED.clock.speed=+e.target.value;
$('#predHome').onclick=()=>{PRED.autoFit=true;predictionFit();};
$('#predFind').onclick=()=>{const b=$('#predStopBus');if(b)$('#predStopViewport').scrollLeft=Math.max(0,b.offsetLeft-$('#predStopViewport').clientWidth/2);};
$('#predStopTrack').onclick=e=>{const el=e.target.closest('[data-pstop]');if(!el)return;const s=PRED.stops[+el.dataset.pstop];PRED.autoFit=false;const p=new THREE.Vector3(s.x,yAt(s.x,s.z),s.z);flyTo(p,p.clone().add(new THREE.Vector3(-.9,1.3,1.8)));};
controls.addEventListener('start',()=>{if(PRED.active)PRED.autoFit=false;});
const predOldHome=goHome;goHome=function(){if(PRED.active){PRED.autoFit=true;predictionFit();}else predOldHome();};
const predOldSelect=select;select=function(id){if(PRED.active){if(id===PRED.bus)$('#predFind').click();return;}predOldSelect(id);};
const predOldResize=resize;resize=function(){predOldResize();if(PRED.active&&PRED.autoFit)predictionFit();};
new ResizeObserver(()=>{if(PRED.active&&PRED.autoFit)predictionFit();}).observe(host);
predictionLoadDay();
