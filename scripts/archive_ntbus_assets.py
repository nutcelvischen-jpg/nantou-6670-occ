"""Download only public attachment URLs already observed in browser DOM."""
import json, pathlib, re, urllib.request, urllib.parse, hashlib
from concurrent.futures import ThreadPoolExecutor

ROOT=pathlib.Path(__file__).resolve().parents[1]/'data/ntbus_site'
pages=json.loads((ROOT/'browser_pages.json').read_text())
assets={}
for page in pages:
    for link in page['links']:
        if re.search(r'\.(pdf|xls|xlsx|doc|docx|zip)(?:\?|$)',link['url'],re.I):
            assets.setdefault(link['url'],dict(url=link['url'],source=page['url'],kind='document',label=link['text']))
    if page['url'].rsplit('/',1)[-1] in ['road.html','tour-sml.html','hsr6.html','hsr14.html','pulimap.html','service.html','s03.html','s02.html','s01.html','s04.html','cjstop.html']:
        for img in page['images']:
            if img['width']>=250 and img['height']>=140 and '/00%20main/' not in img['src']:
                assets.setdefault(img['src'],dict(url=img['src'],source=page['url'],kind='route_or_station_image',label=img['alt']))
        for link in page['links']:
            if re.search(r'\.(jpg|png|jpeg)$',link['url'],re.I):
                assets.setdefault(link['url'],dict(url=link['url'],source=page['url'],kind='linked_map',label=link['text']))
(ROOT/'downloads').mkdir(exist_ok=True)
def download(a):
    a=dict(a)
    try:
        name=hashlib.sha256(a['url'].encode()).hexdigest()[:8]+'_'+urllib.parse.unquote(a['url'].rsplit('/',1)[-1])
        with urllib.request.urlopen(a['url'],timeout=25) as r:
            b=r.read();typ=r.headers.get('content-type','')
            if 'text/html' in typ:raise ValueError('HTML response instead of asset')
        path=ROOT/'downloads'/name;path.write_bytes(b)
        a.update(status='downloaded',path=str(path.relative_to(ROOT)),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),content_type=typ)
    except Exception as e:a.update(status='failed',error=str(e))
    print(a['status'],a['url'],flush=True)
    return a
with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(download,assets.values()))
(ROOT/'download_manifest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('TOTAL',len(results),'SUCCESS',sum(x['status']=='downloaded' for x in results))
