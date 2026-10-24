/* Progressive disclosure changes inputs/presentation, never the planning formula. */
export const GUIDED_OPTIONS={
 B:[['B-43','維持 43 座'],['B-21','離峰試用 21 座']],
 A:[['A-keep','維持班表'],['A-add','容量壓力班增加 1 班'],['A-early','容量壓力班提前 15 分'],['A-late','容量壓力班延後 15 分']],
 H:[['H-0','維持班表'],['H-1','尖峰增加 1 班'],['H-2','尖峰增加 2 班']]
};
export function guidedOptions(route){return GUIDED_OPTIONS[route.replace('6670','')]||[];}
export function guidedPreset(spec,route){
 const scenario=route.replace('6670',''),s=JSON.parse(JSON.stringify(spec));
 if(!GUIDED_OPTIONS[scenario])return null;
 return {...s,scenario,startHour:scenario==='B'?10:scenario==='H'?14:5,endHour:scenario==='B'?15:scenario==='H'?18:24};
}
export function guidedKey(date,spec,deadhead,cost,candidate){return JSON.stringify([date,spec,deadhead,cost,candidate]);}
