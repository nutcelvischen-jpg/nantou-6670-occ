/* Match ordered stop occurrences to a polyline. Repeated names stay separate. */
export function stationProject(stops, points, cum) {
  if (!stops.length || points.length < stops.length) return [];
  const n=points.length, parents=[]; let prev=new Float64Array(n).fill(Infinity);
  for(let s=0;s<stops.length;s++){
    const cost=new Float64Array(n).fill(Infinity), from=new Int32Array(n).fill(-1);let best=Infinity,bi=-1;
    for(let i=0;i<n;i++){
      if(i>0&&prev[i-1]<best){best=prev[i-1];bi=i-1;}
      const d=(points[i].x-stops[s].x)**2+(points[i].z-stops[s].z)**2;
      if(s===0){cost[i]=d;}else if(bi>=0){cost[i]=best+d;from[i]=bi;}
    }
    parents.push(from);prev=cost;
  }
  let i=prev.indexOf(Math.min(...prev));const out=[];
  for(let s=stops.length-1;s>=0;s--){out.unshift({...stops[s],d:cum[i],error:Math.hypot(points[i].x-stops[s].x,points[i].z-stops[s].z)});i=parents[s][i];}
  return out;
}
export function stationBetween(stops,d){
 if(!stops.length||!Number.isFinite(d))return null;
 if(d<=stops[0].d)return {index:0,previous:null,next:stops[0]};
 for(let i=1;i<stops.length;i++)if(d<stops[i].d){const a=stops[i-1],b=stops[i];return {index:i-1+(d-a.d)/(b.d-a.d||1),previous:a,next:b};}
 return {index:stops.length-1,previous:stops.at(-1),next:null};
}
export function stationAnchors(original,planned){
 return planned?original.anchors.map(a=>({...a,t:planned.stops.find(s=>s.z===a.z)?.t??a.t+planned.dep-original.dep})):original.anchors;
}
