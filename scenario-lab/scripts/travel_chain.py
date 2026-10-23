"""同日卡號旅次鏈：旅客在目的地停留多久（只輸出聚合，卡號只在記憶體中使用）。
用法：python3 scripts/travel_chain.py <2024.xlsx> <2025.xlsx> > data/travel-chain.json
定義：同一卡號、同一天，先「去程」到某區（下車），之後從同一區「回程」上車；停留時間＝回程上車 − 去程下車。
只取一天恰好一去一回的卡（排除通勤多段），區＝埔里、日月潭（含水社、向山）、九族、暨大、魚池。
"""
import sys, json, statistics
from collections import Counter, defaultdict
from datetime import timedelta, date
sys.path.insert(0, __import__('os').path.dirname(__file__))
from deep_analysis import rows, RANK, HOL

ZONE = {'埔里站': '埔里', '崎下': '埔里', '牛耳石雕公園': '埔里', '日月潭': '日月潭', '水社': '日月潭', '向山行政中心': '日月潭',
        '九族文化村': '九族', '暨南大學': '暨大', '暨南大學校內': '暨大', '魚池': '魚池', '桃米坑': '魚池', '大雁': '魚池', '日月老茶廠': '魚池'}
ORIG = {'臺中': '台中', '台中航空站': '台中', '高鐵臺中站': '高鐵'}

def run(path):
    by = defaultdict(list)
    for epoch, v in rows(path):
        if not any(x is not None for x in v) or not v[2]: continue
        try: bt = epoch + timedelta(days=float(v[8])); at = epoch + timedelta(days=float(v[11]))
        except (TypeError, ValueError, OverflowError): continue
        o, d = v[10] or '', v[13] or ''
        m = (at - bt).total_seconds() / 60
        if m <= 0 or m > 240: continue
        by[(v[2], bt.date())].append((bt, at, o, d))
    dwell = defaultdict(list); arr_h = defaultdict(Counter); ret_h = defaultdict(Counter); n_pair = Counter(); n_cards = 0
    for (card, day), L in by.items():
        n_cards += 1
        if len(L) != 2: continue
        L.sort(); (b1, a1, o1, d1), (b2, a2, o2, d2) = L
        z = ZONE.get(d1)
        if not z or ZONE.get(o2) != z or o1 not in ORIG or d2 not in ORIG: continue
        h = (b2 - a1).total_seconds() / 3600
        if h <= 0: continue
        off = 1 if (day.weekday() >= 5 or day.isoformat() in HOL) else 0
        dwell[(z, off)].append(h); arr_h[(z, off)][a1.hour] += 1; ret_h[(z, off)][b2.hour] += 1; n_pair[(z, off)] += 1
    out = []
    for (z, off), H in sorted(dwell.items()):
        H.sort(); q = lambda p: round(H[min(len(H) - 1, int(len(H) * p))], 2)
        hist = [sum(1 for x in H if i <= x < i + 1) for i in range(12)] + [sum(1 for x in H if x >= 12)]
        out.append({'zone': z, 'off': off, 'n': len(H), 'p25': q(.25), 'p50': q(.5), 'p75': q(.75), 'p90': q(.9), 'hist': hist,
                    'arr_hour': [arr_h[(z, off)][i] for i in range(24)], 'ret_hour': [ret_h[(z, off)][i] for i in range(24)]})
    return {'source': path.split('/')[-1], 'card_days': n_cards, 'pairs': sum(n_pair.values()), 'zones': out}

if __name__ == '__main__':
    json.dump({'note': '同卡同日恰好一去一回（台中/高鐵 → 區 → 台中/高鐵）；停留＝回程上車 − 去程下車（小時）。只輸出聚合。',
               'years': [run(p) for p in sys.argv[1:]]}, sys.stdout, ensure_ascii=False, separators=(',', ':'))
