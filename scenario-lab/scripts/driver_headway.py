"""從刷卡資料推估：(1) 司機實際值勤型態（只輸出聚合）(2) 各站實際班距與隨機到站的期望等候。
用法：python3 scripts/driver_headway.py <2024.xlsx> <2025.xlsx> > data/driver-headway.json
"""
import sys, json, statistics
from collections import Counter, defaultdict
from datetime import timedelta, date
sys.path.insert(0, __import__('os').path.dirname(__file__))
from deep_analysis import rows, RANK, HOL
from tripsplit import split_all

STA = ['臺中', '高鐵臺中站', '埔里站', '日月潭']

def run(path):
    trips = defaultdict(list)
    for epoch, v in rows(path):
        if not any(x is not None for x in v): continue
        try:
            bt = epoch + timedelta(days=float(v[8])); at = epoch + timedelta(days=float(v[11])); bs, as_ = int(float(v[9])), int(float(v[12]))
        except (TypeError, ValueError, OverflowError): continue
        o, d = v[10] or '', v[13] or ''; ro, rd = RANK.get(o), RANK.get(d)
        dr = (0 if rd > ro else 1) if (ro is not None and rd is not None and ro != rd) else (0 if as_ > bs else 1)
        m = (at - bt).total_seconds() / 60
        if v[7] and 0 < m <= 240: trips[(v[7], bt.date().isoformat(), dr)].append((bt, at, o, v[6] or ''))
    T = []
    T.extend(split_all(trips, at=lambda x: x[1])[0])
    # ---- 司機值勤 ----
    duty = defaultdict(list); pass_t = defaultdict(list)
    for plate, day, dr, cur in T:
        drv = Counter(x[3] for x in cur).most_common(1)[0][0]
        st, en = min(x[0] for x in cur), max(x[1] for x in cur)
        if drv: duty[(drv, day)].append((st, en, plate))
        first = {}
        for bt, at, o, _ in cur:
            if o in STA and (o not in first or bt < first[o]): first[o] = bt
        for s, t in first.items(): pass_t[(s, dr, day)].append(t)
    spans, drives, ntr, cont, buses, starts, ends, gaps = [], [], [], [], [], Counter(), Counter(), []
    per_day = Counter(); off_days = set()
    for (drv, day), L in duty.items():
        L.sort(); s0, e1 = L[0][0], max(x[1] for x in L)
        span = (e1 - s0).total_seconds() / 3600; drive = sum((e - s).total_seconds() for s, e, _ in L) / 3600
        c = best = (L[0][1] - L[0][0]).total_seconds() / 3600
        for a, b in zip(L, L[1:]):
            g = (b[0] - a[1]).total_seconds() / 60; gaps.append(g)
            c = c + (b[1] - b[0]).total_seconds() / 3600 if g < 30 else (b[1] - b[0]).total_seconds() / 3600; best = max(best, c)
        spans.append(span); drives.append(drive); ntr.append(len(L)); cont.append(best); buses.append(len({p for _, _, p in L}))
        starts[s0.hour] += 1; ends[e1.hour] += 1; per_day[day] += 1
        if date.fromisoformat(day).weekday() >= 5 or day in HOL: off_days.add(day)
    hb = lambda a, w, n: [sum(1 for x in a if i * w <= x < (i + 1) * w) if i < n - 1 else sum(1 for x in a if x >= i * w) for i in range(n)]
    days = sorted(per_day)
    drv_out = {
        'driver_days': len(spans), 'distinct_drivers': len({k[0] for k in duty}),
        'per_day_wd': round(statistics.mean([per_day[d] for d in days if d not in off_days]), 1), 'per_day_off': round(statistics.mean([per_day[d] for d in days if d in off_days]), 1),
        'span_med': round(statistics.median(spans), 2), 'span_p90': round(sorted(spans)[int(len(spans) * .9)], 2), 'drive_med': round(statistics.median(drives), 2),
        'trips_med': statistics.median(ntr), 'trips_mean': round(statistics.mean(ntr), 2),
        'share_span_gt10': round(sum(1 for x in spans if x > 10) / len(spans), 3), 'share_span_gt12': round(sum(1 for x in spans if x > 12) / len(spans), 3),
        'share_cont_gt4': round(sum(1 for x in cont if x > 4) / len(cont), 3), 'share_multi_bus': round(sum(1 for x in buses if x > 1) / len(buses), 3),
        'span_hist': hb(spans, 1, 16), 'drive_hist': hb(drives, 1, 12), 'trips_hist': Counter(min(x, 10) for x in ntr),
        'start_hour': [starts[h] for h in range(24)], 'end_hour': [ends[h] for h in range(24)],
        'gap_med': round(statistics.median(gaps), 1) if gaps else None, 'gap_hist': hb(gaps, 15, 13),
    }
    # ---- 班距與期望等候 ----
    agg = defaultdict(lambda: [0, 0.0, 0.0])   # (sta, dr, off, hour) -> n, sum h, sum h^2
    for (s, dr, day), ts in pass_t.items():
        ts.sort(); off = 1 if (date.fromisoformat(day).weekday() >= 5 or day in HOL) else 0
        for a, b in zip(ts, ts[1:]):
            h = (b - a).total_seconds() / 60
            if 1 <= h <= 180 and 6 <= b.hour <= 21: x = agg[(s, dr, off, b.hour)]; x[0] += 1; x[1] += h; x[2] += h * h
    hw = [{'sta': s, 'dir': dr, 'off': off, 'hour': hr, 'n': x[0], 'mean_h': round(x[1] / x[0], 1), 'exp_wait': round(x[2] / (2 * x[1]), 1)}
          for (s, dr, off, hr), x in sorted(agg.items()) if x[0] >= 30]
    return {'source': path.split('/')[-1], 'drivers': drv_out, 'headway': hw}

if __name__ == '__main__':
    out = {'notes': ['司機值勤：同一司機編號同日的推估車次串起來；值勤時間＝首班第一筆上車到末班最後一筆下車，會低估（不含出入場、空車調度、未刷卡區段）。',
                     '班距：同站同方向相鄰推估車次「該站第一筆上車時刻」之差（不分子線）；期望等候＝E[h²]/(2E[h])，假設旅客隨機到站。',
                     '隱私：司機編號、車號、卡號只在記憶體中計數，不輸出。'],
           'years': [run(p) for p in sys.argv[1:]]}
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
