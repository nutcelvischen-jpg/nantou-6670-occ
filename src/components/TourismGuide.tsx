import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bus,
  CircleHelp,
  Clock3,
  ExternalLink,
  MapPinned,
  Search,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { PublishedTimetableSearch } from "./PublishedTimetableSearch";
import type { PublicTimetable } from "../timetable";
import type { AggregateSource } from "../dataClient";

type KnowledgeCard = {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  caveat: string;
  source: string;
  url: string;
  status: "已核對範圍" | "待確認有效性" | "歷史事件";
};
const knowledge: KnowledgeCard[] = [
  {
    id: "reservation",
    question: "日月潭回程要怎麼預約？",
    keywords: ["回程", "預約", "日月潭", "訂位", "報到"],
    answer:
      "南投假期頁面列有「日月潭 → 高鐵臺中 → 臺中干城」的線上預約商品；頁面說明須於班次發車前至少 20 分鐘到日月潭站報到。訂位是保留座位流程，車資另於現場支付，依當日適用票價與規則辦理。",
    caveat:
      "商品頁註明並非每班都有預約；連假可能不開放預約，需點開當日商品確認。這個工具沒有即時餘位或訂單系統。",
    source: "南投假期｜日月潭回程預約",
    url: "https://ntbus.welcometw.com/tour/v2gb",
    status: "待確認有效性",
  },
  {
    id: "midstop",
    question: "尖峰中途站可能搭不上車，該怎麼辦？",
    keywords: ["中途站", "滿載", "尖峰", "客滿", "埔里", "搭不上"],
    answer:
      "業者公開資訊提醒：假日或回程尖峰滿載時，中途站旅客可能較難上車，並建議部分旅客改至埔里轉運站候車。",
    caveat:
      "來源能證明有服務風險提醒，沒有提供逐班拒載人數、候車時間或座位保證；不要把風險描述當成預測值。",
    source: "南投客運｜日月潭線與國六總表",
    url: "http://www.ntbus.com.tw/tour-sml.html",
    status: "已核對範圍",
  },
  {
    id: "package-seat",
    question: "買了日月潭套票就一定有公車座位嗎？",
    keywords: ["套票", "座位", "保證", "預約", "乘車"],
    answer:
      "不能只靠套票推定已取得特定班次座位。套票使用說明與回程預約是不同流程；請依商品包含內容及當日預約規則分別確認。",
    caveat: "不同年度與商品內容可能不同，這裡不提供單一價格或座位保證。",
    source: "南投客運｜套票總覽／旅客常見問題",
    url: "http://www.ntbus.com.tw/package.html",
    status: "待確認有效性",
  },
  {
    id: "highway-seat",
    question: "埔里到臺中方向可以站著搭國道車嗎？",
    keywords: ["國道", "站立", "站位", "埔里", "臺中", "座位"],
    answer:
      "埔里站的國道服務資訊提示行駛國道不可站立；規劃中應以該班次核定乘客座位容量為限制。",
    caveat:
      "車輛席數會依車型和班次改變，系統沒有取得現行車輛配置或即時剩餘席位。",
    source: "南投客運｜埔里站搭車簡圖",
    url: "http://www.ntbus.com.tw/pulimap.html",
    status: "待確認有效性",
  },
  {
    id: "accessible",
    question: "輪椅旅客如何確認無障礙班次？",
    keywords: ["輪椅", "無障礙", "身障", "陪同", "預約"],
    answer:
      "官網無障礙服務頁提到需事先聯絡確認，並列有適用班次與站點資訊。旅客應同時確認車輛輪椅空間、上車站與預約期限。",
    caveat:
      "來源頁可能不是最新版本；本工具不會把未知資料推定為可使用，也不會替旅客完成預約。",
    source: "南投客運｜無障礙服務說明",
    url: "http://www.ntbus.com.tw/well.html",
    status: "待確認有效性",
  },
  {
    id: "storm",
    question: "票證資料某一天是零筆，代表沒有旅客需求嗎？",
    keywords: ["零筆", "缺日", "停駛", "颱風", "需求", "刷卡"],
    answer:
      "不一定。2025-07-07 的票證缺日與前一日公告的颱風全線停駛資訊相符；資料品質頁會將它標成服務中斷日，不當作一般零需求日。",
    caveat:
      "這項結論只適用該公告日期；其他缺日仍須逐日查證，缺資料不等於停駛或零需求。",
    source: "南投客運｜公告區（2025-07-06）",
    url: "http://www.ntbus.com.tw/news.html",
    status: "歷史事件",
  },
  {
    id: "extra",
    question: "公車動態沒有車輛回報，是不是班次取消了？",
    keywords: ["公車動態", "GPS", "加班車", "取消", "班次", "即時"],
    answer:
      "不能只由動態頁沒有車輛回報推定取消。官網班表註記指出部分加班車不會出現在公車動態系統；需再查公告或業者服務資訊。",
    caveat: "本工具沒有接通 TDX 即時車機，也沒有實際加班車清單。",
    source: "南投客運｜國六時刻表註記",
    url: "http://www.ntbus.com.tw/hsr6.html",
    status: "待確認有效性",
  },
  {
    id: "transfer",
    question: "到埔里轉乘要留多少時間？",
    keywords: ["轉乘", "步行", "埔里", "等車", "轉車"],
    answer:
      "南投客運網站提供埔里站場站與簡圖資訊，可作為查找轉乘位置的起點。請以現場指標和預定班次安排接續。",
    caveat:
      "目前沒有經核實的站內步行時間、班次接續保證或道路旅行時間分布，因此不輸出精確轉乘成功率。",
    source: "南投客運｜埔里站簡圖／場站介紹",
    url: "http://www.ntbus.com.tw/pulimap.html",
    status: "待確認有效性",
  },
];
const suggestions = [
  "日月潭回程怎麼預約？",
  "尖峰中途站可能搭不上車怎麼辦？",
  "買套票會有座位嗎？",
  "輪椅旅客如何確認班次？",
];
const tourLinks = [
  {
    title: "日月潭線",
    detail: "官網路線與班表入口；出發前核對方向、日期及適用班次。",
    url: "http://www.ntbus.com.tw/tour-sml.html",
    icon: Bus,
  },
  {
    title: "台中－日月潭預約",
    detail: "查看可預約商品、報到要求與當期預約例外。",
    url: "https://ntbus.welcometw.com/tour/v2gb",
    icon: Ticket,
  },
  {
    title: "路線與景點行程",
    detail: "以官網公開的建議行程與路線清單做旅遊規劃起點。",
    url: "http://www.ntbus.com.tw/gotour.html",
    icon: MapPinned,
  },
];

export function TourismGuide({
  timetable,
  timetableSource,
  departAfter,
  onDepartAfterChange,
}: {
  timetable: PublicTimetable;
  timetableSource: AggregateSource;
  departAfter: string;
  onDepartAfterChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matched = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return knowledge;
    const tokens = q.split(/[\s，。？！、,?!]+/).filter(Boolean);
    return knowledge
      .map((item) => ({
        item,
        score:
          item.keywords.reduce(
            (n, k) =>
              n + (tokens.some((t) => k.includes(t) || t.includes(k)) ? 2 : 0),
            0,
          ) +
          tokens.reduce(
            (n, t) =>
              n +
              ((item.question + item.answer + item.caveat)
                .toLocaleLowerCase()
                .includes(t)
                ? 1
                : 0),
            0,
          ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
  }, [query]);
  return (
    <div className="tourism-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">SOURCE-LINKED TRAVEL INFORMATION</div>
          <h1>智慧旅遊資訊</h1>
          <p>
            以南投客運與南投假期公開頁面作來源檢索，回答前先顯示依據與適用限制。
          </p>
        </div>
        <span className="badge-synthetic">
          <ShieldCheck size={13} /> 公開來源檢索
        </span>
      </div>
      <section className="tour-search panel">
        <div className="tour-search-icon">
          <CircleHelp size={21} />
        </div>
        <div className="tour-search-content">
          <h2>想查哪一段旅程？</h2>
          <p>輸入問題，或先選一個常見問題</p>
          <div className="tour-search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：日月潭回程預約要提早多久報到？"
            />
            <button onClick={() => setQuery("")}>清除</button>
          </div>
          <div className="question-suggestions">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setQuery(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>
      <PublishedTimetableSearch
        timetable={timetable}
        source={timetableSource}
        departAfter={departAfter}
        onDepartAfterChange={onDepartAfterChange}
        initialDirection="taichung_to_sun_moon_lake"
        showRoundTrip
      />
      <div className="tour-guide-layout">
        <section className="source-answers">
          <div className="section-title">
            <div>
              <h2>來源檢索結果</h2>
              <span>{matched.length} 條相關說明 · 快照日期 2026-10-23</span>
            </div>
            <span className="retrieval-badge">不生成未查證答案</span>
          </div>
          {matched.length ? (
            matched.slice(0, 6).map((item) => (
              <article className="answer-card" key={item.id}>
                <div className="answer-top">
                  <span className="answer-kind">
                    <CircleHelp size={13} />
                    {item.status}
                  </span>
                  <h3>{item.question}</h3>
                </div>
                <p>{item.answer}</p>
                <div className="answer-caveat">
                  <b>適用限制</b>
                  <span>{item.caveat}</span>
                </div>
                <a
                  className="source-link"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={13} />
                  {item.source}
                  <ArrowUpRight size={12} />
                </a>
              </article>
            ))
          ) : (
            <div className="empty-search">
              沒有找到足以支持回答的來源。可改用「預約、站位、尖峰、輪椅、套票」等詞查詢，或開啟官方網站確認。
            </div>
          )}
        </section>
        <aside className="tour-side">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>旅遊路線入口</h3>
                <span>點開來源確認當期服務</span>
              </div>
              <MapPinned size={16} />
            </div>
            {tourLinks.map(({ title, detail, url, icon: Icon }) => (
              <a
                className="tour-route-link"
                href={url}
                target="_blank"
                rel="noreferrer"
                key={title}
              >
                <span className="tour-route-icon">
                  <Icon size={15} />
                </span>
                <span>
                  <b>{title}</b>
                  <small>{detail}</small>
                </span>
                <ArrowUpRight size={14} />
              </a>
            ))}
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>資料狀態</h3>
                <span>不連訂票或即時車機</span>
              </div>
              <Clock3 size={16} />
            </div>
            <div className="tour-status-row">
              <i className="status-green" />
              <span>公開網站快照</span>
              <b>可檢索</b>
            </div>
            <div className="tour-status-row">
              <i className="status-amber" />
              <span>班次／票價當期有效性</span>
              <b>請核對來源</b>
            </div>
            <div className="tour-status-row">
              <i className="status-gray" />
              <span>預約餘位／個人訂單</span>
              <b>未連線</b>
            </div>
            <div className="tour-status-note">
              這是有來源連結的資訊檢索試辦版，不是生成式客服，也不會代替業者確認班次或完成預約。
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
