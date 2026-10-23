# 08｜你可能要準備的服務與資料

## 1. 現在需要的服務帳號

| 項目 | 優先 | 用途 | 你需要提供／執行 | 不要提供 |
|---|---|---|---|---|
| TDX帳號與API key | 高，真實官方路線資料前 | 站點、時刻、站牌路線、可能的公路客運動態 | 建立應用後以安全管道放到本機server `.env`：`TDX_CLIENT_ID`、`TDX_CLIENT_SECRET` | 不要把Secret貼聊天、前端或git |
| MapTiler Cloud API key | 高，漂亮可互動真實底圖 | 向量圖磚／style、可選地理編碼 | 免費帳號建立一把 key、設允許來源域名、限制額度；之後選本機dev網址與部署域名 | 不要把service token給前端；公開key也設域名限制 |
| OSM／政府授權資料 | 高，路線幾何與步行路網 | 公車shape、道路routing | 優先查GTFS/TDX和可下載授權資料；必要才安排可自架OSRM或Valhalla | 不要依賴免費公共demo endpoint當正式服務 |
| Postgres/PostGIS | 開發可Docker本地 | 空間資料、情境、job | 無須先雲端採購；後續選可控instance | 不要交資料庫管理員Secret |
| LLM API | 低，可選 | 客服自然語言摘要／澄清 | 先做模板與資料檢索；只有確認需要才設定 | 不要傳卡號、個人軌跡或未公開 reservation |
| TDX以外地圖導航服務 | 不必要先買 | 地址搜尋、距離矩陣、導航 | 先用既有geometry＋本地最短路；若需要再討論商用授權 | 不要同時先買多家重疊服務 |

規格優先 MapLibre 渲染加 MapTiler hosted tiles，地圖client本身可開源。MapTiler key會出現在瀏覽器請求，所以應建立受限public API key，不能放service token。TDX Client Secret 必須僅在後端換token；不需把帳號密碼提供給我們，只需你自行登入建立應用。

## 2. 可以採用的低成本地圖路徑

1. 起步：MapLibre＋MapTiler試用／免費額度，控制extent與zoom，先只載南投附近；缺key則本地幾何空底圖仍可做router fixture。
2. 開源備援：下載合法 OSM extract，自建道路／步行圖；若做產品需符合 OSM attribution與ODbL義務。自行host vector tiles可考慮PMTiles＋支援HTTP Range Requests的host。
3. Routing demo：小型已核對道路圖直接用自家Dijkstra；OSRM公開demo只作非關鍵試驗，不當 production SLA。OSRM預設找最快路徑，需自建routing profile或自有圖搜尋才符合成本目標。
4. TDX：申請金鑰後檢查 InterCityBus 覆蓋、6670站與時刻、更新頻率、使用限制及歷史版本。確認前不要把動態頁與歷史模型連起來。

## 3. 我們開始真正地圖實作時，你再提供

只需要 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET` 與受限 MapTiler public key 按安全存放指示放入本機環境變數。不要傳到對話。拿到後先做一次唯讀試取：只印端點、HTTP狀態、schema與筆數，不輸出完整乘客／車輛個資。再決定哪些服務可用。

目前仍不需要申請：商用導航API、多模型付費API、雲端資料倉庫、MQTT broker、3D tiles平台。先以開源libraries、local DB與合成小圖測演算法即可。

## 4. 更影響真實調度品質的業者資料

若可取得，依序洽業者（由使用者自行選擇分享方式）：

1. 6670方向／子線站點對照與座標、站序、有效日期。
2. 2024/25及當期正式／加班班表、停駛、driver duty、迴轉時間。
3. 車籍車型、乘客席／站立限制、輪椅位置、可用區間與車庫。
4. 車次GPS/實際到離站、車機里程與油耗／充電kWh。
5. 票價表有效期、票證交易語意、套票與免費／現金票涵蓋度。
6. 預約容量與核銷僅需經業者核准的彙總數；不需要旅客姓名、電話或完整訂單。
7. 每公里／每車次能源、維修、勤務成本的匿名彙總價格。

無法取得就維持示範／敏感度範圍；不應以開放API看得到的內容猜測非公開商業欄位。

### MapTiler key 狀態（2026-10-23）

使用者已提供 public API key。Key 已存入 repo 根目錄 `.env.local` 的 `VITE_MAPTILER_KEY`，該檔權限為 `0600` 且 `.gitignore` 排除。`.env.example` 只保留空欄位，可安全納入版本控制。

唯讀呼叫 MapTiler `streets-v4/style.json` 已取得 HTTP 200，回應含 2 個 sources、164 個 layers；帶本機 `localhost` 與 `127.0.0.1` Origin 的 style／向量圖磚請求也成功。瀏覽器原本因 MapLibre worker 沒有經 Vite 正確打包而退回示意底圖，現已設定官方 worker URL，修復後目視驗收街道底圖和 TDX 官方線形同時顯示。這不等同正式網域 allowed origins 與額度限制已設定。

**部署前動作：**在 MapTiler Cloud 將這把 key 的 allowed HTTP origins 限定為正式網站網域及必要開發來源，並設定用量告警／額度。Origin 設定完成前，只在本機使用，不要部署此 key。由於 key 已在聊天中分享，若你的帳戶策略將此視為需要輪替，請於 MapTiler 重新產生 key，再只寫入本機環境檔。

### TDX credentials 狀態（2026-10-23）

TDX Client ID／Secret 已放在 repo 根目錄 `.env.local`，僅供後端讀取；檔案權限 `0600`，Git 忽略。先前一次驗證曾回 HTTP 400 `invalid_client`；之後在 2026-10-23 的重新驗證中 OAuth 成功，且以 Bus v2 InterCity API 讀取 6670 路線、站序與 WKT 線形，回傳 1 個路線家族、18 個線段及 846 筆原始站牌。前端畫面可載入並顯示官方 GeoJSON 線形。這僅證明唯讀靜態資料端點在該次取樣可用，不代表時刻表、GPS、ETA、餘位或票價已串接；TDX 亦曾限流，故前後端提供六小時快取與降級提示。

MapTiler `streets-v4/style.json`、本機 Origin 向量圖磚與瀏覽器渲染均已取樣成功；Vite worker 設定詳見 MapLibre 官方 ESM/Vite 指引。正式部署前仍須在 MapTiler Cloud 加入正式網域 Allowed Origins 並設用量告警。TDX 官方 GeoJSON 線形在底圖失效時仍由獨立疊圖顯示。
