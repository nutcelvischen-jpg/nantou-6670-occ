# 07｜低階模型逐步實作手冊

目標是讓模型每次只做一層，而且每層都可驗收。絕不一次貼全SPEC叫模型「做好所有功能」。人工審閱上一任務後再交下一任務。先合成圖，再真實資料；不要把示例成本／票價寫回正式資料庫。

## 0. Repo 起始結構

```text
apps/web/                    React地圖與分析UI
apps/api/                    FastAPI endpoints與auth
packages/contracts/          OpenAPI generated TS types/JSON schemas
packages/domain/             純函式Python domain contracts
packages/algorithms/         transit router、road router、CP-SAT
packages/simulation/         事件模擬器
packages/analysis/           import、quality、forecast、carbon
infra/                       docker compose、migration、environment example
data/raw/                    原始檔，gitignore大檔／限制分享
fixtures/synthetic/           小型手寫network與expected answers
docs/spec/                   本規格及各章
```

依團隊簡化可改monorepo目錄；不得將不同演算法塞進一個臃腫`app.py`。

## 1. 任務拆分與完成 gate

| Issue | 輸入 | 產出 | Gate |
|---|---|---|---|
| T00 技術基線 | SPEC、執行環境 | lockfile、compose、health、lint | 可從README啟動空服務 |
| T01 contracts | 01/04 | schemas、單位/enums、fixture payload | schema驗證正反例 |
| T02 synthetic graphs | 手工網路/時刻/票價 | 機器可讀fixture＋獨立oracle | TR fixture可人工追算 |
| T03 fare engine | fixture票種規則 | immutable fare state transition | 過期/持票/購票測試 |
| T04 transit router | T02/T03 | 最低票價、constraints、diagnostics | TR-01..12與oracle |
| T05 road graph | synthetic road、vehicle profile | Dijkstra least generalized cost | RD-01..08與oracle |
| T06 timetable import | 官網快照、色碼人工profile | staging表、mapping queue | 方向/日型/子線抽樣 |
| T07 ticket import | Excel、schema | raw staging+quality report | 列數對帳、PII scrub |
| T08 demand marts | curated v | 時段、OD、站群、quality day | 聚合可追溯與人工spot check |
| T09 baseline model | marts | 時間回測報表 | 切分沒洩漏，zero day rules |
| T10 simulator | synthetic event fixture | engine＋event digest＋snapshots | properties all pass |
| T11 cost/carbon engine | cost profile＋factors | 可比較指標 | 第06節手算值一致 |
| T12 candidate/optimizer | timetable、vehicle、demand | CP-SAT與診斷 | OP-01..14 |
| T13 API/jobs | domain services | routes/job lifecycle | openapi／idempotency tests |
| T14 GIS/UI | API＋UX | 操作台、需求、run、旅客、綠色 | E2E A/B/C與響應式 |
| T15 data admin | import/quality | 審核、發布、衝突檢視 | 未解衝突不能publish |
| T16 integration | TDX/map service keys | gated adapters | 無金鑰降級成功、秘密安全 |
| T17 release checklist | 全成果 | demo fixture、README、限制 | L0全項通過 |

實際順序可以平行在不同模組，但只在fixture contract固定後進行；跨模組分支由擁有者確認接口。

## 2. 低階模型每個任務提示詞模板

```text
你只處理 ISSUE <ID>，先讀 SPEC.md 的閱讀順序，以及這個 ISSUE 表列文件。
動手前檢查目前 repo 和已有實作；不要推翻或重寫不相關檔案。
本ISSUE完成標準：<逐條引用gate，不可自行簡化>。
資料限制：不把 synthetic 標成實測；不可猜票價、容量、坐標、車型或服務規則。
實作要求：把計算放在本領域模組，不讓前端重算；錯誤／未知需有明確狀態。
先建立或更新能反證錯誤結果的測試。若此環境沒辦法執行，明確報未驗證與原因，不得說pass。
執行文件中列出的相關檢查，只修此issue必要的失敗。
回報：變更檔案、計算方式、測試命令與真實輸出、尚未完成gate、資料假設。
```

不要一次請模型設計系統、改數據、做UI、優化求解並宣稱完整。每次任務提交附檔案與測試結果，人工check後進下一個。

## 3. 一次性啟動提示詞

```text
請按 docs/spec/07_IMPLEMENTATION.md 與 SPEC.md 建置潭行 Twin，技術使用PRODUCT.md中列的提案，但此次只開始 T00。先檢查目錄與現有程式，列出技術版本相容性和最小資料架構，建立可啟動的空白web/api/資料庫與health endpoint。不要讀取或將原始乘客卡號寫入前端；不接外部服務、不放Secret、不製作假數據儀表板、不部署。完成 T00 gate 後停下，回報實際命令與輸出，再由使用者審閱後進入 T01。
```

如果用戶要小步可先T00→T01→T02→T03→T04；如要先有展演地圖，T02/API mock/GIS可先交付，但所有數字必有synthetic badge，演算法仍依gate實作，不可hard-code畫面答案。

## 4. 專案防偏離檢查

開始任何任務前核對：

- `SPEC.md` 仍在repo根目錄，readme鏈結有效。
- 所有變動沿用最低營運成本、最低旅客票價雙目標；沒有偷換成最快／最大載客。
- solver infeasible與timeout仍有真實狀態。
- geographic stops沒有被會合成容易畫的直線代替。
- user提供的舊係數沒有寫死為一個未版本化 constant。
- 原始交易ID已去識別；網站文章沒有執行腳本。
- 本機金鑰放`.env`並gitignore，前端只讀public key。
- demo展示的每個百分比有可重現run，不用mock數字宣稱效益。

## 5. 要求資料前的次序

先做T00、contracts、synthetic router與表格schema，不等key。要把地圖放真實南投才需要地圖服務key及底圖路網。要向業者決策需容量、歷史班表、driver duty、成本；公開網站或TPX不能代替非公開數據。

目前 `.env.local` 的 `VITE_MAPTILER_KEY` 可讀取 `streets-v4/style.json`（HTTP 200），但瀏覽器地圖圖磚仍未顯示，需先核對 Allowed Origins 及瀏覽器請求錯誤。`.env.local` 必須維持 gitignored。

TDX credentials 已依官方流程取得 OAuth token，並由 Bus v2 InterCity 端點讀回 6670 路線／站序／WKT 線形；靜態路線與站牌可用，前後端均有六小時快取和降級處理。不可把這項取樣等同 GPS、ETA、餘位、有效班表或票價連線。OAuth存取 token不寫入 `.env.local` 或log，只在記憶體快取至到期前緩衝時間。
