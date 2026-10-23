"""6670 票證 → 營運決策用聚合（不輸出卡號、車號、司機編號）。
用法：python3 build_ops_aggregates.py <xlsx...> > ../data/ops-aggregates.json
"""
import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
import zipfile, json, re, statistics
from tripsplit import split_all
import xml.etree.ElementTree as E
from collections import Counter, defaultdict
from datetime import datetime, timedelta

N = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

def rows(path):
    z = zipfile.ZipFile(path)
    strings = []
    for _, el in E.iterparse(z.open('xl/sharedStrings.xml')):
        if el.tag == N + 'si':
            strings.append(''.join(el.itertext())); el.clear()
    book = E.fromstring(z.read('xl/workbook.xml'))
    wp = book.find(N + 'workbookPr')
    epoch = datetime(1904, 1, 1) if wp is not None and wp.get('date1904') in ('1', 'true') else datetime(1899, 12, 30)
    rels = {e.get('Id'): e.get('Target') for e in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for sh in book.find(N + 'sheets'):
        t = rels[sh.get(R + 'id')]
        t = t.lstrip('/') if t.startswith('/') else 'xl/' + t
        for _, row in E.iterparse(z.open(t)):
            if row.tag != N + 'row': continue
            if row.get('r') == '1': row.clear(); continue
            vals = [None] * 18
            for c in row:
                m = re.match('[A-Z]+', c.get('r', ''))
                if not m: continue
                i = 0
                for ch in m.group(): i = i * 26 + ord(ch) - 64
                v = c.find(N + 'v'); val = v.text if v is not None else None
                if c.get('t') == 's' and val is not None: val = strings[int(val)]
                if i <= 18: vals[i - 1] = val.strip() if isinstance(val, str) else val
            row.clear()
            yield epoch, vals

# 依地理順序（台中 → 日月潭）定方向；票證的計費站序在不同子線編號不一致，不能直接比大小
RANK = {'台中航空站': 0, '臺中': 1, '高鐵臺中站': 2, '牛耳石雕公園': 3, '崎下': 3.5, '埔里站': 4, '暨南大學': 4.6, '暨南大學校內': 4.6,
        '桃米坑': 5, '大雁': 6, '魚池': 7, '日月老茶廠': 8, '九族文化村': 8.5, '水社': 9, '日月潭': 9, '向山行政中心': 10}

def pct(a, p):
    if not a: return None
    a = sorted(a); k = (len(a) - 1) * p; f = int(k)
    return a[f] if f + 1 >= len(a) else a[f] + (a[f + 1] - a[f]) * (k - f)

def run(path):
    daily = defaultdict(lambda: [0, 0])                 # date -> [往日月潭, 往台中]
    dow_hour = defaultdict(lambda: [[0] * 24 for _ in range(2)])   # dow -> dir -> hour
    month_hour = defaultdict(lambda: [0] * 24)
    od = Counter(); st_seq = defaultdict(Counter); board = Counter(); alight = Counter()
    route = Counter(); route_dir = Counter(); ticket = Counter(); fare = defaultdict(list)
    tt = defaultdict(list)                                # (o,d) -> minutes
    per_trip = defaultdict(list)                          # (plate, date, dir) -> [(t, bseq, aseq)]
    total = parsed = 0
    for epoch, v in rows(path):
        if not any(x is not None for x in v): continue
        total += 1
        try:
            bt = epoch + timedelta(days=float(v[8])); at = epoch + timedelta(days=float(v[11]))
            bs, as_ = int(float(v[9])), int(float(v[12]))
        except (TypeError, ValueError, OverflowError):
            continue
        o, d = (v[10] or '未知'), (v[13] or '未知')
        r = (v[5] or '未分類').strip()
        ro, rd = RANK.get(o), RANK.get(d)
        if ro is not None and rd is not None and ro != rd: dr = 0 if rd > ro else 1
        else: dr = 0 if as_ > bs else 1
        bs, as_ = (ro if ro is not None else bs), (rd if rd is not None else as_)
        day = bt.date().isoformat()
        daily[day][dr] += 1
        dow_hour[bt.weekday()][dr][bt.hour] += 1
        month_hour[bt.month][bt.hour] += 1
        od[(o, d)] += 1; board[o] += 1; alight[d] += 1
        st_seq[o][bs] += 1; st_seq[d][as_] += 1
        route[r] += 1; route_dir[(r, dr)] += 1
        ticket[(v[4] or '未分類')[:4]] += 1
        try: fare[(o, d)].append(float(v[14]))
        except (TypeError, ValueError): pass
        m = (at - bt).total_seconds() / 60
        if 3 < m < 360: tt[(o, d)].append(m)
        plate = v[7] or ''
        if plate and 0 < m <= 240: per_trip[(plate, day, dr)].append((bt, bs, as_, at))
        parsed += 1

    # ---- 以車號＋日期＋方向 依時間切出「推估車次」，計算區段最大在車人數 ----
    trips = []
    for plate, day, dr, cur in split_all(per_trip, at=lambda x: x[3])[0]: trips.append((dr, cur))
    trip_hour = defaultdict(lambda: {'n': 0, 'pax': [], 'peak': []})   # (dir, weekend, hour)
    trips_per_day = defaultdict(lambda: [0, 0])
    peak_all = []
    for dr, cur in trips:
        t0 = cur[0][0]; we = 1 if t0.weekday() >= 5 else 0
        delta = Counter()
        for _, b, a, _ in cur:
            if dr == 0: delta[b] += 1; delta[a] -= 1
            else: delta[-b] += 1; delta[-a] -= 1
        on = peak = 0
        for k in sorted(delta): on += delta[k]; peak = max(peak, on)
        cell = trip_hour[(dr, we, t0.hour)]
        cell['n'] += 1; cell['pax'].append(len(cur)); cell['peak'].append(peak)
        trips_per_day[t0.date().isoformat()][dr] += 1
        peak_all.append(peak)

    days = sorted(daily)
    n_we = Counter(1 if datetime.fromisoformat(d).weekday() >= 5 else 0 for d in days)
    stations = []
    for s in set(board) | set(alight):
        seq = st_seq[s].most_common(1)[0][0] if st_seq[s] else None
        stations.append({'name': s, 'seq': seq, 'board': board[s], 'alight': alight[s]})
    stations.sort(key=lambda x: (x['seq'] is None, x['seq']))
    return {
        'source': path.split('/')[-1], 'rows': total, 'parsed': parsed,
        'daily': [{'date': d, 'out': daily[d][0], 'in': daily[d][1], 'trips_out': trips_per_day[d][0], 'trips_in': trips_per_day[d][1]} for d in days],
        'dow_hour': {str(k): v for k, v in sorted(dow_hour.items())},
        'month_hour': {str(k): v for k, v in sorted(month_hour.items())},
        'stations': stations,
        'od': [{'o': o, 'd': d, 'n': n, 'fare': round(statistics.median(fare[(o, d)]), 1) if fare[(o, d)] else None,
                'tt_med': round(statistics.median(tt[(o, d)]), 1) if len(tt[(o, d)]) >= 20 else None,
                'tt_p85': round(pct(tt[(o, d)], .85), 1) if len(tt[(o, d)]) >= 20 else None} for (o, d), n in od.most_common() if n >= 10],
        'routes': [{'route': r, 'dir': dr, 'n': n} for (r, dr), n in route_dir.most_common()],
        'ticket_prefix': [{'code': k, 'n': n} for k, n in ticket.most_common(12)],
        'trip_hour': [{'dir': dr, 'weekend': we, 'hour': h, 'trips_per_day': round(c['n'] / max(1, n_we[we]), 2),
                       'pax_mean': round(statistics.mean(c['pax']), 1), 'peak_mean': round(statistics.mean(c['peak']), 1),
                       'peak_p90': round(pct(c['peak'], .9), 1), 'share_over_43': round(sum(1 for p in c['peak'] if p > 43) / c['n'], 3)}
                      for (dr, we, h), c in sorted(trip_hour.items()) if c['n'] >= 5],
        'trip_peak_hist': [sum(1 for p in peak_all if lo <= p < hi) for lo, hi in [(0, 5), (5, 10), (10, 20), (20, 30), (30, 43), (43, 60), (60, 999)]],
        'n_trips': len(trips), 'n_days': len(days), 'n_weekend_days': n_we[1],
    }

if __name__ == '__main__':
    out = {'generated_at': datetime.now().isoformat(timespec='seconds'),
           'privacy': '僅聚合；卡號、車號、司機編號未輸出',
           'method_notes': ['方向：依計費站地理順序（台中→高鐵→埔里→魚池→日月潭→向山），下車站較靠日月潭為往日月潭（0），反之往台中（1）；同站上下車改用站序判斷。',
                            '推估車次：同車號、同日、同方向依上車時間排序，車上刷卡乘客全部下車 30 分鐘後（或與前一筆上車相隔 > 3 小時）才算下一班；與同車較大車次重疊的 ≤4 筆小片段併入（scripts/tripsplit.py）。旅次時間 ≤0 或 >240 分的紀錄不計入車次。',
                            '區段最大在車人數：依站序累計上車減下車；僅含刷卡旅客，不含現金與其他支付。'],
           'years': [run(p) for p in sys.argv[1:]]}
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
