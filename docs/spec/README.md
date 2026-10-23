# 潭行 Twin 規格入口

建議由根目錄 [SPEC.md](../../SPEC.md) 開始。它列出決策與每章權威範圍。

程式實作狀態請看 [../IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)；本規格中的驗收矩陣代表完成門檻，不會因文件存在而視為通過。

| 文件 | 內容 |
|---|---|
| [01_DATA.md](01_DATA.md) | 來源列、站點／服務時間語意、表結構、隱私與品質 gate |
| [02_ALGORITHMS.md](02_ALGORITHMS.md) | 票價最低的時刻圖搜尋、道路最低成本 Dijkstra、CP-SAT 排班、預測與事件孿生 |
| [03_VISUAL_UX.md](03_VISUAL_UX.md) | GIS圖層、17類圖表、7頁、時間軸、響應式與無資料狀態 |
| [04_API_ARCHITECTURE.md](04_API_ARCHITECTURE.md) | API、版本、非同步任務、服務邊界與安全 |
| [05_CARBON_COST.md](05_CARBON_COST.md) | 柴油／電巴、電力係數、總成本、充電限制及比較邊界 |
| [06_ACCEPTANCE.md](06_ACCEPTANCE.md) | 演算法oracle、業務不變量、API與E2E驗收 |
| [07_IMPLEMENTATION.md](07_IMPLEMENTATION.md) | 任務排序、低階模型提示詞、逐項gate |
| [08_SERVICES.md](08_SERVICES.md) | TDX、MapTiler及業者資料準備清單 |
| [09_SOURCES.md](09_SOURCES.md) | 官方來源、係數適用性與未知事項 |
| [contracts/](contracts/) | Journey／optimization／run-result JSON Schema |
| [fixtures/minimum-cost-fixture.json](fixtures/minimum-cost-fixture.json) | 手算旅客／車隊／道路／碳排fixture，明示synthetic |

這是軟體設計規格與開發交接包；repo 已含可執行本機 web app prototype，但不表示已具備正式營運能力。業者現況所需容量、即時班次、成本、票價有效期與實體道路站點仍待取得與驗證。
