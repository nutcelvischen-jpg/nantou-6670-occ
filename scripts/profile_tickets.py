"""Read-only full-row profile for SPEC v0.1; no card/driver identifiers exported."""
from pathlib import Path
from collections import Counter
from datetime import datetime, timedelta
import zipfile, json, re
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1]
N = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def profile(p):
    out = {'file': p.name, 'sheets': [], 'rows': 0}
    routes, dates, stops, od, hours, nulls = [Counter() for _ in range(6)]
    bad_time = Counter()
    with zipfile.ZipFile(p) as z:
        ss = []
        for _, e in E.iterparse(z.open('xl/sharedStrings.xml'), tag=N+'si'):
            ss.append(''.join(e.itertext())); e.clear()
        book = E.fromstring(z.read('xl/workbook.xml'))
        epoch = datetime(1904,1,1) if book.find(N+'workbookPr') is not None and book.find(N+'workbookPr').get('date1904') in ('1','true') else datetime(1899,12,30)
        rels = {e.get('Id'):e.get('Target') for e in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        for sh in book.find(N+'sheets'):
            target = rels[sh.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
            target = target.lstrip('/') if target.startswith('/') else 'xl/'+target
            item = {'name':sh.get('name'), 'rows':0, 'actual_months':Counter()}
            for _, row in E.iterparse(z.open(target), tag=N+'row'):
                vals = [None]*18
                for c in row:
                    letter = re.match('[A-Z]+',c.get('r','')).group()
                    index = 0
                    for ch in letter: index = index*26+ord(ch)-64
                    v=c.find(N+'v')
                    value=v.text if v is not None else None
                    if c.get('t')=='s' and value is not None: value=ss[int(value)]
                    if index<=18: vals[index-1]=value.strip() if isinstance(value,str) else value
                if row.get('r')=='1':
                    item['headers']=vals
                elif any(v is not None for v in vals):
                    item['rows']+=1;out['rows']+=1
                    for i,v in enumerate(vals):
                        if v in (None,''):nulls[str(i)]+=1
                    routes[vals[5]]+=1;stops[vals[10]]+=1;stops[vals[13]]+=1
                    od[(vals[10],vals[13])]+=1
                    try:
                        t=epoch+timedelta(days=float(vals[8]));u=epoch+timedelta(days=float(vals[11]))
                        dates[t.date().isoformat()]+=1; hours[str(t.hour)]+=1
                        item['actual_months'][t.strftime('%Y-%m')]+=1
                        mins=(u-t).total_seconds()/60
                        if mins<0:bad_time['negative_duration']+=1
                        if mins==0:bad_time['zero_duration']+=1
                        if mins>360:bad_time['over_6h_duration']+=1
                        if vals[10]==vals[13]:bad_time['same_board_alight_name']+=1
                    except (ValueError,TypeError,OverflowError):bad_time['unparseable_time']+=1
                row.clear()
                while row.getprevious() is not None: del row.getparent()[0]
            item['actual_months']=dict(item['actual_months']);out['sheets'].append(item)
            print(p.name,item['name'],item['rows'],item['actual_months'],flush=True)
    out.update(routes=dict(routes),daily=dict(sorted(dates.items())),date_min=min(dates),date_max=max(dates),days_with_records=len(dates),hours=dict(hours),station_name_count=len(stops),station_names=dict(stops),top_od=[{'from':k[0],'to':k[1],'records':v} for k,v in od.most_common(12)],nulls_by_column_index=dict(nulls),time_flags=dict(bad_time))
    return out

if __name__=='__main__':
    results=[profile(p) for p in sorted((ROOT/'data/raw').glob('*.xlsx'))]
    target=ROOT/'analysis/ticket_profile.json';target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print('Saved',target)
