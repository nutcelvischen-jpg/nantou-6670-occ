# 04｜模組邊界、API 契約與執行流程

## 1. 模組邊界

| 模組 | 責任 | 禁止事項 |
|---|---|---|
| import service | 原始檔 checksum、staging、列數品質 | 自動修正原始來源 |
| network service | 站點、pattern、道路圖、有效日 | 合併方向或跳過未知mapping |
| fare engine | 票價產品狀態、費用證據 | 以LLM算票價 |
| forecast service | 時序聚合、baseline、時間回測 | 事後資料洩漏 |
| transit router | 時刻＋票價資源標籤圖搜尋 | 用道路最快路線冒充最低票價 |
| road router | 車型合法道路最低金錢／時間成本 | 把OD交易畫成精確道路軌跡 |
| optimizer | CP-SAT 最低營運成本 | 自動放鬆服務限制 |
| simulator | 唯一乘客、車、事件模型 | 依renderer FPS重算 |
| carbon service | 活動數據×版本化係數 | 固定單一年度係數 |
| assistant | 驗證資料檢索、問句釐清、摘要 | 無資料時補時刻／餘位／碳排 |
| artifact service | run manifest、快照、CSV | 修改已完成run |

Python domain 套件不得 import FastAPI route、SQL session、DOM 或 MapLibre。Frontend 不計算最佳路徑與碳排；可做單位格式化與圖表抽樣。

## 2. API 共通約定

Base `/api/v1`。JSON UTF-8；snake_case；ID 字串 UUID；金額整數分、秒整數、經緯度 WGS84。時間 ISO 8601 帶 offset。所有成功計算回傳 input_versions 與 request_id。列表 page_size預設50、最大200，游標 pagination。

錯誤格式：

```json
{
  "error": {
    "code": "FARE_COVERAGE_INCOMPLETE",
    "message": "此行程有一段票價尚未確認。",
    "details": [{"path":"fare_version","reason":"missing_for_pattern"}],
    "request_id":"uuid"
  }
}
```

HTTP 狀態：400格式／範圍、401/403認證／權限、404未知資源、409 revision衝突、413匯入大小、422缺資料或模型不可執行、429限流、500未預期錯誤。原始 stack 只在server log。

重要 mutation 帶 `Idempotency-Key`；修改 scenario 帶 `If-Match: revision`。retry 不得重複建立 run／import。計算提交是 snapshot semantic：先鎖輸入版本，不讀「最新」漂移值。

## 3. 核心 endpoint

| 方法 | 路徑 | 用途 |
|---|---|---|
| GET | /health/ready | DB、worker、schema readiness；不曝憑證 |
| POST | /imports | 建匯入 job，multipart僅限 admin，設定大小上限 |
| GET | /imports/{id} | job／列數／品質摘要 |
| GET | /datasets/versions | 來源版本與狀態 |
| GET | /datasets/aggregates | 本機隱私安全票證彙總資料；回傳 ETag，不含原始卡號 |
| GET | /timetables/6670 | 6670 官網班表快照與來源狀態；非即時、未驗證今天有效性 |
| GET | /demand/hourly?year=&route= | 指定年度／路線的 24 小時交易列聚合 |
| POST | /optimizations/fleet | OR-Tools CP-SAT 合成候選班次選取；僅固定車輛指派與總容量／迴轉限制，不是完整車隊流或勤務 solver |
| GET | /road-routes/demo?origin=&destination= | 本機合成有向圖的柴油／電巴成本 Dijkstra 展示；非正式導航 API |
| GET | /api/v1/integrations/tdx/status | 憑證設定與行程內 OAuth 驗證狀態；不發出外部請求、不回傳憑證 |
| POST | /api/v1/integrations/tdx/validate | 後端 OAuth client-credentials 驗證；回傳安全錯誤碼，不回傳 access token |
| GET | /api/v1/integrations/tdx/route-map?route_prefix=6670 | 取 TDX Bus v2 InterCity 路線、站序、WKT 線形並轉 GeoJSON；需有效 TDX 憑證 |
| POST | /datasets/versions/{id}/validate | 乾跑品質 gate |
| POST | /datasets/versions/{id}/publish | admin發布不可變版本 |
| GET | /routes?date= | 當日有效 route/pattern摘要 |
| GET | /stops?bbox=&pattern_id= | 可見站點與站群 |
| GET | /service-calendar?date=&pattern_id= | 班次及供給類型 |
| GET | /demand/aggregate?date_from=&date_to=&bin=&pattern_id= | 有定義分母的聚合 |
| POST | /journeys/cheapest | 最低票價查詢，有限 horizon |
| POST | /road-routes/least-cost | 車型限定道路搜尋 |
| POST | /scenarios | 建revision=1情境 |
| PATCH | /scenarios/{id} | 樂觀鎖編輯 |
| POST | /scenarios/{id}/validate | 不開始計算的規則／資料驗證 |
| POST | /scenarios/{id}/runs | 啟動sim／optimizer工作 |
| GET | /jobs/{id} | 階段與百分比（只有可估工作量時給百分比） |
| DELETE | /jobs/{id} | 非同步取消 |
| GET | /runs/{id} | 指標、status、輸入版本摘要 |
| GET | /runs/{id}/snapshots?from=&to=&step= | 可視窗化快照 |
| GET | /runs/{id}/events?cursor= | 稽核／可回放事件 |
| GET | /runs/{id}/artifacts/{kind} | CSV、摘要、求解診斷 |
| POST | /runs/compare | 比較相容run；返回不可比理由 |
| GET | /carbon/factors?year=&category= | 係數及來源，不提供寫入 |
| POST | /assistant/answer | 只對可引用知識作答 |

`POST /assistant/answer` 目前使用伺服器端 OpenCode OpenAI 相容 adapter，不讓瀏覽器直接連 provider；模型預設 `deepseek-v4.1-flash`。請求帶固定 `mode=operations`、`message` 與目前頁面允許的篩選條件；伺服器在呼叫模型前套用營運範圍白名單，並使用工具 allowlist。模型回傳的工具名稱與參數會在伺服器重新驗證後才執行；LLM 只能整理工具回傳的證據，數字、日期、來源時間戳來自資料服務。

助理僅供內部營運使用，支援需求預測、尖離峰、票證行為聚合、班次與成本最佳化、儀表板資料狀態；不提供旅遊規劃或旅客客服。超出範圍的問題在本機以固定說明回覆，不送至 LLM。核准工具可讀需求與票證行為安全聚合、查詢即時資料來源狀態，並預覽命名的最佳化情境。任何啟動長任務的操作都由 UI 顯示輸入摘要並由使用者按鈕送出，API 不接受模型自行呼叫任意工具。初版禁止通用 SQL／程式碼執行、shell、任意 URL fetch、資料修改和車輛派遣寫入。模型／provider 故障時可對結構化查詢退回模板摘要；即時服務缺來源時回傳 `LIVE_FEED_UNAVAILABLE`，禁止生成推測車況。

OpenCode API key、model 設定、系統提示和 provider endpoint 僅存在伺服器環境設定；不可回傳到 HTML、JavaScript bundle、日誌或錯誤訊息。HTTP 402 時回傳可辨識的額度提示並降級至可追溯本機示範。記錄應保存意圖、工具名、資料版本、耗時、成功狀態和 request ID；預設不持久保存原始對話文字，若產品要保存需另定期限、告知和刪除機制。

建議回應結構：`answer`、`mode`、`data_status`、`as_of`、`sources[]`、`tool_calls[]`（隱去敏感參數）、`suggested_actions[]`、`request_id`。來源資料不足時 `answer` 必須保留未知狀態，不能以 LLM 常識補足即時車況。

路線規劃API不保證公開行人／底圖routing服務的SLA；核心正式演算法跑自有快照／供應商合約服務。互動搜尋有 timeout，完整長任務走 jobs。

## 4. 關鍵 request／response

### 4.1 journey

```json
{
  "origin_stop_id":"...","destination_stop_id":"...",
  "departure_date":"2026-10-24","earliest_departure_s":32400,
  "latest_arrival_s":37800,"objective":"fare_min",
  "ticket_profile":"adult","owned_products":[],
  "max_transfers":2,"max_walk_m":2000,
  "wheelchair_required":false,"required_poi_ids":[],
  "versions":{"network":"...","timetable":"...","fare":"..."}
}
```

回應 `status`, `search_complete`, `optimality_scope`, `fare_minor?`, `arrival_at?`, `legs[]`, `totals`, `coverage`, `warnings[]`, `input_versions`, `source_ids[]`。`fare_minor=null` 表示未知，不是免費。`seat_status` unknown/available/held/unavailable，只有實際授權座位資料可用時回傳 available/unavailable。

### 4.2 optimization run

scenario config 指定 `run_type=optimize`、`objective=operating_cost_min`、policy、候選時刻生成設定、資源、需求情境、seed、time_limit_s、work budget。缺 capacity 或 cost_profile 時 validate 回阻斷錯誤；若選 synthetic 要明示 synthetic fixture ID。

optimizer response 包含 incumbent方案、每車／班次、服務限制、cost breakdown、best_bound/gap、sim verification、operational_ready、reason_codes。未取得司機勤務資料時 `operational_ready=false`。

### 4.3 比較

同個 scenario revision 不是必要條件，但比較需相同 `network/timetable/fare_or_cost_boundary/demand_definition/analysis_window`。不同版本可 `compatible=false`，但 UI 仍可並排檢視，不計改善百分比。每指標 delta 定義 A−B，顯示基線與單位。

## 5. Run 工作生命週期

```text
queued → validating → preparing_graph → solving/ simulating → verifying → writing_artifacts → completed
                    ↘ blocked_input/error     ↘ cancelled              ↘ partial
```

run 僅在 validating 完成後接受完整 input hash。Worker 以 lease heartbeat，crash可重試 idempotent stage；solver seed及版本固定。取消在事件安全點檢查；取消不產生假completed。

`progress` 建議 object：stage、stage_label、completed_units、total_units?、percent?、last_updated_at。若 solver 不暴露單調 progress，不生成假%而顯示「求解中」。

產物：manifest.json、metrics.json、candidate_assignments.parquet、snapshots.parquet／jsonl、events.jsonl、solver.log摘要、quality.json。solver log 移除環境變數與檔案路徑中的敏感值。

## 6. 三種網路／三種成本的API區分

旅客最小費用使用 timetable graph＋fare engine；道路 least-cost 使用 road graph＋vehicle profile；車隊排班使用 CP-SAT＋simulation。資料模型不可抽象成一個 Edge.cost 字段後再由前端切標籤。分別回傳：`fare_minor`、`route_cost_minor`、`operating_cost_minor`。

底圖 style、地址 geocoding、道路圖路徑是不同供應服務。底圖API key可公開但須鎖定域名／額度；TDX client secret只在後端。瀏覽器不可直接呼叫含secret的TDX OAuth流程。

## 7. 非功能性

- Query map viewport最多回 5,000 個 feature（ASSUMPTION），超過用vector tiles／cluster。
- 交易聚合不一次傳全部180萬列。
- 小型 itinerary query P95<2s，小網路 router；大型 best-effort async。初版 benchmark提供fixture與硬體資訊。
- 小型CP-SAT fixture可≤10s；正式單日≤60s目標，但須量測，不保證未校準大實例。
- CORS allowlist；CSRF／same-site session策略依部署；SQL參數化；檔案MIME與magic bytes雙檢。
- Content Security Policy限制官網原始HTML不在主app iframe執行。
- 速率限制、request id、PII redaction、audit log；LLM輸入只送必要已去識別資訊。
- SQL transaction處理scenario revision與job enqueue；outbox可在需要可靠事件時啟用。

## 8. 前端 domain contracts

TypeScript共用型別從 OpenAPI 產生，不手寫重複API型別。Domain client只做 transport與將unknown JSON parse成驗證型別；未知 enum需fallback安全文字，不崩潰。計算值 DTO 必帶 `unit`, `quality`, `as_of?`, `source_ids`。

地圖資料 source/layer ID包含 dataset版本避免跨版本 feature state。解構URL要驗證ID與範圍。Escape HTML；來源正文當純文字顯示。
