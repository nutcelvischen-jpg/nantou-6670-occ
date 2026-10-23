"""從兩年刷卡原始檔還原「每一天的每一班車」，供 3D 資料重播與班次分析使用。
只用資料裡有的欄位：上車時間/站、下車時間/站、子線、車號、司機編號、實扣金額。
不產生任何旅客到站、候車、滿載未上車等資料中沒有的量。
用法：python3 scripts/build_replay.py <2024.xlsx> <2025.xlsx> > data/replay-all.json
輸出（隱私）：車號、司機編號只換成「當日匿名序號」（B01、D01…），卡號完全不輸出。
車次切分：見 tripsplit.py（車上票證乘客全部下車 30 分鐘後才算新的一班）。
旅次時間 ≤0 或 >240 分的紀錄不計入（每日數量記在 qc[0]）；同站上下車記在 qc[1]；缺車號記在 qc[2]；併入同車重疊大車次的小片段數記在 qc[3]。
各站時刻：該班在該站最早的上車刷卡時間；沒有人上車的站用最早的下車刷卡時間。
"""
import sys, json, statistics
from collections import Counter, defaultdict
from datetime import timedelta, date
sys.path.insert(0, __import__('os').path.dirname(__file__))
from deep_analysis import rows, RANK, HOL
from tripsplit import split_all, FOLD

STA = sorted(RANK, key=lambda s: (RANK[s], s))

def run(path):
    trips = defaultdict(list); qc = defaultdict(lambda: [0, 0, 0])   # 每日：時間異常、同站上下車、缺車號
    for epoch, v in rows(path):
        if not any(x is not None for x in v): continue
        try:
            bt = epoch + timedelta(days=float(v[8])); at = epoch + timedelta(days=float(v[11])); bs, as_ = int(float(v[9])), int(float(v[12]))
        except (TypeError, ValueError, OverflowError): continue
        o, d = v[10] or '', v[13] or ''
        if o not in RANK or d not in RANK: continue
        ro, rd = RANK[o], RANK[d]
        dr = (0 if rd > ro else 1) if ro != rd else (0 if as_ > bs else 1)
        try: paid = float(v[14] or 0)
        except ValueError: paid = 0.0
        m = (at - bt).total_seconds() / 60; day = bt.date().isoformat()
        if m <= 0 or m > 240: qc[day][0] += 1; continue      # 時間異常：不計入在車量（另列數量）
        if o == d: qc[day][1] += 1                             # 同站上下車：保留（上下相抵，不影響在車量）
        if v[7]: trips[(v[7], day, dr)].append((bt, at, o, d, v[6] or '', (v[5] or '').strip(), paid))
        else: qc[day][2] += 1
    T, folded = split_all(trips, at=lambda x: x[1])
    days = defaultdict(list)
    for plate, day, dr, cur in T: days[day].append((plate, dr, cur))
    out = {}
    for day, L in sorted(days.items()):
        t0 = date.fromisoformat(day)
        mins = lambda t: round((t.date() - t0).days * 1440 + t.hour * 60 + t.minute + t.second / 60, 1)
        L.sort(key=lambda x: min(e[0] for e in x[2]))
        bus_id, drv_id, rec = {}, {}, []
        for plate, dr, cur in L:
            bus_id.setdefault(plate, len(bus_id) + 1)
            drv = Counter(e[4] for e in cur).most_common(1)[0][0]
            if drv: drv_id.setdefault(drv, len(drv_id) + 1)
            code = Counter(e[5] for e in cur).most_common(1)[0][0]
            ev = defaultdict(lambda: [None, None, 0, 0])   # sta -> min board t, min alight t, boards, alights
            for bt, at, o, d, _, _, _ in cur:
                x = ev[o]; x[0] = bt if x[0] is None or bt < x[0] else x[0]; x[2] += 1
                y = ev[d]; y[1] = at if y[1] is None or at < y[1] else y[1]; y[3] += 1
            stops = sorted(ev.items(), key=lambda kv: (RANK[kv[0]] if dr == 0 else -RANK[kv[0]], kv[1][0] or kv[1][1]))
            seq, last = [], -1e9
            for s, (b, a, nb, na) in stops:
                t = mins(b if b is not None else a); t = max(t, last); last = t
                seq.append([STA.index(s), t, nb, na])
            rec.append([dr, code, bus_id[plate], drv_id.get(drv, 0), seq, round(sum(e[6] for e in cur))])
        off = 1 if (t0.weekday() >= 5 or day in HOL) else 0
        out[day] = {'off': off, 'taps': sum(len(c) for _, _, c in L), 'qc': qc[day] + [folded[day]], 'trips': rec}
    return out

if __name__ == '__main__':
    D = {}
    for p in sys.argv[1:]: D.update(run(p))
    json.dump({'stations': STA, 'note': '車號、司機編號為當日匿名序號；各站時刻＝該班該站最早上車刷卡（無上車則最早下車刷卡）。', 'days': D}, sys.stdout, ensure_ascii=False, separators=(',', ':'))
