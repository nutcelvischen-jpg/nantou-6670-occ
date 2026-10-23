# 05｜營運成本、柴油／電巴與 ESG 計算規格

## 1. 原則與可比較邊界

本文件將碳排視為有來源的量化模型，不冒充第三方查證盤查。每個 emission factor 綁年份、車型、燃料、地區／電網、邊界、載客／循環工況、資料來源。cost 與 carbon 使用同一條實際行駛路徑，但可有不同係數版本。所有報告顯示 measurement／estimated／assumption。

比較基準先選同一服務需求、同一方向班次、里程與時段，再比較柴油與電巴車型。若電巴 range／charging 不可行，結果是「同服務的理論排放比較」，不標可執行汰換方案。

排放地理邊界：車輛營運能源。第一版 tailpipe柴油 CO2e 與電力使用 Scope 2 emissions 分列；車輛製造、電池、電廠上游燃料、維修供應鏈未納入，故不能稱全生命週期減碳。

## 2. 你給的數字核對與採用方式

臺北市政府報告以柴油大客車市區公車 1.172 kgCO2e/km、甲類電動大客車 0.727 kgCO2e/km 計算，來源參數為柴油 2.650 kgCO2e/L、2.26 km/L；電力0.509 kgCO2e/kWh、0.7 km/kWh。差值約0.445 kg/km，是該歷史參數組合。不能將此0.727直接與另一年度0.474係數相乘後仍沿用同值。

你提供 SORT 1–3 的柴油1.585–2.123 kg/km，是不同工況級別；現有來源快照尚未查到可核對原始 SORT 數據及電巴對應工況。先列為未驗證 scenario input，不能拿 1.585 對照市區電巴0.727宣稱同條件節省。

系統係數版本建議：

| 年度 | 係數 | 作用 |
|---|---:|---|
| 2024 | 0.474 kgCO2e/kWh | 2024公用售電業發布年度值；適合歷史參考 |
| 2025 | 0.467 kgCO2e/kWh | 2025公用售電業值，2026-06公告 |
| 2025產業盤查 | 0.466 kgCO2e/kWh | 官方明列產業用戶適用，非所有用電戶一概採用 |
| 2025民生住宅 | 0.471 kgCO2e/kWh | 住宅表燈非營業／包燈用途，不套用客運營業 |

以上來源與日期見 [09_SOURCES](09_SOURCES.md)。電巴能耗0.7km/kWh僅為上述歷史比較數據，不是南投實際電巴。展示建議採兩組結果：A) 同一歷史參數1.172/0.727，重現已發布比較；B) 效率分別固定kWh/km、L/km，再套選定係數重算。B 必須使用核實能耗或清楚標示示例。

柴油 SORT 1/2/3 參數可作 sensitivity rows，必填 `test_cycle`, `vehicle_class`, `passenger_load`, `unit`, `primary_source`。未有來源就 status=unverified，預設不納入主KPI。

## 3. 柴油活動數據法

```text
diesel_emission_kgCO2e = diesel_liters × diesel_factor_kgCO2e_per_liter
if only distance is known:
    liters = distance_km / km_per_liter
```

依實車加油／油耗適用性排序：加油／車機油耗 > 同車款同線校準油耗 > 官方參數範圍 > 明示示例值。車輛暖機怠速若沒有燃料資料，不估成0；列為未納入或獨立情境。

柴油因素例2.650 kgCO2e/L 來自上列歷史研究參數，不在本文件認定為最新盤查燃料係數；正式盤查須查年度官方溫室氣體排放係數管理表及含CO2/CH4/N2O範圍。

## 4. 電巴活動數據法

```text
ev_grid_emission_kgCO2e = grid_meter_kWh × factor(year, usage_category)
if only distance is known:
    kWh = distance_km × kWh_per_km
```

優先採車端電池／充電樁/電表可對帳的用電區段，說明充電損失納入哪個電表。若只有kWh/km，依季節、路線坡度、空調、乘載作區間，未知不視為測量。

建議電耗車型欄 `kWh_per_vehicle_km`；含空調、地形、電池損失的測量邊界；電池放電到充電輸入之效率。充電時間／地點只有在 `charger` 有功率、plug type、可用窗口及接駁距離時才可排班。

公車公里增加同時提高排放及成本；每乘客公里排放為0乘客時 null。混合車隊的每座位公里需講清楚 capacity denominator 與服務里程。

## 5. 每個run的碳指標

| metric | 公式 | 限制 |
|---|---|---|
| diesel_kg | Σ L×factor | tailpipe/factor boundary |
| ev_kg | Σ kWh×grid_factor | 年度／用電類別不可省略 |
| total_operational_kg | diesel_kg+ev_kg+other_energy_kg | 僅run使用能源，不含車輛製造 |
| kg_per_vehicle_km | total / service+deadhead km | km=0則 null |
| kg_per_passenger_trip | total / completed passenger count | 模擬估計需標；分母0=null |
| kg_per_passenger_km | total / passenger_km | passenger_km=0=null |
| kg_vs_baseline | candidate−baseline | 需同路網、需求與邊界 |
| avoided_kg | baseline−candidate | 正值表示估算少排；不可負值截0 |
| electric_share | EV vehicle-km / total vehicle-km | km=0=null；非減碳比例 |

客運量是票證涵蓋範圍時指標名稱顯示「每筆已觀測票證交易」而非「每名乘客」。

## 6. 車隊成本邊界

每個 `cost_profile` 選成本構成與單位，至少可分：

- `energy_cost`: L×NTD/L 或 kWh×NTD/kWh，含是否需時計價／需量費。
- `vehicle_km_cost`: 非能源維護、輪胎等 NT$/vehicle-km。
- `driver_duty_cost`: 唯一 driver duty span×NT$/hr；如成本按固定月薪不重複分攤為邊際成本。
- `activation_cost`: 車次啟用／加班費，每次恰算一次。
- `toll_cost`: 道路過路費；公交既定路線不得亂改收費假設。
- `charging_cost`: 電力＋樁服務費＋可核對尖峰費；充電排班尚未支持前為情境成本。
- `capital_cost`: 電巴車／充電樁購入、補助、折舊；第一版營運邊際成本不包含，可做獨立全成本比較。

每項為 `observed|contract|official_reference|assumption`，固定成本／變動成本分列。最佳化的 operating cost 目標包含能被該服務方案改變的邊際費用；若做總擁有成本，再依年限、利率、殘值、利用率獨立計算。補助屬政策／投資成本，不直接當負排放或免費車輛。

同一成本不可重算：如 vehicle_km_rate 已含燃料，fuel 另列0並註明，或將該rate拆分；如果 salary 是整個班次一次，不逐路段再加。

### 6.1 目前 3D 情境模型的可追溯示例公式

現行數位孿生 prototype 使用下式產生「估算營運成本」；全部是可改的示例假設，沒有業者成本來源：

```text
diesel_energy_NTD = diesel_vehicle_km / diesel_km_per_l × 32 NTD/L
electric_energy_NTD = electric_vehicle_km / electric_km_per_kWh × 4.2 NTD/kWh
maintenance_NTD = total_vehicle_km × 12 NTD/vehicle-km
labor_NTD = active_service_vehicles × simulated_hours × 260 NTD/vehicle-hour
total_NTD = diesel_energy_NTD + electric_energy_NTD + maintenance_NTD + labor_NTD
```

柴油效率、電耗、排放係數可由 `TwinConfig` 情境設定；示例能源價格、維護費率、工時費率目前固定於模型實作。`active_service_vehicles` 是依示例往返里程、速度與發車間隔推得的在線車數，待命車不計入這個原型工時項。這不等於真實駕駛勤務成本，也未計車輛折舊、停站怠速、調位空駛、法定休息、加班、充電服務費與通行費；正式最佳化需改用經核對的 `cost_profile` 與車輛／駕駛可行性資料。

## 7. 排放比較與不確定性

1. 基準run與candidate使用同需求 seeds、停靠、service coverage、路徑距離、比較時窗。
2. 列排放差值、百分比、成本差值、未服務差值；基準0時百分比 null。
3. 係數是年度實績，決策情境可以選擇預估未來係數但需 source class=projection。
4. 對柴油km/L、電巴kWh/km、載客、空駛、係數跑 low/base/high，不只給點估計。
5. 顯示回程空駛、調位、救援等車公里；減少載客不會令已跑里程消失。
6. 電巴若多出充電調位里程，這些排放／成本納入。
7. 預測需求造成比較不確定時，對每個run同時呈現服務與排放範圍；不能只挑有利的客量分母。

## 8. P1電巴充電與排班

擴充資源：vehicle battery capacity kWh、initial/min reserve SOC、consumption by segment/weather/load、charger location/power/availability、charging curve、depot dwell、grid limit、charging price windows。

路段SOC transition：`soc_after = soc_before - energy_used + energy_charged`; 0≤SOC≤capacity，reserve下限不可放寬。每車時空不重疊、插槍時間、充電功率／時間曲線、車型相容、行程可達充電點都作限制。簡化線性充電只在固定power有效區間內採用，接近高SOC降功率時須用分段線性或實測曲線。

計劃依然以營運成本最低；展示排放 Pareto 方案作次級比較。不能將碳排與成本任意權重混為一個數。政策限制可設 carbon_cap，但來源與政策層級須經確認。

## 9. 綠色倡議輸出

可以比較需求平移、同方向搭乘合併、離峰加誘因、減少空駛、較適合車型、跨景點公運串接。每方案顯示效果、服務指標、假設與行為接受率。

「轉移到離峰」若無接受率實測只能跑 0/5/10% 合成情境。未執行使用者不能宣稱有實際減碳。低客量時小型車未必每乘客排放更低；以實際能源／座位／服務計算，不直接依車長推論。
