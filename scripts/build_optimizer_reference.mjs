import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as THREE from 'three';
const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const inputs = ['src/a_geo.js','parts/utils.js','src/d_sim.js','src/d_replay.js','src/e_forecast.js','src/f_opt.js'];
const names = {agg:'ops-aggregates',route:'route-6670',tt:'timetable-6670',rp:'replay-all',dh:'driver-headway-compact',fuel:'fuel-price'};
const data = Object.fromEntries(Object.entries(names).map(([k,f])=>[k,JSON.parse(read(`scenario-lab/data/${f}.json`))]));
const ctx = vm.createContext({THREE,window:{__DATA:data},console});
const geo=read('scenario-lab/src/a_geo.js').replace(/^import .*;\n/gm,'').replace('/*__UTILS__*/',read('scenario-lab/parts/utils.js'));
vm.runInContext(geo+'\nfor(const f of Object.values(FACS)) f.slots=[];\n'+inputs.slice(2).map(f=>read('scenario-lab/'+f).replace('JSON.parse(await gunzipB64(DATA.rpz))','null')).join('\n'),ctx);
const results=vm.runInContext(`(()=>{const rows=[];for(const mode of ['p85','p50','fixed']){DHM.mode=mode;const r=optimizeDay('2025-10-11');const pick=x=>({trips:x.T.length,buses:x.buses,drivers:x.duties.length,threshold_exceedances:x.duties.filter(d=>d.bad).length});rows.push({mode,base:pick(r.base),replanned:pick(r.re)});}DHM.mode='p85';return {parameters:{rule:{...RULE},scenario:{...SCN},crew_swap:CREW.sw,deadhead_mode:DHM.mode,capacity:CAP,cost:{...COST},fuel_week:FUEL.week,delay:{...DELAY},timetable_tolerance_minutes:MATCH_TOL},results:rows};})()`,ctx);
const hash = s=>crypto.createHash('sha256').update(s).digest('hex');
const out={version:'crew-reference-2026-10-24',verified_on:'2026-10-24',service_date:'2025-10-11',scope:'6670 全部子線；固定當日123個票證推估車次，只重排，不併班、不加開。',method:'給定銜接圖的最大二分匹配求最少車輛；司機採跟車片段啟發式，不保證最少人數。',...results,source_sha256:Object.fromEntries([...inputs,...Object.values(names).map(n=>'data/'+n+'.json')].map(f=>[f,hash(read('scenario-lab/'+f))])),limits:['超出設定門檻是模型檢核，不是法律認定；0也不代表正式合規。','基準與重排的值勤門檻皆不含整備；前15分、後10分只用於薪資試算，並非完整工時紀錄。','空駛時間以票證區間時刻差作代理；缺樣本時回退固定45km/h加5分估計。','不將不同日期、空駛模式或允許換車情境的結果互相代用；CP-SAT離線研究數字不是本網站預設結果。']};
const path=new URL('shared/optimizer-reference.json',root);
if(process.argv.includes('--check')){if(JSON.stringify(JSON.parse(fs.readFileSync(path,'utf8')))!==JSON.stringify(out))throw Error('Optimizer reference is stale: regenerate before publication.');console.log('Optimizer reference matches current model and data.');}
else{fs.writeFileSync(path,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out.results));}
