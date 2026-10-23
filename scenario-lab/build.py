import json, re, sys
import os
R=os.path.dirname(os.path.abspath(__file__))+'/'
part=lambda n: open(R+'parts/'+n+'.js').read()
src=''.join(open(R+'src/'+f).read() for f in ['a_geo.js','b_scene.js','c_models.js','d_sim.js','e_forecast.js','f_opt.js','g_ui.js'])
for k,n in [('UTILS','utils'),('MATS','mats'),('TERRAIN','terrain'),('ROAD','road'),('BUS','bus'),('SMALL','small'),('HSR','hsr'),('SML','sml'),('GANTRY','gantry'),('VEG','veg'),('BOATS','boats'),('PEOPLE','people')]:
    src=src.replace('/*__%s__*/'%k, part(n))
src=src.replace("'TAICHUNG — NANTOU  ·  1 : 100 000  ·  VERT ×1.7'","'6670  TAICHUNG — SUN MOON LAKE  ·  1 : 100 000  ·  VERT ×1.7'")
data={'agg':json.load(open(R+'data/ops-aggregates.json')),'route':json.load(open(R+'data/route-6670.json')),'tt':json.load(open(R+'data/timetable-6670.json'))}
t=open(R+'template.html').read()
t=t.replace('/*__DATA__*/null', json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/'))
t=t.replace('/*__APP__*/', src)
out=sys.argv[1] if len(sys.argv)>1 else R+'tanxing-6670.html'
import os; os.makedirs(os.path.dirname(out),exist_ok=True)
open(out,'w').write(t); print(out, len(t))
