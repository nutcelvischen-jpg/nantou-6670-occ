# 南投客運官網公開資料快照

擷取日：2026-10-23（Asia/Taipei）。來源：http://www.ntbus.com.tw/ 。

透過 Browser 巡覽已出現的公開連結，保存 80 個站內 HTML／HTM 頁面，其中 69 頁有內容、11 頁顯示 404。未發現尚未巡覽的同域 HTML／HTM 連結；不代表涵蓋未被連結的頁面、所有外部網站或所有二進位附件。

## 使用方式

請先看 `analysis/NTBUS_WEBSITE_INTEGRATION.md` 與專案 `SPEC.md`。原始 HTML 為未信任網頁內容，只用於離線解析；內含外站連結／腳本來源，閱讀與分析時不要執行其腳本。

| 檔案 | 內容與限制 |
|---|---|
| browser_pages.json | 頁面 URL、擷取時間、可見文字、含分頁面板的 DOM 文字、DOM HTML、連結、圖片 |
| page_inventory.csv | 頁面狀態、文字長度、HTML 雜湊與本機檔案位置 |
| html/ | browser 擷取的 body HTML；保留原始表格結構，不是完整可離線運作網站 |
| text/ | 去除 script/style 的正文文字；包含隱藏分頁面板，不代表所有面板同時顯示 |
| raw_timetable_tables.json | 101 個含時間資訊的葉層表格；未正規化／去重／校驗營運日 |
| link_inventory.json | 305 個去重連結目標，包含錨點與外站 |
| image_inventory.json | 416 個圖片網址與來源；多數只盤點，尚未 OCR |
| downloads/ | 46 份下載：4 XLS、9 PDF、1 DOC、32 圖像；保存原始內容 |
| download_manifest.json | 公開附件 URL、來源頁、類型、大小、SHA-256 |
| fare_workbook_inventory.json | XLS 工作表與形狀；兩份全線票價表各 202×61 儲存格 |
| *_cells.json | 全線現金／IC 票價原始格網，未解析合併欄位與三角票價矩陣 |
| booking_portal.json | 2 個南投假期公開頁面；未登入或取得餘位／訂單資料 |
| knowledge_seed.json | 規則與事件種子，明示 provisional／confirmed_scope／conflict 狀態 |
| coverage.json | 自動產生的範圍統計 |

## 重要限制

- 網站同時存在歷年資訊、現行資訊、年度商品與過期頁；依欄位有效日期判斷，不用 URL 名稱或頁尾更新時間取代版本。
- 色底可能表示週一至四／週五至日、聯營業者、不同車種等，不能只抽文字後丟棄語意。
- 原始圖像是拓撲與示意圖，尚未建立經緯度與道路 GIS 幾何。
- 官方歷史公告可支援事件標註，但現行可變頁面的舊「生效日」不證明已取得當年原始完整班表。
- 2025-07-07 與公告停駛吻合；2024 五個缺日仍待查。
- 9 份 PDF 與 1 份 DOC 已封存，尚未逐頁審查；不宣稱全文都已解讀。
- Browser 附件下載曾逾時，之後使用已觀察到的公開附件 URL 下載成功；沒有繞過存取控制。

## 重現

`scripts/index_ntbus_snapshot.py` 可重新從保存的 DOM 產生文字、表格、索引與覆蓋報告；不連線。

`scripts/parse_ntbus_6670_timetable.py` 從 `html/hsr6.html` 解析 6670 國道線雙向班次，產生 `src/data/ntbus-6670-timetable.json`。目前擷取表標示自 2024-11-01 實施；其日別顏色與站點到站時刻仍附帶需核對的狀態，不代表即時供給，也不含可用於最低票價的票價版本。

`scripts/archive_ntbus_assets.py` 從已保存頁面中的公開附件及選定地圖連結下載，不猜測新 URL。再次執行會擷取當時版本，若要保留本次快照，請先另建版本目錄。
