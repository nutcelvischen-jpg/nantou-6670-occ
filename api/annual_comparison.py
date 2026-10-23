"""Read-only annual comparisons over the same reviewed aggregates as the UI."""
import calendar
import re
from datetime import date, timedelta


def available_years(data):
    return sorted({int(r['source'][:4]) for r in data['years']})


def is_annual_question(message):
    return bool(re.search(r'年度|年增|同比|去年|前年|比較.*20\d{2}|20\d{2}.*20\d{2}', message))


def change(base, target):
    return dict(base=base, target=target, delta=None if base is None or target is None else target-base,
                percent=None if base in (None, 0) or target is None else (target-base)/base*100)


def summary(data, year, route='全部'):
    row = next(r for r in data['years'] if int(r['source'][:4]) == year)
    daily = [r for r in row['daily'] if r['date'].startswith(f'{year}-')]
    dates = {r['date'] for r in daily}
    expected = 366 if calendar.isleap(year) else 365
    missing = [(date(year, 1, 1)+timedelta(days=i)).isoformat() for i in range(expected) if (date(year, 1, 1)+timedelta(days=i)).isoformat() not in dates]
    total = sum(r['transactions'] for r in daily) if route == '全部' else next((r['transactions'] for r in row['routes'] if r['route'] == route), None)
    months = []
    for m in range(1, 13):
        ds = [r for r in daily if int(r['date'][5:7]) == m]
        n = len({r['date'] for r in ds})
        count = sum(r['transactions'] for r in ds) if route == '全部' and n else None
        months.append(dict(month=m,total=count,observedDays=n,expectedDays=calendar.monthrange(year,m)[1],dailyMean=count/n if count is not None else None))
    hourly = []
    for h in range(24):
        count=sum(r['transactions'] for r in row['hour_by_route'] if r['hour']==h and (route=='全部' or r['route']==route)) if total is not None else None
        hourly.append(dict(hour=h,total=count,share=count/total*100 if total else None))
    weekdays=[]
    for d in range(7):
        ds=[r for r in daily if date.fromisoformat(r['date']).weekday()==d]
        n=len({r['date'] for r in ds});count=sum(r['transactions'] for r in ds) if route=='全部' and n else None
        weekdays.append(dict(weekday=d,total=count,observedDays=n,dailyMean=count/n if count is not None else None))
    return dict(year=year,source=row['source'],total=total,observedDays=len(dates),expectedDays=expected,missingDates=missing,
                dailyMean=total/len(dates) if route=='全部' and dates else None,months=months,hourly=hourly,weekdays=weekdays,routes=row['routes'])


def annual_context(data, message, year, compare_year=None, route='全部'):
    years=available_years(data)
    mentioned=list(dict.fromkeys(map(int,re.findall(r'(?<!\d)20\d{2}(?!\d)',message))))
    missing=[y for y in mentioned if y not in years]
    if missing:return dict(available_years=years,unavailable_requested_years=missing,annual_comparison=None)
    selected=mentioned[:2] if len(mentioned)>=2 else [compare_year or next((y for y in reversed(years) if y!=year),year),year]
    base,target=[summary(data,y,route) for y in selected]
    routes=sorted({r['route'] for r in base['routes']+target['routes']})
    delta_routes=[dict(route=r,**change(next((x['transactions'] for x in base['routes'] if x['route']==r),None),next((x['transactions'] for x in target['routes'] if x['route']==r),None))) for r in routes]
    common=[];base_values={}
    if route=='全部':
        records=[next(r for r in data['years'] if int(r['source'][:4])==y) for y in selected]
        base_values={r['date'][5:]:r['transactions'] for r in records[0]['daily'] if r['date'][5:]!='02-29'}
        common=[r for r in records[1]['daily'] if r['date'][5:] in base_values]
    return dict(available_years=years,unavailable_requested_years=[],annual_comparison=dict(
        baseYear=selected[0],targetYear=selected[1],route=route,base=base,target=target,
        total=change(base['total'],target['total']),dailyMean=change(base['dailyMean'],target['dailyMean']),
        commonCalendar=dict(days=len(common),**change(sum(base_values[r['date'][5:]] for r in common) if common else None,sum(r['transactions'] for r in common) if common else None)),
        months=[dict(month=a['month'],**change(a['total'],b['total']),meanChange=change(a['dailyMean'],b['dailyMean'])) for a,b in zip(base['months'],target['months'])],routes=delta_routes,
        limitations=['交易不是獨立旅客、完整運量或營收。','無紀錄日期不能補零或推論停駛原因；日均分母為有紀錄日。','同月日排除2月29日，仍未控制星期及假日差異。','子線沒有逐日分布，不能提供月／星期／日均比較。','年度變化不能單憑交易資料推論因果。']))
