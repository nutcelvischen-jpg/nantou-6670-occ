"""Export privacy-safe aggregates from the supplied XLSX sources; never writes card identifiers."""
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from lxml import etree as E
import zipfile, json, re

ROOT=Path(__file__).resolve().parents[1]
N='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

def aggregate(path):
    with zipfile.ZipFile(path) as z:
        strings=[]
        for _,el in E.iterparse(z.open('xl/sharedStrings.xml'),tag=N+'si'):
            strings.append(''.join(el.itertext()));el.clear()
        book=E.fromstring(z.read('xl/workbook.xml'))
        epoch=datetime(1904,1,1) if book.find(N+'workbookPr') is not None and book.find(N+'workbookPr').get('date1904') in ('1','true') else datetime(1899,12,30)
        rels={e.get('Id'):e.get('Target') for e in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        hour=Counter(); daily=Counter(); route=Counter(); od=Counter(); station=Counter(); fare=Counter(); card_txn=Counter(); return_intervals=Counter()
        total=0; parsed=0
        for sh in book.find(N+'sheets'):
            # Return-trip matching is limited to a single source sheet (month),
            # card and service day. Card identifiers never leave this process.
            card_day_trips=defaultdict(list)
            target=rels[sh.get(R+'id')]
            target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
            for _,row in E.iterparse(z.open(target),tag=N+'row'):
                if row.get('r')=='1': row.clear();continue
                vals=[None]*18
                for c in row:
                    m=re.match('[A-Z]+',c.get('r',''))
                    if not m: continue
                    index=0
                    for ch in m.group():index=index*26+ord(ch)-64
                    v=c.find(N+'v'); value=v.text if v is not None else None
                    if c.get('t')=='s' and value is not None:value=strings[int(value)]
                    if index<=18:vals[index-1]=value.strip() if isinstance(value,str) else value
                if any(v is not None for v in vals):
                    total+=1
                    # Card identifiers stay in memory only; only coarse, suppressed
                    # frequency buckets are eligible for the public aggregate.
                    card_id=vals[2]
                    if card_id is not None and card_id!='':card_txn[card_id]+=1
                    try:
                        board=epoch+timedelta(days=float(vals[8]))
                        day=board.date().isoformat(); hr=board.hour
                        r=(vals[5] or '未分類').strip(); o=(vals[10] or '未知').strip(); d=(vals[13] or '未知').strip()
                        hour[(r,hr)]+=1;daily[day]+=1;route[r]+=1;od[(o,d)]+=1;station[o]+=1;station[d]+=1
                        fare[(vals[4] or '未分類').strip()]+=1;parsed+=1
                        if card_id not in (None, '') and o not in ('未知', '') and d not in ('未知', '') and o != d:
                            card_day_trips[(card_id, day)].append((board, o, d))
                    except (ValueError,TypeError,OverflowError):pass
                row.clear()
                while row.getprevious() is not None:del row.getparent()[0]
            for trips in card_day_trips.values():
                return_intervals.update(derive_return_intervals(trips))
    return {'source':path.name,'rows':total,'parsed_rows':parsed,'hour_by_route':[{'route':r,'hour':h,'transactions':n} for (r,h),n in sorted(hour.items())],'daily':[{'date':d,'transactions':n} for d,n in sorted(daily.items())],'routes':[{'route':r,'transactions':n} for r,n in route.most_common()],'top_od':[{'origin':o,'destination':d,'transactions':n} for (o,d),n in od.most_common(30)],'top_stations':[{'name':s,'touches':n} for s,n in station.most_common(30)],'ticket_types':[{'type':t,'transactions':n} for t,n in fare.most_common()],'card_transaction_frequency':bucket_card_frequency(card_txn),'same_day_return_interval':bucket_return_intervals(return_intervals)}

def derive_return_intervals(trips, maximum_hours=12):
    """Find non-overlapping same-day A→B then B→A ticket pairs; return interval labels only."""
    ordered=sorted(trips)
    used=set()
    labels=[]
    for i,(depart,origin,destination) in enumerate(ordered):
        if i in used:
            continue
        for j in range(i+1,len(ordered)):
            if j in used:
                continue
            returned,return_origin,return_destination=ordered[j]
            minutes=(returned-depart).total_seconds()/60
            if minutes > maximum_hours*60:
                break
            if return_origin==destination and return_destination==origin and minutes>0:
                labels.append(return_interval_label(minutes))
                used.update((i,j))
                break
    return labels

def return_interval_label(minutes):
    if minutes < 60:return '1 小時內'
    if minutes < 120:return '1–2 小時'
    if minutes < 240:return '2–4 小時'
    return '4–12 小時'

def bucket_return_intervals(interval_counts, minimum_cell_size=10):
    bins=['1 小時內','1–2 小時','2–4 小時','4–12 小時']
    return [{'label':label,'return_count':interval_counts.get(label,0) if interval_counts.get(label,0)>=minimum_cell_size else None,'suppressed':interval_counts.get(label,0)<minimum_cell_size} for label in bins]

def bucket_card_frequency(card_transactions, minimum_cell_size=10):
    """Return a coarse within-file frequency histogram; never return card IDs."""
    bins=[('1筆',1,1),('2筆',2,2),('3–5筆',3,5),('6–10筆',6,10),('11–20筆',11,20),('21筆以上',21,None)]
    result=[]
    for label,lower,upper in bins:
        count=sum(1 for transactions in card_transactions.values() if transactions>=lower and (upper is None or transactions<=upper))
        result.append({'label':label,'card_count':count if count>=minimum_cell_size else None,'suppressed':count<minimum_cell_size})
    return result

if __name__=='__main__':
    result=[aggregate(p) for p in sorted((ROOT/'data/raw').glob('*.xlsx'))]
    out=ROOT/'src/data/ticket-aggregates.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps({'synthetic':False,'privacy':'aggregated; card and driver identifiers omitted','generated_at':datetime.now().isoformat(timespec='seconds'),'years':result},ensure_ascii=False,separators=(',',':')))
    print(json.dumps({'output':str(out),'rows':[x['rows'] for x in result],'parsed':[x['parsed_rows'] for x in result]},ensure_ascii=False))
