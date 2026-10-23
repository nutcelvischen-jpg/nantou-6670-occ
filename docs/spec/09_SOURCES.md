# 09｜來源、係數查核與未確定事項

查閱日 2026-10-23。個別服務持續更新，程式執行必須存取當期 version，不得把以下數字視為永遠有效。

## 1. 原始南投客運與專案資料

| 來源 | 支持內容 | 邊界 |
|---|---|---|
| [南投客運官方網站](http://www.ntbus.com.tw/) | 路線、班表、公告、票券與服務資訊快照 | 本專案已沿首頁可達內部HTML遍歷；不代表未連結頁或附件全文 |
| [高鐵線官方頁](http://www.ntbus.com.tw/hsr6.html) | 6670班表、加班符號、埔里尖峰中途站風險 | 動態可能不顯示加班車；當前頁不等於歷史版本 |
| [日月潭線官方頁](http://www.ntbus.com.tw/tour-sml.html) | 子線、時刻、不同日型、向山時段保留席、九人座班表 | 個別規則需核對班次與有效日期 |
| [埔里站官方資訊](http://www.ntbus.com.tw/pulimap.html) | 站址與國道服務候車說明 | 圖像地圖未 georeference |
| [歷史公告](http://www.ntbus.com.tw/news.html) | 2025-07-07全路線停駛公告 | 只證該公告範圍，不證明2024缺日原因 |
| [南投假期回程預約](https://ntbus.welcometw.com/tour/v2gb) | 該商品預約時間、站點與報到規則 | 無登入，沒有實際庫存／交易；只適用頁列商品 |
| 本地原始票證 | `../../data/raw/2024年_6670刷卡資料.xlsx`等 | 票證資料非全體乘客，不披露卡號 |

本地保存的html為未信任來源內容；以文字／表格離線分析，不執行其中scripts。完整快照範圍及hash見 [ntbus_site README](../../data/ntbus_site/README.md) 與 manifest。

## 2. 電力係數與電巴參數

| 來源 | 查核值 | 本規格怎麼使用 |
|---|---|---|
| [經濟部商業發展署：2025年電力排碳係數公開資訊](https://serv.gcis.nat.gov.tw/biznetzero/Opendata/Index?id=da4d8c97c34e4b32b49c38b8cc61f8a9) | 2025公用售電業0.467；產業用戶0.466；民生住宅0.471 kgCO2e/kWh；2026-06-02發布 | 依年份及適用戶類分流，不一律使用0.467 |
| [經濟部能源署114年度公告新聞](https://www.moea.gov.tw/MNS/populace/news/News.aspx?kind=1&menu_id=40&news_id=122891) | 新聞公告2025係數0.467，並說明分流 | official年度更新 |
| [臺北市政府統計專題分析 PDF](https://www-ws.gov.taipei/Download.ashx?icon=.pdf&n=6Ie65YyX5biX6LuK5L2%2F55So5oOF5b2i5Y%2BK5o6o5buj5oiQ5pWI5YiG5p6QLnBkZg%3D%3D&u=LzAwMS9VcGxvYWQvMzkwL3JlbGZpbGUvNDMyNzMvOTE4MTY0OC9hYTAxNDFmMC03MzliLTRkMGItYTVkOC03MzdiNjk3MzIzZjgucGRm) | 市區柴油1.173 kg/km、甲類電巴0.727；柴油2.650kg/L與2.26km/L；電力0.509與0.7km/kWh | 歷史估算情境；不是南投車輛實測，也不是年度更新後值 |
| [交通部運輸研究所大客車電動化成果](https://www.iot.gov.tw/zh_tw/more_announcement/%E8%A6%8F%E5%8A%832030%E5%B9%B4%E9%9B%BB%E5%8B%95%E5%A4%A7%E5%AE%A2%E8%BB%8A%E6%8E%A8%E5%8B%95%E7%AD%96%E7%95%A5%E8%88%87%E5%88%86%E6%9E%90%E7%A4%BA%E7%AF%84%E8%A8%88%E7%95%AB%E5%9F%B7%E8%A1%8C%E7%B8%BE%E6%95%88-78649171) | 政策背景曾設定2030年市區公車全面電動化 | 政策目標不是南投客運個別履約保證，也不涵蓋所有公路客運線型 |

電力係數定義與用途依官方頁：0.467是公用售電業整體平均；0.466明確適用列舉產業電價用戶。燃油/電力每公里參數來源有不同車型、研究與年度，不能跨口徑相減而不標。

## 3. 演算法與軟體技術來源

| 官方技術文件 | 用途 | 文件依賴 |
|---|---|---|
| [OR-Tools CP-SAT solver](https://developers.google.com/optimization/cp/cp_solver) | 整數約束、求解狀態與最佳界 | 不代表本問題模型已校正 |
| [OR-Tools VRP with time windows](https://developers.google.com/optimization/routing/vrptw) | 時窗路由約束概念 | P0路線成本使用自訂圖；DRT僅後續功能 |
| [OSRM Route API](https://project-osrm.org/docs/v5.15.2/api/) | 路網幾何／時間候選 | 路由預設偏最快，不作自有總成本solver |
| [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) | WebGL向量地圖渲染 | 不包含底圖資料授權或旅客路徑搜尋 |
| [MapTiler Cloud API](https://docs.maptiler.com/cloud/api/reference/) | 受限hosted map styles/tiles/geocoding | 要key、額度、來源限制及provider條款 |
| [MapTiler API key安全設定](https://docs.maptiler.com/guides/developer/credentials/api-key/) | 公開key來源限制 | key不是service token；設定referer/HTTP origin |
| [PMTiles概念](https://docs.protomaps.com/pmtiles/) | 靜態大型地圖檔hosting選項 | 需支援HTTP Range Request的host |
| [OpenStreetMap Tile Policy](https://operations.osmfoundation.org/policies/tiles/) | OSM免費資料與免費tile服務差異 | 公開tile server有使用政策，不是可無限商用服務 |
| [OpenStreetMap Nominatim Policy](https://operations.osmfoundation.org/policies/nominatim/) | 公共geocoder政策 | 不是批次／高流量正式API |

## 4. 尚未查證或需業者提供的資料

| 事項 | 目前知道 | 未確定如何處理 |
|---|---|---|
| SORT 1/2/3 柴油1.585–2.123 kg/km | 使用者提供範圍 | 尚未取得與南投車型相符的原始活動數據／來源；存為未驗證敏感度值 |
| 電巴0.727 kg/km | 上列臺北市研究及特定電耗參數可重現 | 不是用2025係數重算，也不是南投某車實測 |
| 交通部2030目標 | 官方政策曾有市區車隊電動化目標 | 不可套成所有公路客運路線要求；計畫應標政策適用範圍 |
| TDX特定資料集 | Swagger有公路客運類服務與API金鑰操作說明 | 尚未測試目前6670完整覆蓋、subscription、歷史快照、實時更新品質 |
| 道路圖與步行圖 | 待OSM／政府／業者幾何核對 | 日月潭山區道路、私有道路、車型限制可能不完整 |
| 票價／套票 | 官網存在現金、IC票價XLS與年度套票頁 | 2020票價矩陣、舊優惠與現行產品需解讀有效期；不可視為最新 |
| 成本 | 目前沒有南投車隊燃油、電費、人力／維修單價 | 用戶或業者確認後輸入profile；示例只測架構 |

技術依賴版本在實際開發時依套件官方文檔和安全更新鎖定；本文的演算法性質不依賴固定次版號。
