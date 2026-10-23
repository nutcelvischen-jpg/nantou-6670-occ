"""Build a local, sanitized source and filming handoff; never uploads files."""
from pathlib import Path
import csv
import hashlib
import json
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output'
FILM = OUT / '影片製作包'
NAME = '潭行Twin_完整專案與影片製作包_2026-10-23'
DEST = OUT / NAME
REF = ROOT.parent / '潭行3D'
SECRETS = set()
for env in (ROOT / '.env.local', ROOT / 'hosting/.env.local', ROOT / 'hosting/.dev.vars'):
    if not env.exists():
        continue
    for line in env.read_text().splitlines():
        match = re.match(r'\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$', line)
        if match and any(k in match[1] for k in ('KEY', 'SECRET', 'TOKEN', 'CLIENT_ID')):
            value = match[2].strip('\"\'')
            if len(value) >= 12:
                SECRETS.add(value)

TOKEN = re.compile(r'(?:sk-or-v1-[A-Za-z0-9_-]{30,}|oc_sk_[A-Za-z0-9_-]{25,})')
rows = []
skipped = []

def excluded(path):
    return (any(p in {'.git', 'node_modules', '.venv', '__pycache__', '.wrangler', 'dist', '.next'} for p in path.parts)
            or path.name.startswith('.env') and path.name != '.env.example'
            or path.name in {'.dev.vars', '.DS_Store', 'bundle.json'}
            or path.suffix in {'.log', '.pyc'}
            or path.parts[:2] == ('data', 'raw'))

def add(source, relative):
    data = source.read_bytes()
    redacted = False
    try:
        body = data.decode('utf-8')
        if '\0' in body:
            raise UnicodeError('binary')
        for secret in SECRETS:
            if secret in body:
                body = body.replace(secret, '[REDACTED]')
                redacted = True
        body, count = TOKEN.subn('[REDACTED]', body)
        redacted = redacted or bool(count)
        data = body.encode('utf-8')
        kind = 'text'
    except UnicodeError:
        kind = 'binary'
        if any(s.encode() in data for s in SECRETS):
            raise RuntimeError(f'Credential found in binary: {relative}')
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    rows.append({'path': str(relative), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                 'kind': kind, 'text_exported': kind == 'text', 'redacted': redacted})

if DEST.exists():
    # Only rebuild this generated deliverable folder.
    shutil.rmtree(DEST)
DEST.mkdir(parents=True)
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
source_paths = {Path(p) for p in tracked if p}
for folder in ('docs/video', 'docs/manual'):
    source_paths.update(p.relative_to(ROOT) for p in (ROOT / folder).rglob('*') if p.is_file())
for rel in sorted(source_paths):
    if excluded(rel):
        skipped.append(str(rel))
    elif (ROOT / rel).is_file():
        add(ROOT / rel, Path('主專案') / rel)
for source in sorted(FILM.rglob('*')):
    if source.is_file():
        add(source, Path('影片製作素材') / source.relative_to(FILM))
if REF.exists():
    for source in sorted(REF.rglob('*')):
        if source.is_file() and not excluded(source.relative_to(REF)):
            add(source, Path('參考原型/潭行3D') / source.relative_to(REF))
original = Path.home() / 'Downloads/taichung-nantou.html'
if original.exists():
    add(original, Path('參考原型/最早單檔版/taichung-nantou.html'))
manual = OUT / 'pdf/潭行Twin_整合版系統操作手冊.pdf'
if manual.exists():
    add(manual, Path('系統操作手冊/潭行Twin_整合版系統操作手冊.pdf'))

guide = '''# 潭行 Twin｜完整專案與製片交付

先開 `影片製作素材/影片分鏡預覽.html`。全部文字檔原文集中於 `全部文字檔內容.txt`，每檔以路徑標頭分隔；二進位原檔保留在對應資料夾。建議編輯原始檔，不要反向編輯彙整文字檔。

## 資料夾導覽

| 路徑 | 內容與用途 |
|---|---|
| 主專案/src | React介面、資料讀取器、共用演算法與測試 |
| 主專案/scenario-lab | 現行3D情境的模板、場景、模型、模擬、預測、班次建議、UI與聚合資料 |
| 主專案/public/scenario-lab/index.html | 已組合的3D單檔入口；仍需要網路載入Three.js等資源 |
| 主專案/api | 本機FastAPI、TDX adapter、CP-SAT、道路搜尋與助理 |
| 主專案/hosting | Sites後端與入口；目前只部署助理業務API，其餘使用前端快照／本機計算 |
| 主專案/data、analysis | 公開網站研究、班表／路線快照、資料分析紀錄 |
| 主專案/docs/spec、SPEC.md、PRODUCT.md | 詳細規格、公式、介面契約與驗收條件；部分是未實作規劃 |
| 主專案/docs/manual | 歷史手冊來源，僅作參考；現行手冊由docs/video/build_unified_manual.py產生 |
| 主專案/docs/video | 本次講稿與封裝的產生腳本 |
| 影片製作素材 | 6分鐘11段分鏡、旁白、字幕草稿、公式與實際網站畫面 |
| 參考原型 | 使用者提供的潭行3D與最早HTML；保留作參考，不是現行上線版本 |

## 在本機啟動目前系統

進入解壓後的「主專案」目錄，使用Node.js 22.13以上、Python 3.10以上：

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env.local
npm run dev
```

終端會顯示前端網址，預設127.0.0.1:5173；API預設8000。若電腦已有服務使用該埠，先確認要使用哪一個，不要任意結束既有服務。

聚合資料可直接使用，不需要原始XLSX。若要重新從票證建置，須自行在原授權環境準備兩份原始檔；相關腳本所需分析套件以腳本說明為準。

環境檔內的MapTiler、TDX與OpenRouter值留白，請自行填入。助理模型為 `deepseek/deepseek-v4.1-flash-1017`，金鑰只放後端。未設定時不得宣稱AI已連線。完整公開Sites部署還需要Sites的專案與Secret設定；本包保留現有專案識別設定，不能用它假定已取得部署權限。

```sh
npm run build:frontend
npm test
```

若要建置包含Sites worker的完整產物，還需先依 `hosting/README.md` 與Sites工具的依賴安裝流程安裝hosting套件，再執行 `npm run build`。根目錄 `npm ci` 不會安裝子專案的依賴。

只看3D原型也可從主專案目錄執行 `python3 -m http.server 8080 --bind 127.0.0.1`，開啟 `http://127.0.0.1:8080/public/scenario-lab/`。此靜態方式沒有後端AI／TDX API；小幫手可能使用本機規則降級。

## 範圍、版本與校驗

本包是可分享程式與拍攝素材，不是磁碟備份。不含有效金鑰、`.env.local`、Git歷史、套件快取、虛擬環境、逐筆票證XLSX、暫存與日誌；原電腦上的原始檔沒有修改。公開網站下載資料與聚合檔仍保留來源及既有授權限制，提供給剪輯者不等同可任意再散布。

整合版PDF與圖文分鏡對應目前的單一數位孿生工作台。原始參考原型及主專案/docs/manual是歷史來源，錄影以本次整合版說明為準。3D是情境模擬；成本為合成候選集合內的最低成本；小幫手限內部營運。未產生影片、未更換首頁；收到成片後再整合。

`檔案清單.csv` 的SHA-256涵蓋交付的實際位元組，若字串因去除金鑰而改寫，redacted欄標true。`全部文字檔內容.txt`涵蓋清單中text_exported=true的檔案；清單自身不列入清單，以避免循環校驗。Git快照識別與本次附加產物分別見版本紀錄。
'''
temp = OUT / '交付導覽暫存.md'
temp.write_text(guide)
add(temp, Path('啟動與檔案導覽.md'))
temp.unlink()
version = {
    'date': '2026-10-23', 'timezone': 'Asia/Taipei',
    'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'site': 'https://nantou-transit-twin.elvischen.chatgpt.site',
    'additions': ['docs/video scripts', 'filming assets', 'manual sources', 'reference prototypes'],
    'exclusions': ['active credentials', '.env.local', 'Git history', 'dependencies', 'raw ticket XLSX', 'temporary files/logs'],
    'tracked_files_excluded': skipped,
    'homepage_changed': False, 'video_created': False,
}
temp = OUT / '交付版本暫存.json'
temp.write_text(json.dumps(version, ensure_ascii=False, indent=2))
add(temp, Path('版本紀錄.json'))
temp.unlink()
aggregate = DEST / '全部文字檔內容.txt'
with aggregate.open('w', encoding='utf-8') as stream:
    stream.write('潭行Twin｜交付包內全部UTF-8文字檔原文（已去除有效金鑰）\n二進位檔請查看原檔；逐檔雜湊見檔案清單.csv。\n')
    for row in sorted(rows, key=lambda r: r['path']):
        if row['kind'] == 'text':
            stream.write('\n\n' + '=' * 80 + '\nFILE: ' + row['path'] + '\nSHA256: ' + row['sha256'] + '\n' + '=' * 80 + '\n')
            stream.write((DEST / row['path']).read_text())
            stream.write('\nEND FILE: ' + row['path'] + '\n')
rows.append({'path': aggregate.name, 'bytes': aggregate.stat().st_size,
             'sha256': hashlib.sha256(aggregate.read_bytes()).hexdigest(),
             'kind': 'text-collection', 'text_exported': False, 'redacted': False})
with (DEST / '檔案清單.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=['path','bytes','sha256','kind','text_exported','redacted'])
    writer.writeheader()
    writer.writerows(sorted(rows, key=lambda r: r['path']))

for folder, target in [(DEST, OUT / (NAME + '.zip')), (FILM, OUT / '潭行Twin_影片講稿與畫面素材.zip')]:
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(folder.rglob('*')):
            if not file.is_file():
                continue
            data = file.read_bytes()
            if any(s.encode() in data for s in SECRETS) or TOKEN.search(data.decode('utf-8', errors='ignore')):
                raise RuntimeError(f'Credential validation failed: {file.relative_to(folder)}')
            archive.writestr(str(Path(folder.name) / file.relative_to(folder)), data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
    print(json.dumps({'archive': str(target), 'bytes': target.stat().st_size}, ensure_ascii=False))
print(json.dumps({'payload_files':len(rows), 'text_files':sum(r['text_exported'] for r in rows),
                  'redacted_files':sum(r['redacted'] for r in rows)}, ensure_ascii=False))
