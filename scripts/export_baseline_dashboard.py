"""Whitelist reviewed EDA aggregates for the public dashboard; no identifiers."""
import json
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build():
    source=ROOT/'analysis/eda_summary.json'
    rows=json.loads(source.read_text())
    base=json.loads((ROOT/'src/data/ticket-aggregates.json').read_text())
    years=[]
    for r in rows:
        a=next(x for x in base['years'] if x['source']==r['source'])
        assert r['rows']==a['rows']==sum(r['station_board'].values())==sum(r['station_alight'].values())
        assert sum(x['transactions'] for x in r['route_table'])==r['rows']
        assert sum(x['actual_sum'] for x in r['route_table'])==r['actual_sum']
        assert sum(x['actual_sum'] for x in r['ticket_category_table'])==r['actual_sum']
        assert sum(r['route_month'].values())==r['rows']
        years.append(dict(year=int(r['source'][:4]),source=r['source'],rows=r['rows'],
            actual_sum=r['actual_sum'],original_sum=r['original_sum'],discount_quota_sum=r['discount_quota_sum'],
            routes=r['route_table'],route_month={k:v if v>=10 else None for k,v in r['route_month'].items()},
            stations=[dict(name=x['name'],boardings=x['boardings'],alightings=r['station_alight'].get(x['name'])) for x in r['board_station_table'][:8]],
            od=r['od_table'][:10],categories=r['ticket_category_table'],
            peak_duration=[x for x in r['peak_duration_table'] if x['count']>=50],
            quality={k:r[k] for k in ['over_6h','same_station','duplicate_rows','unparseable','actual_gt_original']}))
    return dict(schema_version=1,source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        scope='6670 全部子線；交易尚未去重。無個別卡號、車號或司機編號。',
        duration_definition='上下車刷卡時間差；只納入 0–360 分鐘。P85 為第85百分位，非延誤或保證抵達時間。',
        category_definition='按票種文字關鍵字依序分組：中彰投苗／通勤／南投縣境／南投區／臺中市區／台中市境／臺中市境→定期類；敬老；愛心／博愛／陪伴／仁愛；學生／暨南大學；一般／優待；其餘→其他。非核定票種字典，不推論身分、旅遊目的或政策因果。',years=years)
if __name__=='__main__':
    result=build();(ROOT/'src/data/baseline-dashboard.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    print('Exported reviewed aggregate fields:',len(result['years']),'years')
