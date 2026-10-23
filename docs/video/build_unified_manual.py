"""Illustrated current-edition manual, using verified UI captures and the same filming script."""
from pathlib import Path
from xml.sax.saxutils import escape
import runpy
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
ROOT=Path(__file__).resolve().parents[2]
film=runpy.run_path(str(ROOT/'docs/video/build_handoff.py'))
OUT=ROOT/'output/pdf/潭行Twin_整合版系統操作手冊.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('CJK','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
styles={k:ParagraphStyle(k,fontName='CJK',fontSize=size,leading=lead,textColor=HexColor('#243b33'),wordWrap='CJK',spaceAfter=10) for k,size,lead in [('body',11,17),('h1',23,32),('h2',15,23),('small',9,14)]}
def p(s,style='body'):return Paragraph(escape(s.replace('ᵀ', '^T')).replace('\n','<br/>'),styles[style])
story=[p('潭行 Twin','h1'),p('數位孿生 × 班表情境\n整合版系統操作手冊','h1'),p('2026-10-23｜內部營運情境示範'),Image(str(ROOT/'output/影片製作包/畫面素材/01-3D營運工作台.png'),width=507,height=285),Spacer(1,16),p('一套情境，六個分析面板。先理解需求，再比較班表，最後在同一個3D場景驗證。'),p('本版以實際介面截圖重製。車輛位置、候車與載客為模擬；公開班表是快照，非所選歷史日真實排班。完整數據口徑與公式見後半部。'),p('網站：'+film['URL'],'small'),p('程式快照：'+film['SHA'],'small'),PageBreak()]
steps=['選日期與需求','觀察預測與OD','設定供給限制','同需求比較','套用3D驗證']
story += [p('操作全貌與狀態保存','h1')]
flow = Table([[p(f'{n:02d} {t}', 'small') for n,t in enumerate(steps,1)]], colWidths=[101.4]*5)
flow.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),HexColor('#edf2e8')),('BOX',(0,0),(-1,-1),.5,HexColor('#cbd7c8')),('INNERGRID',(0,0),(-1,-1),.5,HexColor('#cbd7c8')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
story += [flow,Spacer(1,16),p('由左至右：資料理解 → 供給條件 → 比較 → 驗證。每次變更回到同一情境檢查服務代價。')]
story += [p('六個面板：模擬營運、需求預測、尖離峰、票證分析、班次情境建議、小幫手。切換面板不建立新模型。'),p('離開工作台看方法或成本時，背景停止計算；從側欄「數位孿生」或方法頁操作按鈕返回，保留時間、參數、班表、選車與鏡頭。瀏覽器重新整理則重新初始化。'),p('需求倍率影響旅客生成、建議與比較；歷史圖表與回測仍保持原始口徑。成本頁是獨立的合成候選求解，不會把其兩班結果送進6670場景。'),p('快速復現：2025-11-01 → 現行班表 → 壅塞關閉 → 基準1.00× → 重播06:30 → 展開「需求情境與時間定位」 → 12:00定位。'),PageBreak()]
for a,b,title,img,op,voice in film['scenes'][1:-1]:
 story += [p(title,'h1'),Image(str(ROOT/'output/影片製作包/畫面素材'/img),width=507,height=285),Spacer(1,12),p('怎麼操作','h2'),p(op),p('為什麼這樣做','h2'),p(voice),PageBreak()]
text=(ROOT/'output/影片製作包/04_系統邏輯與公式.md').read_text()
for section in text.split('\n## ')[1:]:
 title,body=section.split('\n',1)
 story.append(p(title,'h1'))
 for paragraph in body.strip().split('\n\n'): story.append(p(paragraph))
 story.append(PageBreak())
story += [p('排除狀況與錄影檢查','h1')]
for title,body in [('看不到公車','先確認時間已進入服務時窗、不是暫停在很早的時間；點定位12:00、全景，取消只顯示選取車輛。首次載入需要網路下載Three.js與字型。'),('套用按鈕不能按','檢查車隊上限是否滿足；增加車隊或修改條件後重算。即使能套用也要檢查等待、流失與OD服務。'),('車公里變少但等待變高','代表服務與里程有取捨，不是無條件改善；保存比較畫面給調度人員核對。'),('助理顯示本機規則','表示雲端服務未成功；不把降級答案當LLM成功。它只能回答內部營運主題，不能查到未接入的GPS。'),('時間或數值看起來不同','確認日期、倍率、現行或建議、壅塞、種子與時間範圍。全天比較到25:00，互動播放到24:30；不可把不同範圍的累積量直接相減。'),('錄影與首頁','使用本包6分鐘講稿及分鏡；字幕是草稿，需要依實際配音校時。成片由使用者製作後交付，再加入首頁並保留直接進入工作台。')]: story += [p(title,'h2'),p(body)]
def footer(c,doc):
 c.setFont('CJK',8);c.setFillColor(HexColor('#66756b'));c.drawString(44,27,'潭行 Twin｜整合版操作手冊｜2026-10-23');c.drawRightString(551,27,str(doc.page))
SimpleDocTemplate(str(OUT),pagesize=(595.276,841.89),leftMargin=44,rightMargin=44,topMargin=40,bottomMargin=48,title='潭行Twin 整合版系統操作手冊',author='潭行Twin').build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
