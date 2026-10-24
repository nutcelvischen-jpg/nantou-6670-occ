"""Rebuild a source-backed manual, filming script and PDF from the shared assistant dictionary."""
from pathlib import Path
import json, html, shutil, zipfile
from xml.sax.saxutils import escape
from PIL import Image as PILImage
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
R=Path(__file__).resolve().parents[2]
G=json.loads((R/'shared/site-guide.json').read_text())
P=R/'public/manual'; P.mkdir(exist_ok=True)
O=R/'output/使用手冊與拍攝包_2026-10-24';O.mkdir(parents=True,exist_ok=True)
shots={'start':'guide','overview':'overview','baseline':'baseline','replay':'replay','forecast':'forecast','peak':'peak','tickets':'tickets','optimizer':'optimizer','cost':'cost','assistant':'assistant','other':'quality','recording':'guide'}
for name in set(shots.values()): assert (P/f'assets/{name}.png').exists(),name
E=html.escape
css='''*{box-sizing:border-box}body{margin:0;background:#f3f4ee;color:#243b33;font-family:"Noto Sans TC",system-ui,sans-serif;font-size:18px;line-height:1.85}main{max-width:1120px;margin:auto;padding:40px 24px}header{padding:42px;background:#dfe8d9;border-radius:24px}h1{font-size:38px;line-height:1.4}h2{font-size:28px}h3{font-size:21px;margin-top:30px}a{color:#2e6d56}nav{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0}nav a{background:white;padding:7px 13px;border-radius:8px;text-decoration:none}article{background:white;border:1px solid #dce4d8;border-radius:20px;padding:30px;margin:28px 0;scroll-margin-top:20px}img{width:100%;height:auto;border-radius:12px;border:1px solid #ddd}figure{margin:20px 0}figcaption,small{color:#65776b;font-size:16px;overflow-wrap:anywhere}.flow{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.flow span{background:#e9eee4;padding:12px;border-radius:10px}.note{border-left:4px solid #b98662;background:#faf4ec;padding:16px}li{margin:10px 0}.voice{background:#eff3ed;padding:22px;border-radius:12px}.tag{font-size:16px;letter-spacing:2px;color:#526953}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #ddd}@media print{body{background:white;font-size:12pt}nav{display:none}article{break-before:page;border:0;padding:0}header{background:white}img{max-height:13cm;object-fit:contain}a{color:inherit}main{padding:0}}'''
flow=['來源與品質','年度／子線差異','票證規則重播','需求預測回測','限制下重排','人工核對']
parts=['<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>潭行 Twin｜圖文使用手冊與拍攝分鏡</title><style>'+css+'</style><main>', '<header><div class="tag">TANXING TWIN · USER MANUAL · 2026-10-24</div><h1>把資料看懂，<br>再做營運決策。</h1><p>票證重播新版｜12 章操作說明、數據字典、公式與錄影講稿</p><p><a href="'+G['site_url']+'">開啟網站 ↗</a>　<a href="潭行Twin_使用手冊.pdf">下載 PDF</a>　<a href="6670_電子票證數據分析報告_2024-2025.docx">下載前版基線 Word 報告（排班附錄為舊版）</a></p><p>此版取代舊版人工旅客生成與固定班表情境的錄影說明。行控重播與班次最佳化截圖更新於2026-10-24；其他章節沿用前版實際畫面。數值以當次日期與參數為準。</p></header>', '<div class="flow">'+' → '.join('<span>'+x+'</span>' for x in flow)+'</div>', '<div class="note">觀測 ≠ 推估 ≠ 預測 ≠ 情境。所有車輛位置均非即時 GPS；沒有候車或延誤實測；排班結果只供候選比較。</div>', '<nav>'+''.join('<a href="#'+s['id']+'">'+str(i+1).zfill(2)+' '+E(s['title'].split('：')[0])+'</a>' for i,s in enumerate(G['sections']))+'<a href="#film">拍攝時間軸</a></nav>']
md=['# 潭行 Twin 圖文使用手冊','版本：'+G['version'],'網站：'+G['site_url'],'本版取代舊版人工旅客生成、固定30分鐘發車與套用班表的說明。','流程：'+' → '.join(flow)]
for i,s in enumerate(G['sections']):
 shot='assets/'+shots[s['id']]+'.png'
 parts+=['<article id="'+s['id']+'"><div class="tag">'+str(i+1).zfill(2)+' / '+E(s['page'])+'</div><h2>'+E(s['title'])+'</h2><p>'+E(s['purpose'])+'</p><figure><img src="'+shot+'" alt="'+E(s['title'])+'實際畫面"><figcaption>圖 '+str(i+1)+'：'+E(s['page'])+'。截圖只展示當時可見區域，完整操作請依下列步驟。</figcaption></figure>']
 if s['id']=='replay': parts.append('<figure><img src="assets/stations.png" alt="恢復公車與站點，與地圖和甘特圖連動"><figcaption>公車與站點：左右捲動查看站序，點車選取，點站定位。圖示位置為內插。</figcaption></figure>')
 if s['id']=='optimizer': parts.append('<figure><img src="assets/dispatch-gantt.png" alt="H加班候選車輛甘特圖"><figcaption>2025-10-11，H往台中+2班；橘色為新增班，完整條件見下方。</figcaption></figure>')
 md+=['\n## '+s['title'],'入口：'+s['page'],'![實際畫面]('+shot+')',s['purpose']]
 for title,key,kind in [('操作步驟','steps','ol'),('數據、公式與單位','metrics','ul'),('解讀限制','limits','ul')]:
  parts+=['<h3>'+title+'</h3><'+kind+'>'+''.join('<li>'+E(x)+'</li>' for x in s[key])+'</'+kind+'>']
  md+=['### '+title]+[f'{n+1}. {x}' if kind=='ol' else '- '+x for n,x in enumerate(s[key])]
 parts+=['<h3>為什麼這樣做</h3><p>'+E(s['why'])+'</p><small>依據：'+E('；'.join(s['sources']))+'</small><h3>可直接念的旁白</h3><div class="voice">'+E(s['voice'])+'</div></article>']
 md+=['### 為什麼這樣做',s['why'],'依據：'+'；'.join(s['sources']),'### 旁白',s['voice']]
# 8 minutes includes speech plus visible operations / chart reading time.
film=['# 潭行 Twin 使用影片逐字講稿與分鏡','建議成片約8分鐘，12段；包含實際操作、等待及讀圖停留，不是8分鐘連續旁白。','字幕依實際配音重對時間；不要把畫面數字寫死，也不要把候選改善說成已實現節省。','錄影前：桌面寬畫面、關閉通知；2024→2025；重播2025-10-11，先定位12:00並暫停；預測日期是當日明天，與重播日不同。']
parts+=['<article id="film"><div class="tag">VIDEO STORYBOARD</div><h2>8 分鐘拍攝時間軸</h2><p>每段40秒，約15–30秒旁白，其餘留給操作與讀圖。可依語速調整。</p><table><thead><tr><th>時間</th><th>畫面與操作</th><th>旁白</th></tr></thead><tbody>']
srt=[]
for i,s in enumerate(G['sections']):
 start=i*40;end=(i+1)*40;clock=lambda t:f'{t//60:02d}:{t%60:02d}';timer=clock(start)+'–'+clock(end)
 film+=['\n## '+timer+' '+s['title'],'畫面：'+s['page'],'操作：'+' → '.join(s['steps'][:2]),'旁白：'+s['voice'],'停留／特寫：'+s['metrics'][0],'不要說：'+s['limits'][0]]
 parts+=['<tr><td>'+timer+'</td><td>'+E(s['page'])+'<br>'+E(s['steps'][0])+'</td><td>'+E(s['voice'])+'</td></tr>']
 srt += [str(i+1),f'00:{clock(start)},000 --> 00:{clock(end)},000',s['voice'],'']
parts+=['</tbody></table><p>字幕檔為段落草稿，請依成片切句與校時。完成影片後，再將成片置入首頁；目前首頁仍為營運總覽。</p></article></main></html>']
(P/'index.html').write_text(''.join(parts))
(O/'01_完整使用手冊.md').write_text('\n\n'.join(md))
(O/'02_影片逐字講稿與分鏡.md').write_text('\n\n'.join(film))
(O/'03_字幕段落草稿.srt').write_text('\n'.join(srt))
(O/'04_錄影檢查表.md').write_text('''# 錄影前後檢查

- [ ] 使用最新公開網站，避免舊版截圖／人工旅客生成的舊講稿。
- [ ] 視窗建議 1600px 以上；文字保持可讀，面板可拖寬。
- [ ] 年度 2024 → 2025；全部子線首頁；單線探索另選 6670D。
- [ ] 3D 重播 2025-10-11，定位12:00並暫停，先鳥瞰全圖。
- [ ] 需求預測從拍攝當日明天起，與歷史重播日分開說明。
- [ ] 每次只改一個參數，讀出改了什麼，再解釋結果。
- [ ] 助理先測新手導覽、日均公式、在車量公式、值勤與班距差異。
- [ ] 中文選字 Enter 不送出；完成選字後 Enter 送出；Shift+Enter換行。
- [ ] 將「最優」限定於指定模型，司機啟發式候選不能稱理論下限。
- [ ] 不展示金鑰、卡號、車牌或逐筆資料。
- [ ] 影片剪輯後重新校對字幕時間；SRT僅為段落草稿。
- [ ] 成片提供後再上首頁；本次不放假影片或預告取代首頁。
''')
# Print PDF with actual screenshots and generous Chinese typesetting.
pdfmetrics.registerFont(TTFont('CJK','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
styles={k:ParagraphStyle(k,fontName='CJK',fontSize=z,leading=l,textColor=HexColor('#243b33'),wordWrap='CJK',spaceAfter=10) for k,z,l in [('body',10.5,17),('h1',23,32),('h2',15,23),('small',8.5,13)]}
styles['h1'].keepWithNext=True
styles['h2'].keepWithNext=True
def clean(s):
 for a,b in {'ᵢ':'i','Σ':'sum ','μ':'mu','σ':'sigma','λ':'lambda','α':'alpha','Δ':'差額','²':'^2','⁸':'^8','→':' > ','≠':' != ','≤':' <= ','≥':' >= ','−':'-','×':' x ','±':'+/-','∈':' in '}.items():s=s.replace(a,b)
 return s
def para(s,k='body'):return Paragraph(escape(clean(s)).replace('\n','<br/>'),styles[k])
def img(name,maxh=305):
 path=P/f'assets/{name}.png';w,h=PILImage.open(path).size;scale=min(507/w,maxh/h)
 return Image(str(path),width=w*scale,height=h*scale)
story=[para('潭行 Twin','h1'),para('圖文使用手冊\n與軟體操作影片拍攝指南','h1'),para('2026-10-24｜票證重播新版'),img('overview',330),Spacer(1,16),para('12章：操作、公式、來源、好處、限制與逐字講稿。'),para(G['site_url'],'small'),para('本版取代舊版人工需求模擬手冊。車況是票證推估，非即時 GPS。05三欄比較已同步至網站與操作字典；舊版Word基線報告的排班附錄只供歷史追溯。'),PageBreak(),para('使用順序與目錄','h1')]
for i,x in enumerate(flow):story.append(para(f'{i+1:02d}  {x}','h2'))
story.append(para('先確認資料，再看差異；從觀察產生候選，最後由業者核對。'))
for i,s in enumerate(G['sections']):story.append(para(f'{i+1:02d}  {s["title"]}','small'))
for i,s in enumerate(G['sections']):
 story += [PageBreak(),para(f'{i+1:02d}  {s["title"]}','h1'),para('入口：'+s['page'],'small'),para(s['purpose']),img(shots[s['id']]),para('圖：行控與班次最佳化畫面更新於2026-10-24；數值依當次條件而變。','small'),para('操作步驟','h2')]
 if s['id']=='replay': story += [img('stations'),para('公車與站點：可捲動查看站序，與地圖、甘特圖同步；圖示位置為內插。','small')]
 if s['id']=='optimizer': story += [img('dispatch-gantt'),para('H往台中+2班車輛甘特圖；橘色為新增班，未通過服務底線不能直接採用。','small')]
 for j,x in enumerate(s['steps']):story.append(para(f'{j+1}. {x}'))
 story.append(para('數據、公式與單位','h2'))
 for x in s['metrics']:story.append(para('• '+x))
 story += [para('為什麼這樣做','h2'),para(s['why']),para('解讀限制','h2')]
 for x in s['limits']:story.append(para('• '+x))
 story += [para('程式與資料依據：'+'；'.join(s['sources']),'small'),para('錄影旁白','h2'),para(s['voice'])]
story += [PageBreak(),para('8分鐘影片分鏡','h1'),para('每段約40秒；旁白之外保留操作與讀圖。字幕請依實際配音校時。')]
for i,s in enumerate(G['sections']):
 story += [para(f'{i*40//60:02d}:{i*40%60:02d} - {(i+1)*40//60:02d}:{(i+1)*40%60:02d}  '+s['title'],'h2'),para('畫面：'+s['page']),para('操作：'+s['steps'][0]),para('旁白：'+s['voice'])]
def footer(c,d):
 c.setFont('CJK',8);c.setFillColor(HexColor('#65776b'));c.drawString(44,26,'潭行 Twin | 票證重播版 | 2026-10-24');c.drawRightString(551,26,str(d.page))
PDF=R/'output/pdf/潭行Twin_使用手冊_票證重播版.pdf';PDF.parent.mkdir(parents=True,exist_ok=True)
SimpleDocTemplate(str(PDF),pagesize=(595.276,841.89),leftMargin=44,rightMargin=44,topMargin=40,bottomMargin=48,title='潭行Twin 使用手冊與拍攝指南',author='潭行Twin').build(story,onFirstPage=footer,onLaterPages=footer)
shutil.copy2(PDF,P/'潭行Twin_使用手冊.pdf');shutil.copy2(PDF,O/'潭行Twin_使用手冊.pdf')
shutil.copy2(P/'index.html',O/'圖文操作手冊與分鏡.html');shutil.copytree(P/'assets',O/'assets',dirs_exist_ok=True)
shutil.copy2(R/'shared/site-guide.json',O/'05_網站數據字典.json')
Z=R/'output/潭行Twin_操作手冊與影片拍攝包_2026-10-24.zip'
with zipfile.ZipFile(Z,'w',zipfile.ZIP_DEFLATED) as z:
 for f in O.rglob('*'):
  if f.is_file():z.write(f,f.relative_to(O))
print(json.dumps({'pdf':str(PDF),'html':str(P/'index.html'),'package':str(Z),'sections':len(G['sections']),'screenshots':len(set(shots.values()))},ensure_ascii=False))
