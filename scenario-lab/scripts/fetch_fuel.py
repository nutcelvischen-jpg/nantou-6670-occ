"""抓經濟部能源署「全國汽柴油週均價」，存成 data/fuel-price.json，build 時注入為 DATA.fuel。
來源頁：https://www2.moeaea.gov.tw/oil111/Gasoline/NationwideAvg
頁面用 POST {unit: week} 打 /oil111/Gasoline/NationwideAvg/load 取資料（需先 GET 頁面取得 cookie）。
用法：python3 scripts/fetch_fuel.py
用系統 curl 連線（macOS 的 python.org 版 Python 常缺根憑證；curl 走系統鑰匙圈，不需關掉憑證驗證）。
瀏覽器端無法直接呼叫（Artifact 的 CSP 與 CORS 會擋），所以在 build 前抓好快照。
"""
import json, datetime, subprocess, tempfile, os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://www2.moeaea.gov.tw/oil111/Gasoline/NationwideAvg'
with tempfile.TemporaryDirectory() as td:
    ck = os.path.join(td, 'ck.txt')
    subprocess.run(['curl', '-sSL', '-m', '20', '-c', ck, '-o', os.devnull, PAGE], check=True)
    raw = subprocess.run(['curl', '-sSL', '-m', '20', '-b', ck, '-X', 'POST', '-F', 'unit=week', '-H', 'X-Requested-With: XMLHttpRequest', '-H', 'Referer: ' + PAGE, PAGE + '/load'], check=True, capture_output=True).stdout
d = json.loads(raw)
assert d.get('res') == '01', d
rows = [{'week': r['SurDate'], 'g92': r['Oil92'], 'g95': r['Oil95'], 'g98': r['Oil98'], 'diesel': r['Oilchai']} for r in d['data']['gasoline']]
out = {'source': '經濟部能源署 全國汽柴油週均價（零售，含稅）', 'url': PAGE, 'fetched': datetime.date.today().isoformat(), 'weeks': rows}
(ROOT / 'data/fuel-price.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print('latest', rows[0])
