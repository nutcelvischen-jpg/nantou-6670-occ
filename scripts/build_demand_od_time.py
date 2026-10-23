"""Privacy-safe demand fragments and hourly OD aggregates; run from project root."""
from pathlib import Path
import sys,json,hashlib
from collections import defaultdict,Counter
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scenario-lab/scripts'))
import build_replay as br
original=br.split_all
captured=[]
def capture(*a,**kw):
 t,f=original(*a,**kw);captured[:]=t;return t,f
br.split_all=capture
rp=json.loads((ROOT/'scenario-lab/data/replay-all.json').read_text())
out={'version':'od-time-v1-2026-10-24','verified_on':'2026-10-24','stations':br.STA,'columns':['source_trip','route','dir','hour','origin','destination','n','paid_cents'],'privacy':'僅匿名車次內OD時段聚合；無卡號、車牌、司機號','time_basis':'改搭以原推估班次在上車計費站的事件時間為代理，不是旅客到站時間','sources':{},'days':{}}
for year in [2024,2025]:
 p=ROOT/f'data/raw/{year}年_6670刷卡資料.xlsx';out['sources'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
 print('Reading',year,flush=True);rebuilt=br.run(str(p));groups=defaultdict(list)
 for plate,date,di,cur in captured:groups[date].append((di,cur))
 for date,ls in sorted(groups.items()):
  assert rebuilt[date]['trips']==rp['days'][date]['trips'],f'replay drift {date}'
  ls.sort(key=lambda x:min(e[0] for e in x[1]));cells=defaultdict(lambda:[0,0]);hourly=defaultdict(lambda:[0,0]);total=0
  for idx,(di,cur) in enumerate(ls):
   for bt,at,o,d,drv,route,paid in cur:
    k=(idx,route,di,bt.hour,br.STA.index(o),br.STA.index(d));v=cells[k];v[0]+=1;v[1]+=round(paid*100);total+=1
    w=hourly[k[1:]];w[0]+=1;w[1]+=round(paid*100)
  assert total==rp['days'][date]['taps']
  out['days'][date]={'n':total,'cells':[list(k)+v for k,v in sorted(cells.items())],'od_hour':[list(k)+v for k,v in sorted(hourly.items())]}
 print('Verified',year,len(groups),'days',flush=True)
path=ROOT/'scenario-lab/data/demand-od-time.json';path.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print('Saved',len(out['days']),'days',path.stat().st_size,'bytes',flush=True)
