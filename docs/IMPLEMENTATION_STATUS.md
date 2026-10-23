# 潭行 Twin｜目前交付與驗收狀態

更新：2026-10-23。此文件取代先前尚未部署、使用OpenCode的狀態紀錄；舊紀錄保存在 [封存檔](spec/archive/IMPLEMENTATION_STATUS_before_sites_v10.md)。`SPEC.md`及`docs/spec/06_ACCEPTANCE.md`仍保留完整系統的設計門檻，未實作項目不因本文件而視為通過。

## 本次採用範圍

使用者已確認先用公開資料做情境示範，優先完成需求預測、尖離峰、營運儀表板、票證視覺化、車輛班次配置；小幫手僅供內部營運，外部旅遊客服延後。首頁以潭行3D風格與約1.5倍主要字體呈現。使用者製作操作影片後才提供成片、再加入首頁；目前未收到影片。

公開網站：https://nantou-transit-twin.elvischen.chatgpt.site

## 核心功能對照

| 要求 | 可檢查的實作／證據 | 完成範圍與限制 |
|---|---|---|
| 兩年度票證資料 | `src/data/ticket-aggregates.json`、`scenario-lab/data/ops-aggregates.json`；聚合建置腳本；`scenario-lab/model.test.js`隱私聚合檢查 | 使用歷史匿名聚合。原始逐筆XLSX不部署、不附分享包；交易筆數不是獨立人數 |
| 需求預測 | `scenario-lab/src/e_forecast.js`；3D需求預測分頁；model.test的共同有效日、誤差分母測試 | 24特徵對數Ridge及同星期基準；2025年11–12月逐日回測。歷史擬合、未來外推與回測分開。非即時需求，殘差帶未校準 |
| 尖離峰與票證視覺化 | `scenario-lab/src/g_ui.js`的renderPK/renderVZ；主站運量分析 | 星期×時段熱圖、方向、OD、站點、票種；主站另含頻次／回程代理。非完整客流或實測載客率 |
| 3D營運決策儀表板 | `scenario-lab/src/d_sim.js`、g_ui.js；三維車輛、站點排隊、載客與異常；model.test旅客守恆與容量測試 | 一分鐘步進、逐幀插值，當頁共用狀態。靜態官方線形配程序地形，非真實GPS／DEM |
| 車輛班次情境 | `scenario-lab/src/f_opt.js`；相同需求／種子、整備、車隊不可行與首末班測試 | 啟發式減班與貪婪串接；比較車公里、等待、流失、期末狀態。不保證最低金額成本；不可行禁止套用 |
| 最低成本配置 | `src/domain.ts`及domain.test；`api/fleet_optimizer.py`及其測試 | 公開版有限候選全枚舉；本機CP-SAT。服務容量與同車周轉限制；成本、車輛、需求為合成值，不是可執行勤務表 |
| 方法頁與操作連結 | `src/components/ModelMethodology.tsx`、TimetableScenarioLab.tsx、App.tsx、g_ui.js的panel白名單 | 公式、依據、好處與限制；六個入口直接選取ops/fc/pk/viz/opt/bot。已於瀏覽器逐一驗證選中分頁 |
| 內部營運小幫手 | `hosting/lib/operations-assistant.ts`與6項contract tests；`api/assistant.py`；g_ui.js快照 | OpenRouter `deepseek/deepseek-v4.1-flash-1017`。核准工具、數值快照、來源、真實／模擬區分；範圍外不呼叫、失敗明示規則降級；無任意程式執行或實際派車 |
| 公開Sites | `.openai/hosting.json`、hosting/worker/index.ts、Sites發布結果 | Worker只部署助理業務API；其他API 404由前端使用內嵌資料。未宣稱雲端FastAPI、TDX或道路求解已部署 |
| 舒適配色與大字體 | scenario-lab/template.html | 淺色霧綠地形、白面板；車輛詳情標頭／按鈕固定，數據可捲動；桌面與390px iframe驗證跟隨／關閉。未做手機實機觸控驗收 |
| 操作書與拍片包 | `docs/manual`來源（本機）；`output/pdf`舊版v5 PDF；`docs/video`生成腳本及output/影片製作包 | 已交付6分鐘11段分鏡、講稿、10張實際畫面、字幕草稿、公式與完整來源ZIP。舊手冊版本差異有註明 |
| 首頁操作影片 | `output/影片製作包/05_交付影片後的首頁規格.md` | **待使用者提供成片**。未生成假影片、未以佔位影片冒充完成 |

## 最近驗證與覆蓋界線

- `npm test`：100項Vitest、48項Python unittest通過。這些測試涵蓋目前實作，不等於下方完整SPEC矩陣全部通過。
- `npm run build`／Sites build helper：Vite前端與Vinext Worker可完成建置；大型圖表／地圖chunk仍有體積提示。
- 目前方法頁六個情境入口已在本機瀏覽器點擊，確認選中對應分頁。URL只接受六個有效panel值；未知值不送入setTab。
- 版本8已實際驗收OpenRouter兩輪工具及模擬車況回答；版本9、此次方法頁修改未變動助理提供者或金鑰。合約測試使用mock，不把mock當即時provider驗收。
- 版本9修正面板，已檢查桌面與390px iframe捲動、跟隨、關閉後控制不留於可存取樹；不是實機Safari/Android觸控測試。

## 完整規格仍未達成的部分

以下保留原規格要求，不默默降低門檻；本次公開情境示範不宣稱L2/L3正式營運完成。

| 原規格領域 | 目前證據 | 仍缺少／未驗證 |
|---|---|---|
| TR-01至TR-12旅客路由 | 合成時刻圖、轉乘與deadline、有限搜尋/oracle測試 | 現行票價、套票資格、無障礙與全部跨午夜案例；對外旅遊本階段延後 |
| RD-01至RD-08道路成本 | 本機合成Dijkstra、車型限制、費用拆分測試 | 經核對真實路網、動態封路與SOC限制；公開站未部署道路API |
| OP-01至OP-14班次求解 | 固定車輛候選CP-SAT及枚舉、不可行與衝突測試 | 完整車輛流、駕駛勤務、逐區段容量、預約席位、充電、完整timeout情境與求解輸出直接送同一孿生驗證 |
| 資料／預測驗收 | 兩年聚合、缺值標記、時間隔離回測、匿名頻次 | 版本化匯入發布、站群對實體站完整對照、未來特徵as-of服務與完整列級隔離工作流 |
| 模擬property全套 | 守恆、容量、共同到站需求、整備、壅塞 | 取消、故障、救援、預約釋位、完整事件digest與全部跨午夜properties |
| Carbon／成本 | 情境係數、活動數據換算、單元測試 | 業者能源帳單、係數年度來源確認、生命週期邊界與正式盤查 |
| API／權限／一致性 | 唯讀聚合、金鑰隔離、限定助理工具 | DB、版本發布、revision/idempotency、非同步任務、正式角色權限與管理上傳 |
| E2E A/B/C及效能 | 主要功能互動與指定局部案例驗證 | 未宣稱完整規格E2E、跨瀏覽器／弱網／WebGL失效與業者抽樣驗收全部通過 |

## 接續條件

1. 使用者提供影片後：設定首頁影片、字幕／章節、封面與「直接進入工作台」入口，驗證播放失敗與行動版，再更新Sites。
2. 若要升級正式營運：另需有效班表／票價、GPS／ETA、站點對照、容量、車隊／勤務、成本與能源資料，並完成上表未達成門檻。現有公開情境資料不能替代。
