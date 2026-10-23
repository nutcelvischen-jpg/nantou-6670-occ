# 01｜資料工程、資料模型與品質契約

適用：SPEC v1.0。表中 `?` 表示 nullable；所有時間使用 Asia/Taipei 解讀本地來源，持久化事件時間以 UTC timestamptz；原始字串也保留。

## 1. 來源分層

| 層級 | 位置 | 可否修改 | 用途 |
|---|---|---|---|
| raw | data/raw、data/ntbus_site | 不可覆寫；新來源另建 snapshot | 原始證據 |
| staging | data/processed/staging/{dataset_id} | 可重建 | 型別解析、來源欄位定位 |
| curated | data/processed/curated/{version} | 已發布版本不可變 | 清洗票證、對照、正規班表 |
| marts | data/processed/marts/{version} | 可重建，保留 manifest | OD／時段／預測特徵 |
| runs | data/runs/{run_id} | 完成後不可改 | 結果、事件、參數、solver 診斷 |

原始資料檔已存在；以上 processed/runs 是待實作目錄。manifest 必含 source SHA-256、程式 commit、schema_version、輸入與輸出列數、建立時間、品質摘要。不把 raw 複製到前端 public。

## 2. 原始票證 mapping

| 原始欄名 | staging 欄 | 型別 | 規則 |
|---|---|---|---|
| 票證公司編號 | issuer_code | string | 不轉整數，保留前導零 |
| 客運公司編號 | operator_code | string? | 空值標 missing，不能借鄰列補 |
| 卡號 | raw_card_id | restricted string | 只在隔離匯入程序暫存；輸出 HMAC token |
| 票種編號 | ticket_type_code | string | 與代碼分欄 |
| 票種代碼 | ticket_type_label_raw | string | 無字典前不可斷言年齡／身分 |
| 路線公路編號 | raw_route_code | string | 完整保留子線後綴 |
| 司機編號 | raw_driver_id | restricted string | 匯入後代碼化；不得前端公開 |
| 車號 | raw_vehicle_code | string | 正規化空白但不推定容量／車型 |
| 上車時間(上) | boarding_at_raw | string/datetime | 原始與解析值都保存 |
| 計費站序(上) | origin_fare_seq | string | 不是全域站牌 ID |
| 計費站名(上) | origin_name_raw | string | trim＋全半形標準化保留原值 |
| 下車時間(下) | alighting_at_raw | string/datetime | 不以同日假設截斷跨日旅次 |
| 計費站序(下) | destination_fare_seq | string | 與方向、子線、有效期共同解釋 |
| 計費站名(下) | destination_name_raw | string | 相同字樣不代表相同站牌 |
| 交易實扣 | debit_raw | decimal/string | 解析幣值、標註退款／異常可能 |
| 原始票價 | original_fare_raw | decimal/string | 不直接當今日售價 |
| 優惠票價 | discount_fare_raw | decimal/string | 不擅自相加或替代 |
| 優惠額度 | subsidy_raw | decimal/string | 語意待確認，不直接當業者收入 |

Money 解析採 Decimal→分；有超過 2 位小數時先隔離，業務確認後才能指定 round-half-up。NULL、0、負值分開。負值可為合法退款線索，不自動刪除。

## 3. 匯入流程與重跑

1. 計算檔案雜湊、檢查 12 工作表名稱與實際欄位；欄位不同回 `SCHEMA_MISMATCH`。
2. streaming 讀取，不同工作表分批（建議 50,000 列，ASSUMPTION）；記錄原始 Excel 列號。
3. 穩定 row_id = SHA256(file_hash + sheet_name + row_number)。同檔重跑不新增重複列。
4. 解析型別，寫 staging；來源失敗仍保存 raw_fields 與錯誤。
5. 正規化車號／子線／站名；只使用已核對字典，產生 unmapped queue。
6. 規則分類為 accepted、quarantined、excluded；排除需 reason、reviewer、規則版本。
7. 候選重複 fingerprint 基於全部交易業務欄位，不含來源列號。只標 suspected_duplicate；未證實之前不得全刪。
8. 一次交易發布 curated manifest；任何步驟失敗不得發布半套版本。
9. 對帳：raw_nonempty = accepted + quarantined + excluded，三集合互斥；欄位映射失敗可 accepted 但 spatial_eligible=false，須有理由。
10. 統計處理後筆數與原始筆數不可混用；每張圖回傳 population_definition。

Excel ZIP/XML 串流沿用現有檢查腳本的可驗證做法；實作可用相容函式庫，先核對日期與金額，避免把格式字串變成錯日期。不要執行公式、外部連結或巨集。

## 4. 品質 flags 與功能 gate

| code | 觸發 | 影響 |
|---|---|---|
| invalid_timestamp | 解析失敗 | 隔離，不入時序模型 |
| negative_duration | 下車早於上車 | 隔離；不得取絕對值 |
| long_duration | > 6 小時 | 先標記，不能自動刪除；門檻 ASSUMPTION |
| same_fare_station | 起訖計費站相同 | 留存；空間旅次分析另列，不假裝 0 km |
| month_mismatch | 上車月與 sheet 不符 | 來源檢核後決定 |
| missing_service_day | 某日沒有資料 | 與停駛／來源完整性比對，未知不補零 |
| mapping_ambiguous | 多個候選實體站 | 只能進站群圖，不進精確導航 |
| invalid_direction | 無法由站序／拓撲判定 | 不併入方向性負載 |
| missing_capacity | 車型／容量未確認 | 真實載客率 disabled，可用明示假設模擬 |
| fare_unverified | 票價表有效期或條件不明 | 真實最低票價只能有限範圍結論 |
| historical_supply_unknown | 歷史班表不明 | 不算真實空車率／準點率 |

資料品質面板同時顯示 row_count、eligible_count、quality_flags；各 gate 不用單一「95分」掩蓋不可用問題。

## 5. 時空語意

### 5.1 服務日期與跨午夜

`service_date` = 班表所屬本地日期；`arrival_s/departure_s` = 距該日 00:00 的秒數，可大於 86400（例 25:10=90600）。原始上車 timestamp 以實際日期保存。某車次跨午夜仍保留原 service_date，不以 DATE(timestamp) 硬切。

API timestamp ISO 8601 帶時區；時段 bins 左閉右開 `[start,end)`；時間篩選 end-exclusive。演算法內全部整數秒，不混分鐘。

### 5.2 三種站點 ID

- fare_station_id：票證計費站群，可一對多實體站；繪製代表點時明示代表點。
- stop_id：有座標、方向、站牌位置與 accessibility 的實體站。
- stop_occurrence_id：某 route_pattern 的第幾次停靠；環線同站可能多次，不能只用 stop_id 作班表主鍵。

mapping key 必含 operator、raw_route_code、direction、fare_seq/name、有效日期。若一個計費站涵蓋多站且缺證據，允許 `target_stop_id=null,target_group_id=...`；不做任意均分然後當實測。

### 5.3 幾何

- GeoJSON / API WGS84 EPSG:4326，座標順序 `[longitude,latitude]`。
- 距離可用 PostGIS geography ST_Length 或轉 EPSG:3826 後計算；不得對經緯度直接當公尺。
- 基礎檢核：lat/lon 範圍、geometry valid、站點到線形距離、線形方向與 stop_sequence。
- 站到線超過 100m（ASSUMPTION）進 review；不可直接吸附到對向車道或水面。
- shape chainage 用於視覺插值；不作實測 GPS。道路與公車路線是兩份圖層。

## 6. PostgreSQL 實體字典

所有版本化資料含 `version_id text NOT NULL`；來源含 `source_document_id`、`valid_from date?`、`valid_to date?`（業務日期含首尾，與 timestamp 查詢不同）。無效期間不自動視為永久。

| table | 主鍵／重要欄位 | 關聯／約束 |
|---|---|---|
| dataset_version | id, kind, manifest_uri, sha256, status, published_at | draft→validated→published→retired；published immutable |
| source_document | id, url, fetched_at, source_published_at?, sha256, local_path, license_note?, review_status | 網頁內容視資料，不執行原始腳本 |
| source_conflict | id, source_ids[], field_path, scopes JSONB, resolution?, reviewer? | 未解衝突不能自動 publish |
| fare_station | id, display_name, representative_point?, point_quality | 計費站群 |
| stop | id, provider_id?, name, direction_label?, geom Point, wheelchair_boarding enum | 未知無障礙不是 false |
| fare_stop_mapping | id, raw_keys JSONB, fare_station_id, stop_id?, confidence, evidence | 無重疊有效期相互矛盾 mapping |
| route | id, operator_id, public_code, name | 公路編號與子線分開 |
| route_pattern | id, route_id, variant, direction, shape_id, allowed_vehicle_classes[] | 某方向停靠模式 |
| pattern_stop | id, pattern_id, seq, stop_id, pickup, dropoff, chainage_m? | unique(pattern_id,seq) |
| shape | id, geom LineString, length_m, quality | 路線幾何來源與有效期 |
| service_calendar | id, weekdays bitmask, start_date,end_date | 搭配 calendar_exception |
| calendar_exception | calendar_id,date,action(add/remove),reason,event_id? | 同日衝突必須解決 |
| scheduled_trip | id, pattern_id, calendar_id, vehicle_class?, supply_kind, source_trip_id? | supply_kind scheduled/extra/observed/reconstructed |
| stop_time | trip_id, occurrence_id, arrival_s,departure_s, estimated_flag | arrival≤departure，下一站不早於前站離站 |
| service_rule | id, kind, scope JSONB, params JSONB, review_status, executable | params 依 kind 驗證；seed 禁止自動啟用 |
| operational_event | id, known_at,published_at?,start_at,end_at,condition?,action,affected_ids[] | 條件公告不等於已發生事件 |
| fare_product | id, currency, price_minor, type, eligibility, validity, entitlements, source_id | entitlements 如乘次、區間、預約權另列 |
| fare_rule | id, pattern_id?, origin_zone,destination_zone,product_id,price_minor,criteria | 精確起訖／票種／有效期 lookup |
| transfer_edge | id, from_stop,to_stop,walk_m,walk_s,min_transfer_s,accessible,same_vehicle | 步行與轉乘緩衝不能重複加；same_vehicle需證據 |
| ticket_transaction | row_id, dataset_id,sheet,row_no,token,pattern_id?,fare_od,board_at,alight_at,money,flags | raw 隔離；下游不含 raw_card_id |
| reconstructed_trip | id, vehicle_token,pattern_id,first_at,last_at,confidence,method_version | observed sample count 與 uncertainty |
| trip_transaction_link | transaction_id,trip_id,probability?,method | 不允許一筆無說明地分配多班 |
| vehicle | id,type,passenger_seats,standing_limit,wheelchair_places,available_windows,depot_id | 每欄來源；示例車旗標 synthetic |
| vehicle_cost_profile | id, fuel/energy_mode,rates,boundary,validity | 單位見 05；不可重複含能源 |
| demand_cohort | id,origin_occurrence,destination_occurrence,arrival_s,count,quality,scenario_id | count 非負整數；ASSUMPTION 到站時間 |
| reservation_hold | id,trip_id,from_seq,to_seq,count,release_policy,linked_cohort_id? | private／synthetic；與 onboard 去重 |
| scenario | id,owner_id,revision,status,config JSONB,input_hash | config JSON schema；revision 樂觀鎖 |
| run | id,scenario_id,revision,input_versions,seed,status,artifact_uri,metrics | 結果 immutable |
| job | id,type,status,payload,attempt,lease_until,progress,error | 非同步恢復，無原始 Secret |
| carbon_factor | id,value,unit,year,boundary,category,published_at,source_id,status | 年度與適用類別不可省略 |
| poi | id,name,geom,open_windows,dwell_s?,accessible?,source_id | 任意景點不預設整天開放 |

索引：transaction(board_at,raw_route_code)、(vehicle_token,board_at)、(token,board_at) 僅受限服務；GIS GiST(geom)；stop_time(trip_id,departure_s)；version_id 與 service_date 常用複合索引。百萬級明細優先 Parquet，API 查 mart；不要求逐筆同時複製到 Postgres。

## 7. 聚合 marts

| mart | grain | measures |
|---|---|---|
| demand_15m | service_date,pattern,direction,fare_origin,fare_destination,bin_start | transactions_count,eligible_count,coverage_status |
| stop_hour | date,station_group,direction,hour | boardings,alightings；站群層級 |
| od_day | date,pattern,direction,origin,destination | trips,median_duration_s,p90_duration_s |
| vehicle_segment_load | reconstructed_trip_id,segment | observed_ticket_onboard,unknown_other_riders,confidence |
| card_behavior | analysis_period,cohort_label | distinct_tokens,trip_distribution,return_interval；閾值遮罩 |
| service_day_quality | date,dataset | completeness_state,suspension_state,eligible_for_training,reason |

沒有交易但確認有服務且來源完整，才可在適用站群／時段網格補「觀測票證 0」。沒有紀錄的班次不可用票證單獨證明存在；未開通站點時段不得加入正常零樣本。

## 8. 行為分析與票證去識別

HMAC-SHA256(secret, issuer_code + ':' + card_id)；secret 僅伺服端、不可提交 git。使用同一 secret 版本才可跨月比對；發卡公司 ID 避免撞號。卡片不等於個人，同人多卡／多人共卡均可能，不能稱獨立人數。

允許：搭乘頻率分布、平假日差異、重複 OD、回程間隔、票種結構。禁止從票種推定真實年齡、國籍、住宅與遊客身份；只用「規律型」「低頻型」等描述型群組，算法與門檻公開。

聚合對外輸出小於 k=10 的群組遮罩（ASSUMPTION）；不同篩選差分可還原時合併群組／限制查詢。精確單卡軌跡不進地圖、不傳 LLM。車號／司機匿名 ID 也不向旅客公開。

## 9. 官網正規化流程

保留 row/col span、bgcolor/style/legend、來源表格索引。建立人工核對的 table_profile（方向、日期、子線、星期色碼、估計時刻）。解析到 staging timetable 後檢查：

- 色底星期規則不丟失；黃色繞過埔里需停靠序列差異。
- 無法識別 A/B/D/E/F/H 或新增子線不自動歸主線。
- 預估中間到站與固定發車時間分開。
- 「加」為加班供給類型，沒有 GPS 不取消。
- 原始 XLS 票價矩陣需對照橫縱標籤、上下三角、票種與生效日期；不可把數字附近站名隨便配對。
- 今日快照只證明今日可讀內容；歷史回測需歷史版本或資料可用時間佐證。

發布前對每個方向抽查首班、末班、平日、假日、保留席與特殊子線，共至少 10 個獨立案例（小資料不足則全查）；存人工核對記錄。

## 10. 資料版本與輸入鎖定

執行 run 時綁定 ticket_version、network_version、timetable_version、fare_version、rule_version、cost_profile_version、carbon_factor_ids、forecast_model_version。任一版本更新不改既有 run。若缺必要版本，依 action 回 422 而非填隨機假設；scenario 明確選 synthetic 才可使用假設值。
