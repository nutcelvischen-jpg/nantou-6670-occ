"""推估車次切分（所有腳本共用）。

舊規則「同車號同方向，相鄰上車間隔 > 40 分鐘就切」會把一班車切成兩段：
山區長路段（例如高鐵→埔里約 55 分）常常超過 40 分鐘沒有人上車。檢查 2024–2025 年，
同一台車前後兩個推估車次有 28.6% 在時間上重疊，就是這個原因。

新規則：同車號、同日、同方向的刷卡依上車時間排序，只有在
  (1) 這筆上車時刻 > 目前車次「最晚的下車時刻」+ EMPTY 分鐘（車上的票證乘客都已下車一段時間），或
  (2) 與前一筆上車相隔 > MAXGAP 分鐘
才切成新的一班。同方向的下一班一定要先跑一趟反方向，中間通常超過 1 小時，所以 (1) 足以區分。
旅次時間 <= 0 或 > LONG 分鐘的紀錄（資料異常，例如 2024 年 71 筆、2025 年 180 筆超過 6 小時）
不拿來延長「最晚下車時刻」，以免把不同班黏在一起。
"""
from datetime import timedelta

EMPTY, MAXGAP, LONG = 30, 180, 240

def split(L, bt=lambda x: x[0], at=None):
    """L：同車號同日同方向的紀錄；bt/at：取上車、下車時間的函式。回傳車次（list of list）。"""
    if not L: return []
    L = sorted(L, key=bt)
    def eff(x):
        b = bt(x); a = at(x) if at else None
        if a is None: return b
        m = (a - b).total_seconds() / 60
        return a if 0 < m <= LONG else b
    out, cur, mx, last = [], [L[0]], eff(L[0]), bt(L[0])
    for x in L[1:]:
        b = bt(x)
        if b > mx + timedelta(minutes=EMPTY) or (b - last).total_seconds() > MAXGAP * 60:
            out.append(cur); cur, mx = [x], eff(x)
        else:
            cur.append(x); mx = max(mx, eff(x))
        last = b
    out.append(cur)
    return out


FOLD = 4   # 筆數 <= FOLD 的小片段

def split_all(groups, bt=lambda x: x[0], at=None):
    """groups：{(車號, 日期, 方向): [紀錄…]}。先依 split() 切車次，再把「同車同日、<= FOLD 筆、
    且與另一個較大車次時間重疊」的小片段併入該車次（同一台車不可能同時跑兩班；這些片段多是
    站序方向判斷不明的短程，例如埔里→崎下、同站上下車）。
    回傳 (車次 list of (車號, 日期, 方向, 紀錄), {日期: 併入片段數})。被併入的片段方向以大車次為準。"""
    T = []
    for (p, day, dr), L in groups.items():
        for cur in split(L, bt, at): T.append([p, day, dr, cur])
    span = lambda c: (min(bt(x) for x in c), max((at(x) if at else bt(x)) for x in c))
    byp = {}
    for x in T: byp.setdefault((x[0], x[1]), []).append(x)
    from collections import Counter
    out, folded = [], Counter()
    for L in byp.values():
        big = [x for x in L if len(x[3]) > FOLD]; spans = [span(x[3]) for x in big]
        out.extend(big)
        for x in L:
            if len(x[3]) > FOLD: continue
            s0, s1 = span(x[3])
            host = next((g for g, (g0, g1) in zip(big, spans) if g0 <= s1 and s0 <= g1), None)
            if host is not None: host[3].extend(x[3]); folded[x[1]] += 1
            else: out.append(x)
    for x in out: x[3].sort(key=bt)
    return [tuple(x) for x in out], folded
