import json, re, sys, os, gzip, base64
R=os.path.dirname(os.path.abspath(__file__))+'/'
part=lambda n: open(R+'parts/'+n+'.js').read()
src=''.join(open(R+'src/'+f).read() for f in ['a_geo.js','b_scene.js','c_models.js','d_sim.js','d_replay.js','e_forecast.js','f_opt.js','g_ui.js','h_host.js'])
for k,n in [('UTILS','utils'),('MATS','mats'),('TERRAIN','terrain'),('ROAD','road'),('BUS','bus'),('SMALL','small'),('HSR','hsr'),('SML','sml'),('GANTRY','gantry'),('VEG','veg'),('BOATS','boats'),('PEOPLE','people')]:
    src=src.replace('/*__%s__*/'%k, part(n))
src=src.replace("'TAICHUNG — NANTOU  ·  1 : 100 000  ·  VERT ×1.7'","'6670  TAICHUNG — SUN MOON LAKE  ·  1 : 100 000  ·  VERT ×1.7'")
# 資料：優先讀 data/ 各檔（Mac 上由 scripts/ 產生）；沒有就讀 bundle.json
FILES={'agg':'ops-aggregates.json','route':'route-6670.json','tt':'timetable-6670.json','dh':'driver-headway-compact.json','fuel':'fuel-price.json','rp':'replay-all.json','chain':'travel-chain.json'}
if os.path.exists(R+'data/'+FILES['route']):
    data={k:json.load(open(R+'data/'+f)) for k,f in FILES.items() if os.path.exists(R+'data/'+f)}
else:
    data=json.load(open(R+'bundle.json'))
# 重播資料 gzip＋base64 內嵌，開頁時用瀏覽器 DecompressionStream 解壓（7 MB → 1.5 MB）
if 'rp' in data: data['rpz']=base64.b64encode(gzip.compress(json.dumps(data.pop('rp'),ensure_ascii=False,separators=(',',':')).encode(),9,mtime=0)).decode()
t=open(R+'template.html').read()
# 預設離線版：three.js 與 3 個 addon 以 data: URL 內嵌在 importmap，不需網路；加 --cdn 改用 jsDelivr（Artifact 用）
if '--cdn' not in sys.argv:
    du=lambda f: 'data:text/javascript;base64,'+base64.b64encode(open(R+'vendor/three/'+f,'rb').read()).decode()
    imap={'imports':{'three':du('three.module.min.js'),
      'three/addons/controls/OrbitControls.js':du('addons/OrbitControls.js'),
      'three/addons/geometries/RoundedBoxGeometry.js':du('addons/RoundedBoxGeometry.js'),
      'three/addons/utils/BufferGeometryUtils.js':du('addons/BufferGeometryUtils.js')}}
    t=re.sub(r'<script type="importmap">.*?</script>','<script type="importmap">'+json.dumps(imap)+'</script>',t,flags=re.S)
t=t.replace('/*__DATA__*/null', json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/'))
t=t.replace('/*__APP__*/', src)
args=[a for a in sys.argv[1:] if not a.startswith('--')]
out=args[0] if args else R+'tanxing-6670.html'
os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
open(out,'w').write(t); print(out, len(t))
