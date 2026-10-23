"""6670 刷卡資料深度分析（只輸出聚合，不含卡號、車號、司機編號）。
用法：python3 scripts/deep_analysis.py <2024.xlsx> <2025.xlsx> > data/deep-analysis.json
"""
import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
import zipfile, json, re, statistics
from tripsplit import split_all
import xml.etree.ElementTree as E
from collections import Counter, defaultdict
from datetime import datetime, timedelta, date

N = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
RANK = {'台中航空站': 0, '臺中': 1, '高鐵臺中站': 2, '牛耳石雕公園': 3, '崎下': 3.5, '埔里站': 4, '暨南大學': 4.6, '暨南大學校內': 4.6,
        '桃米坑': 5, '大雁': 6, '魚池': 7, '日月老茶廠': 8, '九族文化村': 8.5, '水社': 9, '日月潭': 9, '向山行政中心': 10}
HOL = set()
for a, b in [('2024-01-01', '2024-01-01'), ('2024-02-08', '2024-02-14'), ('2024-02-28', '2024-02-28'), ('2024-04-04', '2024-04-07'), ('2024-05-01', '2024-05-01'),
             ('2024-06-08', '2024-06-10'), ('2024-09-17', '2024-09-17'), ('2024-10-10', '2024-10-10'), ('2025-01-01', '2025-01-01'), ('2025-01-25', '2025-02-02'),
             ('2025-02-28', '2025-03-02'), ('2025-04-03', '2025-04-06'), ('2025-05-01', '2025-05-01'), ('2025-05-30', '2025-06-01'), ('2025-09-27', '2025-09-29'),
             ('2025-10-04', '2025-10-06'), ('2025-10-10', '2025-10-12'), ('2025-10-24', '2025-10-26'), ('2025-12-25', '2025-12-25')]:
    d = date.fromisoformat(a)
    while d <= date.fromisoformat(b): HOL.add(d.isoformat()); d += timedelta(days=1)
KEY_OD = [('埔里站', '高鐵臺中站'), ('高鐵臺中站', '埔里站'), ('高鐵臺中站', '日月潭'), ('日月潭', '高鐵臺中站'), ('臺中', '日月潭'), ('日月潭', '臺中'), ('臺中', '埔里站'), ('埔里站', '臺中')]

def tgroup(name):
    n = name or ''
    if '敬' in n: return '敬老'
    if '愛' in n: return '愛心／陪同'
    if '學' in n: return '學生'
    if '暨南' in n: return '暨大師生'
    if '兒' in n or '孩' in n: return '兒童'
    if '社福' in n or '優待' in n: return '其他優待'
    return '一般'

def rows(path):
    z = zipfile.ZipFile(path); strings = []
    for _, el in E.iterparse(z.open('xl/sharedStrings.xml')):
        if el.tag == N + 'si': strings.append(''.join(el.itertext())); el.clear()
    book = E.fromstring(z.read('xl/workbook.xml')); wp = book.find(N + 'workbookPr')
    epoch = datetime(1904, 1, 1) if wp is not None and wp.get('date1904') in ('1', 'true') else datetime(1899, 12, 30)
    rels = {e.get('Id'): e.get('Target') for e in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for sh in book.find(N + 'sheets'):
        t = rels[sh.get(R + 'id')]; t = t.lstrip('/') if t.startswith('/') else 'xl/' + t
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
            row.clear(); yield epoch, vals

def pct(a, p):
    if not a: return None
    a = sorted(a); k = (len(a) - 1) * p; f = int(k)
    return round(a[f] if f + 1 >= len(a) else a[f] + (a[f + 1] - a[f]) * (k - f), 1)
fl = lambda x: float(x) if x not in (None, '') else 0.0

def run(path):
    st_b, st_a = Counter(), Counter(); st_hour = defaultdict(lambda: [0] * 24); st_cls = defaultdict(lambda: [0, 0])
    od = Counter(); od_rev = Counter(); od_tt = defaultdict(list); od_fare = defaultdict(list)
    tt_hour = defaultdict(list); tt_cls = defaultdict(list)
    daily = defaultdict(lambda: [0, 0.0]); dow_hour = [[[0] * 24 for _ in range(7)] for _ in range(2)]
    month = defaultdict(lambda: [0, 0.0]); route = defaultdict(lambda: [0, 0.0, 0, 0]); tk = defaultdict(lambda: [0, 0.0, 0.0])
    issuer = Counter(); tot = [0, 0.0, 0.0, 0.0]; hour_rev = [0.0] * 24
    trips = defaultdict(list); vday = defaultdict(lambda: [None, None]); cards = Counter(); total = 0
    for epoch, v in rows(path):
        if not any(x is not None for x in v): continue
        total += 1
        try:
            bt = epoch + timedelta(days=float(v[8])); at = epoch + timedelta(days=float(v[11])); bs, as_ = int(float(v[9])), int(float(v[12]))
        except (TypeError, ValueError, OverflowError): continue
        o, d = (v[10] or '未知'), (v[13] or '未知'); r = (v[5] or '未分類').strip()
        ro, rd = RANK.get(o), RANK.get(d)
        dr = (0 if rd > ro else 1) if (ro is not None and rd is not None and ro != rd) else (0 if as_ > bs else 1)
        day = bt.date().isoformat(); off = 1 if (bt.weekday() >= 5 or day in HOL) else 0
        paid, orig, disc = fl(v[14]), fl(v[15]), fl(v[17])
        st_b[o] += 1; st_a[d] += 1; st_hour[o][bt.hour] += 1; st_cls[o][off] += 1
        od[(o, d)] += 1; od_rev[(o, d)] += paid; od_fare[(o, d)].append(paid)
        m = (at - bt).total_seconds() / 60
        if 3 < m < 360:
            od_tt[(o, d)].append(m)
            if (o, d) in KEY_OD: tt_hour[(o, d, bt.hour)].append(m); tt_cls[(o, d, off)].append(m)
        daily[day][0] += 1; daily[day][1] += paid
        dow_hour[dr][bt.weekday()][bt.hour] += 1; month[bt.month][0] += 1; month[bt.month][1] += paid
        rr = route[r]; rr[0] += 1; rr[1] += paid; rr[2 + dr] += 1
        g = tk[tgroup(v[4])]; g[0] += 1; g[1] += paid; g[2] += disc
        issuer[v[0] or '未知'] += 1; tot[0] += 1; tot[1] += paid; tot[2] += orig; tot[3] += disc; hour_rev[bt.hour] += paid
        if v[2]: cards[v[2]] += 1
        plate = v[7] or ''
        if plate and 0 < m <= 240:
            trips[(plate, day, dr)].append((bt, ro if ro is not None else bs, rd if rd is not None else as_, paid, r, at))
            vd = vday[(plate, day)]; vd[0] = bt if vd[0] is None or bt < vd[0] else vd[0]; vd[1] = at if vd[1] is None or at > vd[1] else vd[1]
    # ---- 推估車次 ----
    tlist = []
    tlist.extend(split_all(trips, at=lambda x: x[5])[0])
    T = []; v_trips = Counter()
    for plate, day, dr, cur in tlist:
        delta = Counter()
        for _, b, a, *_ in cur: k = 1 if dr == 0 else -1; delta[b * k] += 1; delta[a * k] -= 1
        on = pk = 0
        for kk in sorted(delta): on += delta[kk]; pk = max(pk, on)
        t0 = cur[0][0]; rc = Counter(x[4] for x in cur).most_common(1)[0][0]
        off = 1 if (t0.weekday() >= 5 or day in HOL) else 0
        T.append((dr, off, t0.hour, rc, len(cur), pk, sum(x[3] for x in cur), t0.month)); v_trips[(plate, day)] += 1
    days = sorted(daily); n_off = sum(1 for d in days if date.fromisoformat(d).weekday() >= 5 or d in HOL); n_wd = len(days) - n_off
    def tstat(sel):
        if not sel: return None
        pk = [t[5] for t in sel]; n = [t[4] for t in sel]; rv = [t[6] for t in sel]
        return {'trips': len(sel), 'pax_mean': round(statistics.mean(n), 1), 'peak_mean': round(statistics.mean(pk), 1), 'peak_p50': pct(pk, .5), 'peak_p90': pct(pk, .9),
                'lt10': round(sum(1 for p in pk if p < 10) / len(pk), 3), 'ge30': round(sum(1 for p in pk if p >= 30) / len(pk), 3), 'ge43': round(sum(1 for p in pk if p >= 43) / len(pk), 3),
                'rev_mean': round(statistics.mean(rv)), 'rev_p50': pct(rv, .5)}
    by_route = {rc: tstat([t for t in T if t[3] == rc]) for rc in sorted(set(t[3] for t in T))}
    by_hour = []
    for dr in (0, 1):
        for off in (0, 1):
            for h in range(5, 24):
                sel = [t for t in T if t[0] == dr and t[1] == off and t[2] == h]
                if len(sel) >= 20: s = tstat(sel); s.update({'dir': dr, 'off': off, 'hour': h, 'per_day': round(len(sel) / (n_off if off else n_wd), 2)}); by_hour.append(s)
    peak_hist = Counter(min(t[5] // 5, 12) for t in T); pax_hist = Counter(min(t[4] // 5, 16) for t in T); rev_hist = Counter(min(int(t[6] // 500), 16) for t in T)
    vd_n = Counter(); vd_span = []; vd_trips = []
    for (plate, day), (a, b) in vday.items():
        vd_n[day] += 1; vd_span.append((b - a).total_seconds() / 3600); vd_trips.append(v_trips[(plate, day)])
    veh_day = [vd_n[d] for d in days]
    veh_off = [vd_n[d] for d in days if date.fromisoformat(d).weekday() >= 5 or d in HOL]; veh_wd = [vd_n[d] for d in days if not (date.fromisoformat(d).weekday() >= 5 or d in HOL)]
    trip_day = Counter((t[1],) for t in T)
    cb = Counter()
    for c, n in cards.items(): cb['1' if n == 1 else '2' if n == 2 else '3-5' if n <= 5 else '6-10' if n <= 10 else '11-50' if n <= 50 else '51+'] += 1
    stations = sorted(set(st_b) | set(st_a), key=lambda s: RANK.get(s, 99))
    return {
        'source': path.split('/')[-1], 'rows': total, 'days': len(days), 'off_days': n_off, 'wd_days': n_wd,
        'totals': {'tx': tot[0], 'paid': round(tot[1]), 'orig': round(tot[2]), 'disc': round(tot[3])},
        'stations': [{'name': s, 'rank': RANK.get(s), 'board': st_b[s], 'alight': st_a[s], 'board_off_share': round(st_cls[s][1] / max(1, st_b[s]), 3), 'hour': st_hour[s]} for s in stations],
        'od': [{'o': o, 'd': d, 'n': n, 'rev': round(od_rev[(o, d)]), 'fare_med': pct(od_fare[(o, d)], .5), 'tt_med': pct(od_tt[(o, d)], .5), 'tt_p85': pct(od_tt[(o, d)], .85), 'tt_p15': pct(od_tt[(o, d)], .15)} for (o, d), n in od.most_common() if n >= 30],
        'tt_hour': [{'o': o, 'd': d, 'hour': h, 'n': len(L), 'med': pct(L, .5), 'p85': pct(L, .85)} for (o, d, h), L in sorted(tt_hour.items()) if len(L) >= 50],
        'tt_cls': [{'o': o, 'd': d, 'off': c, 'med': pct(L, .5), 'p85': pct(L, .85), 'n': len(L)} for (o, d, c), L in sorted(tt_cls.items())],
        'daily': [{'date': d, 'n': daily[d][0], 'rev': round(daily[d][1]), 'veh': vd_n[d]} for d in days],
        'dow_hour': dow_hour, 'month': {m: {'n': month[m][0], 'rev': round(month[m][1])} for m in sorted(month)},
        'routes': [{'route': r, 'n': x[0], 'rev': round(x[1]), 'out': x[2], 'in': x[3]} for r, x in sorted(route.items(), key=lambda kv: -kv[1][0])],
        'tickets': [{'group': g, 'n': x[0], 'rev': round(x[1]), 'disc': round(x[2])} for g, x in sorted(tk.items(), key=lambda kv: -kv[1][0])],
        'issuer': issuer.most_common(8), 'hour_rev': [round(x) for x in hour_rev],
        'trips': {'n': len(T), 'all': tstat(T), 'off': tstat([t for t in T if t[1]]), 'wd': tstat([t for t in T if not t[1]]),
                  'dir0': tstat([t for t in T if t[0] == 0]), 'dir1': tstat([t for t in T if t[0] == 1]),
                  'by_route': by_route, 'by_hour': by_hour, 'peak_hist': [peak_hist[i] for i in range(13)], 'pax_hist': [pax_hist[i] for i in range(17)], 'rev_hist': [rev_hist[i] for i in range(17)],
                  'per_day_off': round(sum(1 for t in T if t[1]) / max(1, n_off), 1), 'per_day_wd': round(sum(1 for t in T if not t[1]) / max(1, n_wd), 1)},
        'vehicles': {'per_day_mean': round(statistics.mean(veh_day), 1), 'per_day_off': round(statistics.mean(veh_off), 1), 'per_day_wd': round(statistics.mean(veh_wd), 1),
                     'trips_per_vday': round(statistics.mean(vd_trips), 2), 'span_h_med': round(statistics.median(vd_span), 1), 'distinct': len({p for p, _ in vday})},
        'cards': {'distinct': len(cards), 'buckets': cb},
    }

if __name__ == '__main__':
    out = {'generated_at': datetime.now().isoformat(timespec='seconds'), 'privacy': '僅聚合；卡號、車號、司機編號未輸出',
           'notes': ['方向依計費站地理順序判定。', '推估車次：同車號、同日、同方向依上車時間排序，車上刷卡乘客全部下車 30 分鐘後（或與前一筆上車相隔 > 3 小時）才算下一班；與同車較大車次重疊的 ≤4 筆小片段併入（scripts/tripsplit.py）。旅次時間 ≤0 或 >240 分的紀錄不計入車次。', '區段最大在車＝依站序累計上車減下車，只含刷卡旅客。',
                     '休息日＝週六、週日與國定假日（含連假）。', '票收＝交易實扣加總；優惠＝優惠額度加總。'],
           'years': [run(p) for p in sys.argv[1:]]}
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
