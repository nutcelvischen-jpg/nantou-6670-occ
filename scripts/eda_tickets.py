"""Full-year EDA for the two 6670 ticket XLSX sources; identifiers never exported."""
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timedelta, date
import zipfile, json, re, hashlib
import numpy as np
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1]
N = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

CATEGORY_RULES = [
    ('定期／TPASS', ['中彰投苗', '通勤', '南投縣境', '南投區', '臺中市區', '台中市境', '臺中市境']),
    ('敬老', ['敬老']),
    ('愛心／博愛／陪伴', ['愛心', '博愛', '陪伴', '仁愛']),
    ('學生', ['學生', '暨南大學']),
    ('一般', ['一般', '優待']),
]


def ticket_category(name):
    text = name or ''
    for category, keywords in CATEGORY_RULES:
        if any(k in text for k in keywords):
            return category
    return '其他／電子票證代碼'


def pct(part, whole):
    return round(part / whole * 100, 2) if whole else None


def num(value):
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def analyze(path):
    stats = {
        'source': path.name,
        'sheets': [],
        'rows': 0,
        'parsed': 0,
        'nulls': Counter(),
        'routes': Counter(),
        'route_month': Counter(),
        'vehicle_day': defaultdict(set),
        'route_actual': Counter(),
        'category_actual': Counter(),
        'od': Counter(),
        'od_actual': Counter(),
        'od_duration': defaultdict(list),
        'od_fare': defaultdict(list),
        'peak_duration': defaultdict(list),
        'stations': Counter(),
        'station_board': Counter(),
        'station_alight': Counter(),
        'ticket_types': Counter(),
        'ticket_categories': Counter(),
        'hours': Counter(),
        'weekday': Counter(),
        'daily': Counter(),
        'monthly': Counter(),
        'duration_buckets': Counter(),
        'duration_by_route': defaultdict(list),
        'fare_zero': 0,
        'fare_negative': 0,
        'actual_gt_original': 0,
        'actual_sum': 0.0,
        'original_sum': 0.0,
        'discount_quota_sum': 0.0,
        'discount_fare_sum': 0.0,
        'negative_duration': 0,
        'zero_duration': 0,
        'over_6h': 0,
        'same_station': 0,
        'unparseable': 0,
        'vehicles': set(),
        'drivers': set(),
        'cards': set(),
        'card_txn': Counter(),
        'duplicate_hashes': set(),
        'durations': [],
    }

    with zipfile.ZipFile(path) as z:
        strings = []
        for _, el in E.iterparse(z.open('xl/sharedStrings.xml'), tag=N + 'si'):
            strings.append(''.join(el.itertext()))
            el.clear()
        book = E.fromstring(z.read('xl/workbook.xml'))
        pr = book.find(N + 'workbookPr')
        epoch = datetime(1904, 1, 1) if pr is not None and pr.get('date1904') in ('1', 'true') else datetime(1899, 12, 30)
        rels = {e.get('Id'): e.get('Target') for e in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}

        for sh in book.find(N + 'sheets'):
            sheet_name = sh.get('name')
            target = rels[sh.get(R + 'id')]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            sheet_rows = 0
            for _, row in E.iterparse(z.open(target), tag=N + 'row'):
                if row.get('r') == '1':
                    row.clear()
                    continue
                vals = [None] * 18
                for c in row:
                    m = re.match('[A-Z]+', c.get('r', ''))
                    if not m:
                        continue
                    index = 0
                    for ch in m.group():
                        index = index * 26 + ord(ch) - 64
                    v = c.find(N + 'v')
                    value = v.text if v is not None else None
                    if c.get('t') == 's' and value is not None:
                        value = strings[int(value)]
                    if index <= 18:
                        vals[index - 1] = value.strip() if isinstance(value, str) else value
                row.clear()
                while row.getprevious() is not None:
                    del row.getparent()[0]
                if not any(v not in (None, '') for v in vals):
                    continue

                sheet_rows += 1
                stats['rows'] += 1
                for i, v in enumerate(vals):
                    if v in (None, ''):
                        stats['nulls'][str(i)] += 1

                route = (vals[5] or '未分類').strip()
                origin = (vals[10] or '未知').strip()
                destination = (vals[13] or '未知').strip()
                ticket = (vals[4] or '未分類').strip()
                card = vals[2]
                actual = num(vals[14])
                original = num(vals[15])
                discount_fare = num(vals[16])
                quota = num(vals[17])

                stats['routes'][route] += 1
                stats['od'][(origin, destination)] += 1
                stats['stations'][origin] += 1
                stats['stations'][destination] += 1
                stats['station_board'][origin] += 1
                stats['station_alight'][destination] += 1
                stats['ticket_types'][ticket] += 1
                category = ticket_category(ticket)
                stats['ticket_categories'][category] += 1

                if card not in (None, ''):
                    stats['cards'].add(card)
                    stats['card_txn'][card] += 1
                if vals[7] not in (None, ''):
                    stats['vehicles'].add(vals[7])
                if vals[6] not in (None, ''):
                    stats['drivers'].add(vals[6])

                if actual is not None:
                    stats['actual_sum'] += actual
                    stats['route_actual'][route] += actual
                    stats['category_actual'][category] += actual
                    stats['od_actual'][(origin, destination)] += actual
                    stats['od_fare'][(origin, destination)].append(actual)
                    if actual == 0:
                        stats['fare_zero'] += 1
                    if actual < 0:
                        stats['fare_negative'] += 1
                    if original is not None and actual > original:
                        stats['actual_gt_original'] += 1
                if original is not None:
                    stats['original_sum'] += original
                if discount_fare is not None:
                    stats['discount_fare_sum'] += discount_fare
                if quota is not None:
                    stats['discount_quota_sum'] += quota

                try:
                    board = epoch + timedelta(days=float(vals[8]))
                    alight = epoch + timedelta(days=float(vals[11]))
                    minutes = (alight - board).total_seconds() / 60
                except (ValueError, TypeError, OverflowError):
                    stats['unparseable'] += 1
                    continue

                stats['parsed'] += 1
                day = board.date()
                stats['daily'][day.isoformat()] += 1
                stats['monthly'][day.strftime('%Y-%m')] += 1
                stats['route_month'][(route, day.strftime('%Y-%m'))] += 1
                stats['hours'][board.hour] += 1
                stats['weekday'][board.weekday()] += 1
                if vals[7] not in (None, ''):
                    stats['vehicle_day'][day.isoformat()].add(vals[7])

                if minutes < 0:
                    stats['negative_duration'] += 1
                elif minutes == 0:
                    stats['zero_duration'] += 1
                if minutes > 360:
                    stats['over_6h'] += 1
                if origin == destination:
                    stats['same_station'] += 1
                if 0 <= minutes <= 360:
                    stats['durations'].append(minutes)
                    stats['od_duration'][(origin, destination)].append(minutes)
                    if (origin, destination) in {('日月潭', '高鐵臺中站'), ('高鐵臺中站', '日月潭'), ('埔里站', '高鐵臺中站')}:
                        stats['peak_duration'][(origin, destination, board.hour)].append(minutes)
                    stats['duration_by_route'][route].append(minutes)
                    if minutes < 10:
                        bucket = '<10 分'
                    elif minutes < 20:
                        bucket = '10–20 分'
                    elif minutes < 30:
                        bucket = '20–30 分'
                    elif minutes < 60:
                        bucket = '30–60 分'
                    elif minutes < 90:
                        bucket = '60–90 分'
                    elif minutes < 120:
                        bucket = '90–120 分'
                    else:
                        bucket = '120–360 分'
                    stats['duration_buckets'][bucket] += 1

                key = hashlib.blake2b(
                    '|'.join(str(v) for v in (card, vals[8], route, origin, destination, vals[14])).encode(),
                    digest_size=8,
                ).digest()
                stats['duplicate_hashes'].add(key)

            stats['sheets'].append({'name': sheet_name, 'rows': sheet_rows})

    durations = np.array(stats.pop('durations'), dtype='float64')
    stats['duration_stats'] = {
        'count': int(len(durations)),
        'mean': round(float(durations.mean()), 2) if len(durations) else None,
        'p10': round(float(np.percentile(durations, 10)), 2) if len(durations) else None,
        'p25': round(float(np.percentile(durations, 25)), 2) if len(durations) else None,
        'median': round(float(np.median(durations)), 2) if len(durations) else None,
        'p75': round(float(np.percentile(durations, 75)), 2) if len(durations) else None,
        'p90': round(float(np.percentile(durations, 90)), 2) if len(durations) else None,
        'p99': round(float(np.percentile(durations, 99)), 2) if len(durations) else None,
        'max': round(float(durations.max()), 2) if len(durations) else None,
    }
    stats['duration_by_route'] = {
        route: {
            'count': len(values),
            'median': round(float(np.median(values)), 2),
            'p90': round(float(np.percentile(values, 90)), 2),
        }
        for route, values in stats['duration_by_route'].items()
    }

    stats['duplicate_rows'] = stats['rows'] - len(stats.pop('duplicate_hashes'))
    stats['vehicle_count'] = len(stats.pop('vehicles'))
    stats['driver_count'] = len(stats.pop('drivers'))
    stats['card_count'] = len(stats.pop('cards'))
    card_txn = stats.pop('card_txn')
    stats['card_frequency'] = card_frequency(card_txn)
    stats['card_transactions_mean'] = round(stats['rows'] / stats['card_count'], 2) if stats['card_count'] else None
    stats['card_transactions_median'] = round(float(np.median(list(card_txn.values()))), 2) if card_txn else None

    stats['nulls'] = {k: v for k, v in stats['nulls'].items() if v}
    stats['route_month'] = {f'{r}|{m}': n for (r, m), n in stats['route_month'].items()}
    stats['top_od'] = [
        {'origin': o, 'destination': d, 'transactions': n}
        for (o, d), n in stats['od'].most_common(30)
    ]
    stats['top_stations'] = [{'name': s, 'touches': n} for s, n in stats['stations'].most_common()]
    stats['top_ticket_types'] = [{'type': t, 'transactions': n} for t, n in stats['ticket_types'].most_common(15)]
    stats['od_pair_count'] = len(stats['od'])
    stats['od_pairs'] = dict(stats['od'])
    stats.pop('od')
    return stats


def card_frequency(card_txn):
    bins = [('1 筆', 1, 1), ('2 筆', 2, 2), ('3–5 筆', 3, 5), ('6–10 筆', 6, 10), ('11–20 筆', 11, 20), ('21–50 筆', 21, 50), ('51 筆以上', 51, None)]
    return [
        {
            'label': label,
            'cards': sum(1 for n in card_txn.values() if n >= low and (high is None or n <= high)),
        }
        for label, low, high in bins
    ]


def finalize(stats):
    total = stats['rows']
    stats['route_table'] = [
        {
            'route': r,
            'transactions': n,
            'share_pct': pct(n, total),
            'actual_sum': round(stats['route_actual'].get(r, 0), 2),
            'avg_actual_fare': round(stats['route_actual'].get(r, 0) / n, 2) if n else None,
        }
        for r, n in stats['routes'].most_common()
    ]
    stats['ticket_category_table'] = [
        {
            'category': c,
            'transactions': n,
            'share_pct': pct(n, total),
            'actual_sum': round(stats['category_actual'].get(c, 0), 2),
        }
        for c, n in stats['ticket_categories'].most_common()
    ]
    stats.pop('route_actual')
    stats.pop('category_actual')
    stats['hour_table'] = [
        {'hour': h, 'transactions': stats['hours'].get(h, 0), 'share_pct': pct(stats['hours'].get(h, 0), total)}
        for h in range(24)
    ]
    weekday_counts = {WEEKDAYS[i]: stats['weekday'].get(i, 0) for i in range(7)}
    stats['weekday_table'] = [
        {'weekday': WEEKDAYS[i], 'transactions': weekday_counts[WEEKDAYS[i]], 'share_pct': pct(weekday_counts[WEEKDAYS[i]], total)}
        for i in range(7)
    ]
    stats['duration_table'] = [
        {'bucket': b, 'transactions': stats['duration_buckets'].get(b, 0), 'share_pct': pct(stats['duration_buckets'].get(b, 0), stats['parsed'])}
        for b in ['<10 分', '10–20 分', '20–30 分', '30–60 分', '60–90 分', '90–120 分', '120–360 分']
    ]
    stats['routes'] = dict(stats['routes'])
    stats['ticket_types'] = dict(stats['ticket_types'])
    stats['ticket_categories'] = dict(stats['ticket_categories'])
    stats['hours'] = {str(k): v for k, v in sorted(stats['hours'].items())}
    stats['weekday'] = {WEEKDAYS[k]: v for k, v in sorted(stats['weekday'].items())}
    stats['daily'] = dict(sorted(stats['daily'].items()))
    stats['monthly'] = dict(sorted(stats['monthly'].items()))
    stats['duration_buckets'] = dict(stats['duration_buckets'])
    stats['stations'] = dict(stats['stations'].most_common())
    stats['avg_daily'] = round(total / len(stats['daily']), 2) if stats['daily'] else None
    stats['date_min'] = min(stats['daily']) if stats['daily'] else None
    stats['date_max'] = max(stats['daily']) if stats['daily'] else None
    stats['days_with_records'] = len(stats['daily'])
    missing = []
    if stats['date_min']:
        d = date.fromisoformat(stats['date_min'])
        end = date.fromisoformat(stats['date_max'])
        while d <= end:
            if d.isoformat() not in stats['daily']:
                missing.append(d.isoformat())
            d += timedelta(days=1)
    stats['missing_dates'] = missing
    observed_weekdays = Counter(date.fromisoformat(d).weekday() for d in stats['daily'])
    stats['observed_days_by_weekday'] = {WEEKDAYS[k]: v for k, v in sorted(observed_weekdays.items())}
    stats['weekday_daily_avg'] = {
        WEEKDAYS[i]: round(weekday_counts[WEEKDAYS[i]] / observed_weekdays[i], 2) if observed_weekdays.get(i) else None
        for i in range(7)
    }
    stats['weekend_share_pct'] = pct(weekday_counts['六'] + weekday_counts['日'], total)
    stats['top_days'] = [{'date': d, 'transactions': n} for d, n in sorted(stats['daily'].items(), key=lambda x: -x[1])[:10]]
    stats['bottom_days'] = [{'date': d, 'transactions': n} for d, n in sorted(stats['daily'].items(), key=lambda x: x[1])[:10]]
    stats['avg_actual_fare'] = round(stats['actual_sum'] / total, 2) if total else None
    stats['avg_original_fare'] = round(stats['original_sum'] / total, 2) if total else None
    stats['avg_discount_fare'] = round(stats['discount_fare_sum'] / total, 2) if total else None
    stats['avg_discount_quota'] = round(stats['discount_quota_sum'] / total, 2) if total else None
    stats['zero_fare_pct'] = pct(stats['fare_zero'], total)
    stats['actual_to_original_pct'] = round(stats['actual_sum'] / stats['original_sum'] * 100, 2) if stats['original_sum'] else None

    od_counter = Counter(stats.pop('od_pairs'))
    stats['od_pairs'] = len(od_counter)
    stats['top5_od_share_pct'] = pct(sum(n for _, n in od_counter.most_common(5)), total)
    directions = Counter()
    for (o, d), n in od_counter.items():
        directions[tuple(sorted((o, d)))] += n
    imbalanced = []
    for (a, b), total_pair in directions.most_common(12):
        ab = od_counter.get((a, b), 0)
        ba = od_counter.get((b, a), 0)
        imbalanced.append({
            'pair': f'{a} ↔ {b}',
            'a_to_b': ab,
            'b_to_a': ba,
            'total': total_pair,
            'imbalance_pct': round((ab - ba) / total_pair * 100, 2) if total_pair else None,
        })
    stats['direction_imbalance'] = imbalanced
    stats['board_station_table'] = [
        {'name': s, 'boardings': n, 'share_pct': pct(n, total)}
        for s, n in stats['station_board'].most_common()
    ]
    stats['alight_station_table'] = [
        {'name': s, 'alightings': n, 'share_pct': pct(n, total)}
        for s, n in stats['station_alight'].most_common()
    ]
    od_actual = stats.pop('od_actual')
    od_duration = stats.pop('od_duration')
    od_fare = stats.pop('od_fare')
    peak_duration = stats.pop('peak_duration')
    stats['od_table'] = [
        {
            'origin': o,
            'destination': d,
            'transactions': n,
            'share_pct': pct(n, total),
            'actual_sum': round(od_actual.get((o, d), 0), 2),
            'avg_actual_fare': round(od_actual.get((o, d), 0) / n, 2) if n else None,
            'median_actual_fare': round(float(np.median(od_fare[(o, d)])), 2) if od_fare.get((o, d)) else None,
            'median_duration_min': round(float(np.median(od_duration[(o, d)])), 2) if od_duration.get((o, d)) else None,
            'p85_duration_min': round(float(np.percentile(od_duration[(o, d)], 85)), 2) if od_duration.get((o, d)) else None,
        }
        for (o, d), n in od_counter.most_common(20)
    ]
    stats['category_table_enriched'] = [
        {
            'category': row['category'],
            'transactions': row['transactions'],
            'share_pct': row['share_pct'],
            'actual_sum': row['actual_sum'],
            'revenue_share_pct': pct(row['actual_sum'], stats['actual_sum']),
            'avg_actual_fare': round(row['actual_sum'] / row['transactions'], 2) if row['transactions'] else None,
        }
        for row in stats['ticket_category_table']
    ]
    vehicle_days = stats.pop('vehicle_day')
    active = [len(v) for v in vehicle_days.values()]
    weekend_active = [len(v) for d, v in vehicle_days.items() if date.fromisoformat(d).weekday() >= 5]
    weekday_active = [len(v) for d, v in vehicle_days.items() if date.fromisoformat(d).weekday() < 5]
    stats['active_vehicle_days_mean'] = round(float(np.mean(active)), 2) if active else None
    stats['active_vehicle_days_median'] = round(float(np.median(active)), 2) if active else None
    stats['active_vehicle_days_max'] = int(max(active)) if active else None
    stats['active_vehicle_days_min'] = int(min(active)) if active else None
    stats['peak_duration_table'] = [
        {
            'origin': o,
            'destination': d,
            'hour': h,
            'count': len(v),
            'median': round(float(np.median(v)), 2),
            'p85': round(float(np.percentile(v, 85)), 2),
        }
        for (o, d, h), v in sorted(peak_duration.items())
    ]
    stats['vehicle_days_weekend_mean'] = round(float(np.mean(weekend_active)), 2) if weekend_active else None
    stats['vehicle_days_weekday_mean'] = round(float(np.mean(weekday_active)), 2) if weekday_active else None
    return stats


def main():
    results = [finalize(analyze(p)) for p in sorted((ROOT / 'data/raw').glob('*.xlsx'))]
    out = ROOT / 'analysis/eda_summary.json'
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(json.dumps([{'file': r['source'], 'rows': r['rows'], 'days': r['days_with_records']} for r in results], ensure_ascii=False))


if __name__ == '__main__':
    main()
