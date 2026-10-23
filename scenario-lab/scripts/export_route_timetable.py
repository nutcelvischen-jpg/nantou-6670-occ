"""從 黑客松-南投 專案匯出 6670 路線線形／站序與官網班表的精簡版，供 潭行3D 使用。
用法：python3 scripts/export_route_timetable.py [黑客松-南投 專案根目錄]
輸出：data/route-6670.json、data/timetable-6670.json
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Documents/ChatGPT/黑客松-南投'
KEEP = ['THB6670B1', 'THB6670D1', 'THB6670H1', 'THB667001']   # B=直達潭、D=經埔里站、H=到埔里、01=全線（目前前端未用）

def simp(c, step=0.08):   # 每 80 m 取一點
    out = [c[0]]
    for p in c[1:]:
        q = out[-1]
        if math.hypot((p[0] - q[0]) * 101.7, (p[1] - q[1]) * 110.6) >= step: out.append(p)
    if out[-1] != c[-1]: out.append(c[-1])
    return [[round(x, 5), round(y, 5)] for x, y in out]

t = json.load(open(SRC / 'src/data/tdx-route-map-6670.json'))
route = {'source': 'TDX MOTC Bus v2 InterCity 6670（%s 快照）' % t.get('retrieved_at', '')[:10], 'shapes': {}, 'stops': {}}
for f in t['shapes']['features']:
    u = f['properties']['sub_route_uid']
    if u in KEEP: route['shapes'][u] = simp(f['geometry']['coordinates'])
for f in t['stops']['features']:
    p = f['properties']; u = p['sub_route_uid']
    if u in KEEP: route['stops'].setdefault(u, []).append([p['stop_sequence'], p['stop_name'], round(f['geometry']['coordinates'][0], 5), round(f['geometry']['coordinates'][1], 5)])
for u in route['stops']: route['stops'][u].sort()
(ROOT / 'data/route-6670.json').write_text(json.dumps(route, ensure_ascii=False, separators=(',', ':')))

tt = json.load(open(SRC / 'src/data/ntbus-6670-timetable.json'))
out = {'source': tt['source_url'], 'effective_from': tt['effective_from'], 'note': tt['time_quality'],
       'trips': [[0 if x['direction'].startswith('taichung') else 1, x['route_code'], x['service_class'], [[s['name'], s['time']] for s in x['stops']]] for x in tt['trips']]}
(ROOT / 'data/timetable-6670.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print({u: len(v) for u, v in route['shapes'].items()}, len(out['trips']), 'trips')
