"""車次切分邏輯檢查（只輸出統計，不輸出卡號車號）。
用法：python3 scripts/check_trips.py <2024.xlsx> <2025.xlsx>
檢查：
 A 同車同日：前後車次時間重疊比例（同車不可能同時跑兩班）
 B 車次持續時間分布（首筆上車→末筆下車）；>5 小時可能是兩班被黏在一起
 C 同一車次內「同一站的上車時間跨度」>45 分：可能把同方向兩班黏在一起
 D 依站序累計在車量出現負值的車次比例（方向或站序判斷錯）
 E 每日推估車次 vs 官網主表 82 班（主表不含九人座與加班車，推估應 >= 主表）
"""
import sys, statistics
from collections import Counter, defaultdict
from datetime import timedelta
sys.path.insert(0, __import__('os').path.dirname(__file__))
from deep_analysis import rows, RANK
from tripsplit import split_all

def run(path):
    recs = defaultdict(list)
    for epoch, v in rows(path):
        if not any(x is not None for x in v): continue
        try: bt = epoch + timedelta(days=float(v[8])); at = epoch + timedelta(days=float(v[11])); bs, as_ = int(float(v[9])), int(float(v[12]))
        except (TypeError, ValueError, OverflowError): continue
        o, d = v[10] or '', v[13] or ''
        if o not in RANK or d not in RANK or not v[7]: continue
        m = (at - bt).total_seconds() / 60
        if m <= 0 or m > 240: continue
        dr = (0 if RANK[d] > RANK[o] else 1) if RANK[o] != RANK[d] else (0 if as_ > bs else 1)
        recs[(v[7], bt.date(), dr)].append((bt, at, o, d))
    T = split_all({(p, day.isoformat(), dr): L for (p, day, dr), L in recs.items()}, at=lambda x: x[1])[0]
    by = defaultdict(list)
    for p, day, dr, c in T: by[(p, day)].append((min(x[0] for x in c), max(x[1] for x in c), len(c)))
    pairs = ov = ov_big = 0
    for L in by.values():
        L.sort()
        for a, b in zip(L, L[1:]):
            pairs += 1
            if b[0] < a[1] - timedelta(minutes=1):
                ov += 1
                if min(a[2], b[2]) > 4: ov_big += 1
    dur = [(max(x[1] for x in c) - min(x[0] for x in c)).total_seconds() / 60 for _, _, _, c in T]
    spread = 0; neg = 0
    for p, day, dr, c in T:
        st = defaultdict(list)
        for x in c: st[x[2]].append(x[0])
        if any((max(v) - min(v)).total_seconds() > 45 * 60 for v in st.values()): spread += 1
        delta = Counter()
        for x in c:
            k = 1 if dr == 0 else -1; delta[RANK[x[2]] * k] += 1; delta[RANK[x[3]] * k] -= 1
        on = 0
        for kk in sorted(delta):
            on += delta[kk]
            if on < 0: neg += 1; break
    per_day = Counter(day for _, day, _, _ in T)
    q = sorted(dur)
    return {'file': path.split('/')[-1], 'trips': len(T), 'A_pairs': pairs, 'A_overlap': ov, 'A_overlap_pct': round(ov / pairs * 100, 2), 'A_overlap_both_gt4': ov_big,
            'B_dur_p50': round(q[len(q) // 2]), 'B_dur_p95': round(q[int(len(q) * .95)]), 'B_dur_p99': round(q[int(len(q) * .99)]), 'B_dur_gt300': sum(1 for x in dur if x > 300),
            'C_same_stop_spread_gt45': spread, 'C_pct': round(spread / len(T) * 100, 2), 'D_negative_load': neg, 'D_pct': round(neg / len(T) * 100, 2),
            'E_trips_per_day_min_med_max': [min(per_day.values()), statistics.median(per_day.values()), max(per_day.values())], 'E_days_below_82': sum(1 for v in per_day.values() if v < 82)}

if __name__ == '__main__':
    for p in sys.argv[1:]: print(run(p))
