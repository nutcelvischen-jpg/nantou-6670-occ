"""Publish the checked optimizer reference into maintained documentation."""
from pathlib import Path
import json,shutil,re
R=Path(__file__).resolve().parents[1];U=Path('/Users/chenchunchih/Documents/ChatGPT/潭行3D')
e=json.loads((R/'shared/optimizer-reference.json').read_text());p=e['parameters'];rule=p['rule'];cost=p['cost']
params=f"每日駕車 {rule['drive']} 小時、連續駕車 {rule['cont']} 小時、休息至少 {rule['rest']} 分鐘、值勤跨度 {rule['span']} 小時、端點折返 {rule['turn']} 分鐘；司機不換車（同車片段優先）；運量外推 +0%、改搭 ±0 分鐘（不併班）、併班容量上限 90%、容量假設 43 人。"
rows='\n'.join('| '+{'p85':'P85（預設）','p50':'中位數','fixed':'固定 45 km/h＋5 分'}[r['mode']]+' | '+str(r['replanned']['buses'])+' | '+str(r['replanned']['drivers'])+' | '+str(r['replanned']['threshold_exceedances'])+' |' for r in e['results'])
block=f'''<!-- optimizer-reference:start -->
## 班次最佳化統一口徑

- 版本：`{e['version']}`；核對日期：**{e['verified_on']}（Asia/Taipei）**。
- 示範營運日：**{e['service_date']}**；範圍：6670 全部子線，固定 **123 個票證推估車次**，只重排、不併班、不加開。
- 基準：**41 台車、38 位司機，13 位值勤超出設定門檻**；不是已核定的官方班次或工時裁定。
- 共同參數：{params}
- 預設空車調度時間：2024–2025 票證區間時刻差依出發小時取 P85 作代理；樣本不足回退固定 45 km/h＋5 分。

| 空車調度時間模式 | 重排車輛 | 重排司機 | 超出設定門檻的值勤 |
|---|---:|---:|---:|
{rows}

車輛採給定銜接圖的最大二分匹配；司機採跟車片段啟發式，不保證最少司機。不同模式不可混用結果。文件與影片引用預設 **28 車／34 位司機，超出設定門檻 13 → 0** 時，必須同時標示日期與上述參數。

成本參數（不作為車輛匹配的最小化目標）：柴油 {cost['dieselP']} 元/L（來源週 {p['fuel_week']}），油耗 {cost['lpk']} L/km、保修 {cost['maint']} 元/km、月薪 {cost['sal']:,} 元、雇主負擔 {cost['emp']*100:g}%、每月出勤 {cost['days']} 天、每車固定 {cost['bus']:,} 元/日，加班費另計 1.34／1.67。上班前 {rule['signOn']} 分與下班後 {rule['signOff']} 分整備只納入薪資試算，未納入值勤門檻檢核。

延誤測試：15:00–18:00 發車班次各晚到 30 分鐘；這是獨立壓力測試，不改變上表的原始重排車數。官網班表匹配容差 10 分鐘。這些都是情境參數，非營運實績。

「超出設定門檻」表示模型條件未滿足；0 不代表正式合規。未完整納入備勤、待命、跨日休息、駕駛資格及所有工時條件。基準未知空駛未計入，重排含估計空駛，成本差額不是已實現節省。CP-SAT 為不同假設的離線研究，不與本網站預設結果混用。

重現：在主站專案執行 `TZ=Asia/Taipei node scripts/build_optimizer_reference.mjs --check`。共用紀錄為 `shared/optimizer-reference.json`，包含模型輸入與資料 SHA-256；工作台使用 `scenario-lab/data/optimizer-reference.json` 同步副本。只更新文字不改演算法；模型或資料更新後必須重算並同步文件。
<!-- optimizer-reference:end -->'''
(R/'docs/OPTIMIZER_REFERENCE.md').write_text('# 班次最佳化結果與參數紀錄\n\n'+block+'\n')
for base in [R/'scenario-lab',U]:
 shutil.copy2(R/'shared/optimizer-reference.json',base/'data/optimizer-reference.json')
for file in [R/'README.md',R/'scenario-lab/README.md',U/'README.md',R/'scenario-lab/UPSTREAM_HANDOFF.md',U/'HANDOFF.md']:
 s=file.read_text();s=re.sub(r'<!-- optimizer-reference:start -->.*?<!-- optimizer-reference:end -->\n?', '',s,flags=re.S)
 s=s.replace('05 班次檢核','05 班次最佳化').replace('全部合規','未超出設定門檻（非合規認證）').replace('違規','超出設定門檻')
 lines=s.splitlines();out=[]
 for line in lines:
  if line.startswith('**05 班次最佳化（2025-10-11 示範日）**'):
   line='**05 班次最佳化**：以本文件「班次最佳化統一口徑」為準。示範營運日 2025-10-11，預設 P85、不換車、只重排：41 車／38 位司機 → 28 車／34 位司機；超出設定門檻 13 → 0。核對日 2026-10-24。'
  elif line.startswith('- **2025-10-11 的結果**'):
   line='- **示範結果**：已統一至文件前段「班次最佳化統一口徑」。舊版固定速度與司機排程結果不再作為現行引用；如需歷史版本請查原版備份。'
  elif line.startswith('- **05 班次最佳化**（原'):
   line='- **05 班次最佳化**：現行保留全年載客檢核，並提供 `optimizeDay()` 當日車輛與司機重排。早期移除求解器的敘述已失效；目前功能與參數以本文件前段為準。'
  out.append(line)
 s='\n'.join(out)+'\n';idx=s.find('\n');s=s[:idx+1]+'\n'+block+'\n'+s[idx+1:];file.write_text(s)
