# 06｜驗收矩陣、合成 fixture 與完成門檻

此文件定義需要寫的測試，不代表軟體現在已實作或通過。所有合成fixture均須使用明確 `synthetic=true`，不得複製成真實營運結論。

## 1. 路由與票價

| ID | 輸入 | 預期證據 |
|---|---|---|
| TR-01 | 02.B6最低票價三方案 | 09:00前可達之90元方案勝過120元；60元接不上不能入結果 |
| TR-02 | 轉乘 buffer 300秒／600秒 | 第一種可搭08:30，第二種拒絕 |
| TR-03 | 最晚08:45 | 最低費用轉乘淘汰，選120元直達 |
| TR-04 | 一班已持套票兩乘次 | 購票成本一次；第二段不再計套票全價；既有支出分列 |
| TR-05 | 費率不全 | fare_minor=null、status incomplete_data、無最低價標章 |
| TR-06 | 票種不符合資格／票券過期 | 不生成非法fare transition |
| TR-07 | 跨午夜服務 | service_date保留出發班表日，抵達日期正確 |
| TR-08 | 一個 stop多個 stop_occurrence | 方向與序號不合者不能搭車 |
| TR-09 | 快班與慢班 | 票價相同時次要tie-break明示，不覆寫票價主目標 |
| TR-10 | 機率有限制搜尋budget | `search_complete=false`、feasible結果與budget警告；不宣稱最優 |
| TR-11 | 小型有限圖窮舉 oracle | 和暴力列舉 feasible paths 的最低總票價一致 |
| TR-12 | Accessibility要求但資料未知 | 標未知／unsupported，不回無障礙可行保證 |

Oracle獨立用 fixture 全枚舉可行路徑，不能共用 router 主演算法程式碼。

## 2. 道路路由

| ID | 輸入 | 預期證據 |
|---|---|---|
| RD-01 | 02.C3兩條路成本160/160 | tie-break選較快高速；元成本一致 |
| RD-02 | toll增加到60 | 選地方路160元而非高速180元 |
| RD-03 | 最晚抵達900秒 | 排除20分鐘路，選高速 |
| RD-04 | 車型禁止路段 | 不得選被禁的最便宜邊 |
| RD-05 | 路封閉時間窗 | 靜態Dijkstra回 unsupported/route unavailable；time-dependent solver處理窗 |
| RD-06 | 消耗需充電且路上無相容樁 | 判 infeasible，不能負SOC |
| RD-07 | 同小圖獨立全枚舉 | Dijkstra path與lowest generalized cost相同 |
| RD-08 | 不同排序成本 | 每條edge component加總等於總成本，不用距離作近似標籤 |

## 3. CP-SAT 最低成本排班

| ID | 輸入 | 預期證據 |
|---|---|---|
| OP-01 | 一L1000 vs 兩S1200、需求40 | 選一L，optimal，candidate_set scope |
| OP-02 | L unavailable，兩S可用 | 選兩S並服務40 |
| OP-03 | 僅一S、需求40、minimum service100% | infeasible，未被服務底線卡死的假方案不得顯示 |
| OP-04 | y班次相交且同車 | 不存在同車重疊；flow path檢核 |
| OP-05 | 只比token flow但有額外小迴圈 | DAG depot流限制排除subtour |
| OP-06 | 移時候選跨末班／最大間距 | 約束拒絕候選或依政策顯示不可行 |
| OP-07 | reservation seats按segment | 不超容量且已在需求中的hold不重複扣 |
| OP-08 | 求解逾時且已有incumbent | feasible、bound、gap；不可標optimal |
| OP-09 | 求解逾時無incumbent | timeout_no_solution，不回虛構候選 |
| OP-10 | minimum service變為不可行 | 保留原政策，diagnostic slack另標not executable |
| OP-11 | 時程缺駕駛勤務 | 最優成本照模型條件顯示，operational_ready=false |
| OP-12 | 同輸入固定 seed 單worker | 解與objective穩定；若solver版本改變留版本差異 |
| OP-13 | 小型組合枚舉 | CP-SAT objective與全枚舉候選集最低cost一致 |
| OP-14 | run的candidate assignment輸入模擬器 | 模擬實際FIFO後未達服務線時 sim verification failed，不推薦 |

## 4. 需求資料與預測

- raw非空列 = accepted+quarantined+excluded，每列有file/sheet/row evidence。
- 2025-07-07列關閉／事件，不能進正常零需求；2024-07-24/25、10-02/03/31未知。
- 一個測資將模型預測時間晚於某公告，feature builder不得見到該公告。
- validation/test不fit normalize／encoder／群集字典。
- 0 actual的WAPE=null；MAE仍正常；無 eligible observed days回 insufficient_data。
- train週中缺值不插正常需求0；確認全日停駛另標 closed service。
- 站點無法定位時聚合留在站群，不平均撒到多個站牌。
- card raw value不存在於輸出parquet、log、URL、CSV、LLM request。
- 連續年份token化使用同key版本才能比較；key rotation後限制跨期連接。

## 5. 模擬不變量 property tests

對0、1、N個車輛，0、1、N個cohorts，隨機合法事件排列做 properties：

```text
sum(arrived) + sum(initial) == sum(queue + onboard + completed + abandoned + rescue)
queue/onboard >= 0 and integer
segment projected_load <= effective_capacity
vehicle state transitions in allowed graph
completed/abandoned do not revert to waiting
service/deadhead/rescue distance cumulative monotonic
same inputs + seeds + fixed dt => same state/event digest
frame chunks [0.5×20] and [2+3+5] simulated seconds => equal state
```

測邊界：時刻同秒下客上客、班次關門、queue抵達、零容量、取消已分派班、車輛中途故障、期末尚有人、釋位前後、走錯方向、同車不同段、跨午夜。

## 6. Carbon／成本公式測試

- 100km柴油、2.26km/L、2.650kg/L => fuel=44.2478L，CO2e=117.25667kg，約1.17257kg/km。
- 100km電巴、0.7km/kWh、0.509kg/kWh => 142.8571kWh，72.7143kg，約0.72714kg/km。
- 兩者差44.5424kg/100km，當數字round至3位為0.445kg/km。
- 若僅替換年度電力係數，能耗不變且排放按比例變；cost不跟著碳係數變。
- vehicle_km=0、passenger_km=0 → 強度指標null。
- diesel rate已含能源再增加fuel line屬重複計算，validator拒絕。
- Dijkstra成本單位分一致；費用不會小於0或溢位。
- baseline=0時減量百分比null而非Infinity。

## 7. API／權限／一致性測試

- 所有計算run回input_version集合；來源發布後既有run hash不變。
- PATCH錯revision回409；兩個job重試同idempotency key不重複enqueue。
- 缺票價／路網／容量各依 action 回422可讀details，不給500。
- client secret不可出現在任何 API response、browser bundle、error log與CSV。
- viewer無法呼叫publish／管理原始匯入／看restricted card ID。
- event公告 conditional=true時沒有觸發資料前為conditional；不得標observed cancellation。
- compare不同demand/network/energy boundary禁止百分比改善但允許side by side。
- 停止worker後lease過期可接手；完成產物只有一份、狀態一致。
- 檔案公式宏／不合大小／偽造MIME拒絕；原始上傳不直接公開。

## 8. E2E 營運／旅客路徑

A. 開日曆，選合格歷史日→選方向→檢視OD→建情境→改需求→驗證→run→時間軸播放→點排隊站→成本最低方案→看方案差距及來源→匯出摘要。

B. 選合成旅客小圖A→C→設定抵達限制→得最低票價方案→改最短轉乘buffer→路徑狀態更新→檢查每段票價、可用性未知狀態與來源→產生可分享無個資URL。

C. 選green run→切柴油／電巴vehicle profile→改年度係數→只碳排改動→看成本維持不變→匯出係數來源。

## 9. 完成與驗收分級

### L0 可交Demo

合成小圖route oracle、solver oracle、模擬不變量、成本碳排可手算測試、前端主要頁面、API contract、error/empty states、README啟動方式。不能將synthetic標真實。

### L1 數據展示

現有Excel可重跑、來源列數對帳、可用站群分析、baseline forecast backtest、地圖aggregate、可證來源日期與公告停駛。

### L2 可信情境

站點mapping、當期班表、容量／部分核准成本，路由及班次求解實際由資料驅動；支援現場業者抽樣確認。output仍需待人力／場景核准。

### L3 現場試用

實際調度紀錄、駕駛勤務、GPS與能源帳單對照；權限、事故退場、操作訓練及回滾。L3之前不能稱自動派車或實證減碳。

## 10. 驗收記錄格式

每次回報列：`test_id, commit, input_fixture_sha, command, result, elapsed, environment, output_path`。截圖含 viewport、資料模式、synthetic badge。失敗測試不可換case忽略；修好後重新跑原本case。用戶要求驗證實作前，這裡描述測試規劃，不做虛構pass記錄。
