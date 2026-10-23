"""Index browser-captured DOM without fetching or executing archived site HTML."""
import csv,json,pathlib,re,hashlib
from lxml import html
ROOT=pathlib.Path(__file__).resolve().parents[1]/'data/ntbus_site'
pages=json.loads((ROOT/'browser_pages.json').read_text())
for folder in ['text','html']:(ROOT/folder).mkdir(exist_ok=True)
rows=[];tables=[];links={};images={}
for p in pages:
    name=p['url'].rsplit('/',1)[-1]
    raw=p.get('html','');(ROOT/'html'/name).write_text(raw)
    tree=html.fromstring(raw)
    for e in tree.xpath('//script|//style'):e.drop_tree()
    txt=re.sub(r'\s+',' ',tree.text_content()).strip()
    (ROOT/'text'/(name+'.txt')).write_text(txt)
    rows.append(dict(url=p['url'],status='page_reports_404' if 'Error Code: 404' in p['text'] else 'content_captured',captured_at=p.get('capturedAt',''),text_chars=len(txt),html_sha256=hashlib.sha256(raw.encode()).hexdigest(),text_file='text/'+name+'.txt',html_file='html/'+name))
    for i,t in enumerate(tree.xpath('//table[not(.//table)]')):
        if not re.search(r'\d{1,2}:\d{2}',t.text_content()):continue
        cells=[]
        for row in t.xpath('./tr|./thead/tr|./tbody/tr|./tfoot/tr'):
            cells.append([{'text':re.sub(r'\s+',' ',c.text_content()).strip(),'rowspan':c.get('rowspan','1'),'colspan':c.get('colspan','1'),'bgcolor':c.get('bgcolor'),'style':c.get('style'),'html':html.tostring(c,encoding='unicode')} for c in row.xpath('./td|./th')])
        tables.append(dict(source=p['url'],table_index=i,rows=cells,status='raw_table_not_normalized',note='Merged headers, color-coded service days and operator semantics require review. Not a validated timetable.'))
    for a in p['links']:links.setdefault(a['url'],{'url':a['url'],'label':a['text'],'source_pages':[]})['source_pages'].append(p['url'])
    for a in p['images']:images.setdefault(a['src'],{'url':a['src'],'alt':a['alt'],'source_pages':[]})['source_pages'].append(p['url'])
with (ROOT/'page_inventory.csv').open('w') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
for name,data in [('raw_timetable_tables.json',tables),('link_inventory.json',list(links.values())),('image_inventory.json',list(images.values()))]:
    (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
visited={p['url'] for p in pages}
unvisited=sorted({a.split('#')[0] for a in links if a.startswith('http://www.ntbus.com.tw/') and re.search(r'\.html?(?:#.*)?$',a)}-visited)
manifest=json.loads((ROOT/'download_manifest.json').read_text())
stats=dict(page_urls=len(rows),content_pages=sum(r['status']=='content_captured' for r in rows),error_pages=sum(r['status']=='page_reports_404' for r in rows),unvisited_discovered_internal_html=unvisited,raw_time_tables=len(tables),unique_link_targets=len(links),unique_image_urls=len(images),downloaded_assets=sum(a['status']=='downloaded' for a in manifest),downloaded_bytes=sum(a.get('bytes',0) for a in manifest))
(ROOT/'coverage.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2));print(json.dumps(stats,ensure_ascii=False,indent=2))
