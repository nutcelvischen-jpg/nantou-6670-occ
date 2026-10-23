/* Pure deterministic planning model. No DOM, identifiers from raw tickets, or network. */
export const DISPATCH_VERSION = 'dispatch-v1-2026-10-24';
const sum = (xs, f = x => x) => xs.reduce((a,x) => a + f(x),0);
const cloneTrip = t => ({...t,stops:t.stops.map(s=>({...s})),loads:Array(Math.max(0,t.stops.length-1)).fill(0),board:0,paid:0,observedPeak:t.observedPeak??t.peak,cap:t.cap??43,type:t.type??'large'});
export function validateSpec(s) {
  for(const [k,min,max] of [['fleetLimit',0,150],['shift',0,120],['startHour',0,23],['endHour',1,24],['serviceFloor',0,1]]) if(!Number.isFinite(s[k])||s[k]<min||s[k]>max) throw Error('無效參數：'+k);
  if(s.endHour<=s.startHour||![-1,0,1].includes(s.direction)||!['B','A','H'].includes(s.scenario))throw Error('無效時窗／方向／情境');
  if(!Number.isInteger(s.fleetLimit)||!Number.isInteger(s.shift))throw Error('車隊上限及改搭分鐘須為整數');
  for(const t of Object.values(s.types)) {
    for(const k of ['cap','available','kmCost','fixed'])if(!Number.isFinite(t[k])||t[k]<0)throw Error('無效車型參數：'+k);
    if(!Number.isInteger(t.cap)||t.cap<1||!Number.isInteger(t.available))throw Error('容量／數量須為整數');
  }
  for(const k of ['drive','cont','span','rest','turn'])if(!Number.isFinite(s.rule[k])||s.rule[k]<=0)throw Error('無效門檻：'+k);
}
export function candidates(base,s) {
  validateSpec(s);
  const eligible=base.filter(t=>t.code==='6670'+s.scenario&&(s.direction<0||t.dir===s.direction)&&t.dep>=s.startHour*60&&t.dep<s.endHour*60).sort((a,b)=>b.peak-a.peak||a.dep-b.dep||a.id.localeCompare(b.id));
  const make=(id,label)=>({id,label,T:base.map(cloneTrip),changes:[],issues:[]});
  const options=s.scenario==='B'?['43','21']:s.scenario==='H'?['0','1','2']:['keep','add','early','late'];
  return options.map(option=>{
    const c=make(s.scenario+'-'+option,s.scenario==='B'?`B 離峰 ${option} 座`:s.scenario==='H'?`H 尖峰 +${option} 班`:{keep:'A 保留班表',add:'A 壓力班 +1 班',early:'A 壓力班提前15分',late:'A 壓力班延後15分'}[option]);
    if(!eligible.length){c.issues.push({code:'no_template',message:'所選方向及時窗沒有可用票證班次模板；未自行補造路線。'});return c;}
    if(s.scenario==='B') {
      for(const t of c.T)if(eligible.some(e=>e.id===t.id)){t.type=option==='21'?'medium':'large';t.cap=s.types[t.type].cap;c.changes.push({trip:t.id,route:t.code,minute:t.dep,action:`指定 ${t.cap} 座`,source:t.id});}
    } else if(s.scenario==='H'||option==='add') {
      const n=s.scenario==='H'?+option:1;
      for(let i=0;i<n;i++){
        const template=eligible[Math.min(i,eligible.length-1)],dt=15*(1+Math.floor(i/eligible.length)),t=cloneTrip(template);
        Object.assign(t,{id:template.id+'~'+c.id+'-'+i,sourceId:template.id,added:true,observedPeak:null,peak:0,observedBoard:0,observedPaid:0,dep:t.dep+dt,arr:t.arr+dt});t.stops=t.stops.map(x=>({...x,t:x.t+dt}));c.T.push(t);c.changes.push({trip:t.id,route:t.code,minute:t.dep,action:'新增模板班（無自帶旅客／實扣）',source:template.id});
      }
    } else if(option!=='keep') {
      const t=c.T.find(t=>t.id===eligible[0].id),dt=option==='early'?-15:15;t.dep+=dt;t.arr+=dt;t.stops.forEach(x=>x.t+=dt);t.shifted=dt;c.changes.push({trip:t.id,route:t.code,minute:t.dep,action:`調時 ${dt} 分`,source:t.id});
    }
    c.T.sort((a,b)=>a.dep-b.dep||a.id.localeCompare(b.id));return c;
  });
}
export function allocate(base, planned, cells, s) {
  const T=planned.map(cloneTrip),byId=new Map(base.map(t=>[t.id,t]));
  const groups=cells.map((c,index)=>{
    const [source,route,dir,hour,o,d,n,paid]=c,original=byId.get('T'+source),anchor=original?.stops.find(x=>x.si===o)?.t;
    if(!Number.isInteger(n)||n<0||!Number.isInteger(paid)||paid<0)throw Error('無效聚合需求');
    const opts=[];
    if(o!==d&&anchor!=null) for(const tr of T){
      if(tr.code!==route||tr.dir!==dir)continue;
      const oi=tr.stops.findIndex(x=>x.si===o),di=tr.stops.findIndex(x=>x.si===d);
      if(oi<0||di<=oi)continue;
      const delta=Math.abs(tr.stops[oi].t-anchor);
      if(delta<=s.shift+1e-7)opts.push({tr,oi,di,delta});
    }
    opts.sort((a,b)=>a.delta-b.delta||Number(b.tr.id==='T'+source)-Number(a.tr.id==='T'+source)||a.tr.id.localeCompare(b.tr.id));
    return {index,source,route,dir,hour,o,d,n,paid,anchor,opts};
  }).sort((a,b)=>a.opts.length-b.opts.length||(a.anchor??0)-(b.anchor??0)||a.index-b.index);
  const ledger=[],assignments=[];
  for(const g of groups){let left=g.n,money=g.paid,moved=0;
    for(const v of g.opts){const room=Math.max(0,Math.min(...v.tr.loads.slice(v.oi,v.di).map(x=>v.tr.cap-x))),n=Math.min(left,Math.floor(room));if(!n)continue;
      const cents=n===left?money:Math.floor(money*n/left);
      for(let i=v.oi;i<v.di;i++)v.tr.loads[i]+=n;
      v.tr.board+=n;v.tr.paid+=cents;left-=n;money-=cents;if(v.tr.id!=='T'+g.source||v.delta>0)moved+=n;
      assignments.push({cell:g.index,trip:v.tr.id,n,paid:cents,delta:v.delta});if(!left)break;
    }
    ledger.push({cell:g.index,key:[g.route,g.dir,g.hour,g.o,g.d].join('|'),route:g.route,hour:g.hour,n:g.n,paid:g.paid,assigned:g.n-left,unassigned:left,assignedPaid:g.paid-money,unassignedPaid:money,moved,reason:!left?null:g.o===g.d?'same_station':g.anchor==null?'missing_anchor':g.opts.length?'capacity':'no_compatible_trip'});
  }
  T.forEach(t=>{t.peak=Math.max(0,...t.loads);});
  return {T,ledger,assignments,demand:sum(ledger,x=>x.n),assigned:sum(ledger,x=>x.assigned),unassigned:sum(ledger,x=>x.unassigned),paid:sum(ledger,x=>x.paid),assignedPaid:sum(ledger,x=>x.assignedPaid),unassignedPaid:sum(ledger,x=>x.unassignedPaid),moved:sum(ledger,x=>x.moved)};
}
function dutyStats(jobs,rule){let drive=0,cont=0,peak=0;for(let i=0;i<jobs.length;i++){const j=jobs[i],dur=j.end-j.start;if(i&&(j.restBefore??(j.start-jobs[i-1].end))>=rule.rest)cont=0;drive+=dur;cont+=dur;peak=Math.max(peak,cont);}const span=jobs.length?(jobs.at(-1).end-jobs[0].start)/60:0;return {drive:drive/60,cont:peak/60,span,bad:drive>rule.drive*60+1e-6||peak>rule.cont*60+1e-6||span>rule.span+1e-6};}
export function schedule(T,s,deps){
 const partitions=new Map();for(const t of T){const key=t.type+(s.types[t.type].crossRoute?'':'|'+t.code);if(!partitions.has(key))partitions.set(key,[]);partitions.get(key).push(t);}
 const blocks=[],duties=[],issues=[],typeCounts={};
 for(const trips of partitions.values()) for(const chain of deps.minFleet(trips).blocks){
   const type=chain[0].type,b={id:'V'+String(blocks.length+1).padStart(2,'0'),type,trips:chain,segments:[],emptyKm:0};typeCounts[type]=(typeCounts[type]||0)+1;let jobs=[];
   const finish=()=>{if(!jobs.length)return;const stats=dutyStats(jobs,s.rule),d={id:'C'+(duties.length+1),vehicle:b.id,jobs,...stats};duties.push(d);if(d.bad)issues.push({code:'duty',minute:jobs[0].start,endpoint:chain[0].startZ,trip:jobs[0].trip,message:`${d.id} 仍超出設定門檻：駕車${d.drive.toFixed(1)}／連續${d.cont.toFixed(1)}／跨度${d.span.toFixed(1)}時`});jobs=[];};
   for(let i=0;i<chain.length;i++){
     const t=chain[i],pack=[];let restBefore=0;
     if(i){const prev=chain[i-1],dh=deps.dhT(prev.endZ,t.startZ,prev.arr),from=prev.arr+s.rule.turn,to=from+dh;
       b.segments.push({kind:'turn',start:prev.arr,end:from,trip:t.id});
       if(dh>0){pack.push({kind:'empty',start:from,end:to,trip:t.id,restBefore:0});b.emptyKm+=deps.dhKm(prev.endZ,t.startZ);}
       restBefore=Math.max(0,t.dep-to);if(t.dep>to)b.segments.push({kind:t.dep-to>=s.rule.rest?'rest':'idle',start:to,end:t.dep,trip:t.id});
       if(t.dep+1e-6<to)issues.push({code:'connection',minute:t.dep,endpoint:t.startZ,trip:t.id,message:'空駛及折返後趕不上此班'});
     }
     pack.push({kind:t.added?'added':'trip',start:t.dep,end:t.arr,trip:t.id,route:t.code,restBefore});
     if(jobs.length&&dutyStats([...jobs,...pack],s.rule).bad)finish();jobs.push(...pack);b.segments.push(...pack);
   }
   finish();blocks.push(b);
 }
 for(const [type,n] of Object.entries(typeCounts))if(n>s.types[type].available){const b=blocks.filter(x=>x.type===type)[s.types[type].available];issues.push({code:'type_limit',minute:b.trips[0].dep,endpoint:b.trips[0].startZ,trip:b.trips[0].id,message:`${s.types[type].cap}座需${n}台，可用${s.types[type].available}台；此配置超出車型上限`});}
 if(blocks.length>s.fleetLimit){const b=blocks[s.fleetLimit];issues.push({code:'fleet_limit',minute:b.trips[0].dep,endpoint:b.trips[0].startZ,trip:b.trips[0].id,message:`此配置需${blocks.length}台，上限${s.fleetLimit}台；未證明其他排法也不可行`});}
 const events=T.flatMap(t=>[[t.dep,1,t],[t.arr,-1,t]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let n=0,max=0,at=null;
 for(const e of events){n+=e[1];if(n>max){max=n;at=e;}}
 if(max>s.fleetLimit)issues.push({code:'concurrency',minute:at[0],endpoint:at[2].startZ,trip:at[2].id,message:`同時至少${max}班在路上，已超過${s.fleetLimit}台上限（尚未計空駛）`});
 const running=sum(T,t=>t.km),empty=sum(blocks,b=>b.emptyKm),variable=sum(blocks,b=>(sum(b.trips,t=>t.km)+b.emptyKm)*s.types[b.type].kmCost),fixed=sum(blocks,b=>s.types[b.type].fixed),driver=sum(duties,d=>deps.dutyCost(d.span+(s.rule.signOn+s.rule.signOff)/60));
 return {blocks,duties,issues,typeCounts,buses:blocks.length,drivers:duties.length,thresholdExceedances:duties.filter(d=>d.bad).length,runningKm:running,emptyKm:empty,cost:{variable,fixed,driver,total:variable+fixed+driver},maxConcurrent:max};
}
export function evaluate(base,cells,candidate,s,deps){
 validateSpec(s);const a=allocate(base,candidate.T,cells,s),r=schedule(a.T,s,deps),issues=[...candidate.issues,...r.issues];
 if(a.demand&&a.assigned/a.demand+1e-9<s.serviceFloor)issues.push({code:'service',message:`已安排${a.assigned}/${a.demand}筆，未達服務底線${Math.round(s.serviceFloor*100)}%；未安排${a.unassigned}筆`});
 const coverage=a.demand?a.assigned/a.demand:1;
 return {...candidate,...a,...r,issues,coverage,feasible:issues.length===0,version:DISPATCH_VERSION};
}
export function routeSummary(result,base){
 return [...new Set(base.map(t=>t.code))].sort().map(route=>{
  const original=base.filter(t=>t.code===route),T=result.T.filter(t=>t.code===route),ledger=result.ledger.filter(x=>x.route===route),raw=original.map(t=>t.observedPeak??t.peak);
  return {route,trips:T.length,demand:sum(ledger,x=>x.n),assigned:sum(ledger,x=>x.assigned),unassigned:sum(ledger,x=>x.unassigned),observedLowPct:raw.length?sum(raw,x=>Number(x<10))/raw.length:0,observedGE43:sum(raw,x=>Number(x>=43)),observedGT43:sum(raw,x=>Number(x>43)),peak:Math.max(0,...T.map(t=>t.peak)),peakRatio:T.length?sum(T,t=>t.peak/t.cap)/T.length:0,km:sum(T,t=>t.km),paid:sum(T,t=>t.paid),participatingVehicles:result.blocks.filter(b=>b.trips.some(t=>t.code===route)).length};
 });
}
export function runComparison(base,cells,s,deps){
 const fixed=evaluate(base,cells,{id:'fixed',label:'固定車次重排',T:base.map(cloneTrip),changes:[],issues:[]},s,deps);
 const options=candidates(base,s).map(c=>evaluate(base,cells,c,s,deps));
 const qualified=options.filter(x=>x.feasible).sort((a,b)=>a.cost.total-b.cost.total||a.id.localeCompare(b.id));
 return {version:DISPATCH_VERSION,spec:JSON.parse(JSON.stringify(s)),fixed,options,best:qualified[0]?.id??null};
}
