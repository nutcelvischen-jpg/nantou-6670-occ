import { useMemo, useState } from "react";
import { ArrowUpRight, Bus, Clock3, ShieldCheck } from "lucide-react";
import type { AggregateSource } from "../dataClient";
import { findSameDayRoundTrips, findTimetableJourneys, type PublicTimetable } from "../timetable";

type Direction = "taichung_to_sun_moon_lake" | "sun_moon_lake_to_taichung";

export function PublishedTimetableSearch({
  timetable,
  source,
  departAfter,
  onDepartAfterChange,
  initialDirection = "sun_moon_lake_to_taichung",
  initialOrigin,
  initialDestination,
  showRoundTrip = false,
}: {
  timetable: PublicTimetable;
  source: AggregateSource;
  departAfter: string;
  onDepartAfterChange: (value: string) => void;
  initialDirection?: Direction;
  initialOrigin?: string;
  initialDestination?: string;
  showRoundTrip?: boolean;
}) {
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [origin, setOrigin] = useState(initialOrigin ?? (initialDirection === "sun_moon_lake_to_taichung" ? "日月潭" : "高鐵 台中站"));
  const [destination, setDestination] = useState(initialDestination ?? (initialDirection === "sun_moon_lake_to_taichung" ? "高鐵 台中站" : "日月潭"));
  const [serviceClass, setServiceClass] = useState("all");
  const [returnBy, setReturnBy] = useState("20:00");
  const [minimumStayMinutes, setMinimumStayMinutes] = useState(120);
  const directionStops = direction === "taichung_to_sun_moon_lake"
    ? timetable.stops_outbound
    : timetable.stops_inbound;
  const journeys = useMemo(() => findTimetableJourneys({
    trips: timetable.trips,
    direction,
    origin,
    destination,
    departAfter,
    serviceClass,
  }), [timetable.trips, direction, origin, destination, departAfter, serviceClass]);
  const roundTripOrigin = direction === "taichung_to_sun_moon_lake" ? origin : destination;
  const roundTripDestination = direction === "taichung_to_sun_moon_lake" ? destination : origin;
  const roundTrips = useMemo(() => findSameDayRoundTrips({
    trips: timetable.trips,
    origin: roundTripOrigin,
    destination: roundTripDestination,
    departAfter,
    returnBy,
    minimumStayMinutes,
    serviceClass,
  }), [timetable.trips, roundTripOrigin, roundTripDestination, departAfter, returnBy, minimumStayMinutes, serviceClass]);

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setOrigin(next === "taichung_to_sun_moon_lake" ? "高鐵 台中站" : "埔里站");
    setDestination(next === "taichung_to_sun_moon_lake" ? "日月潭" : "高鐵 台中站");
  };

  return (
    <section className="tour-transit panel official-journey-search">
      <div className="tour-transit-heading">
        <div>
          <div className="eyebrow">PUBLISHED 6670 TIMETABLE</div>
          <h2>官網公告班表直達查詢</h2>
          <p>依已保存的 6670 公開時刻快照，列出所選兩站間可搭乘的直達班次。</p>
        </div>
        <span className={`timetable-source ${source}`}>
          <Bus size={14} /> {source === "api" ? "官網快照 · API" : "官網班表快照"}
        </span>
      </div>
      <div className="tour-transit-controls">
        <label>方向<select aria-label="官網班表方向" value={direction} onChange={(event) => changeDirection(event.target.value as Direction)}>
          <option value="taichung_to_sun_moon_lake">臺中 → 日月潭</option>
          <option value="sun_moon_lake_to_taichung">日月潭 → 臺中</option>
        </select></label>
        <label>出發站<select aria-label="官網班表出發站" value={origin} onChange={(event) => setOrigin(event.target.value)}>
          {directionStops.map((stop) => <option key={stop} value={stop}>{stop.replaceAll(" ", "")}</option>)}
        </select></label>
        <label>抵達站<select aria-label="官網班表抵達站" value={destination} onChange={(event) => setDestination(event.target.value)}>
          {directionStops.map((stop) => <option key={stop} value={stop}>{stop.replaceAll(" ", "")}</option>)}
        </select></label>
        <label>最早出發<input aria-label="官網班表最早出發時間" type="time" value={departAfter} onChange={(event) => onDepartAfterChange(event.target.value)} /></label>
        <label>原表日別標記<select aria-label="官網班表日別標記" value={serviceClass} onChange={(event) => setServiceClass(event.target.value)}>
          <option value="all">全部公告列</option>
          <option value="daily_unmarked">未標日別</option>
          <option value="mon_thu">週一至四標記</option>
          <option value="fri_sun">週五至日標記</option>
        </select></label>
      </div>
      <div className="tour-transit-results">
        <div className="tour-transit-result-head">
          <div><b>{journeys.length}</b><span>班符合所選條件</span></div>
          <span>{origin.replaceAll(" ", "")} → {destination.replaceAll(" ", "")}</span>
        </div>
        {journeys.length ? (
          <div className="tour-trip-list">
            {journeys.slice(0, 6).map(({ trip, departure, arrival, durationMinutes }) => (
              <article className="tour-trip-row" key={trip.trip_id}>
                <div className="tour-trip-time"><b>{departure.time}</b><span>{departure.time_role === "scheduled_departure" ? "表列發車" : "預估到站"}</span></div>
                <div className="tour-trip-track"><i /><span>{durationMinutes} 分鐘</span><i /></div>
                <div className="tour-trip-time"><b>{arrival.time}</b><span>預估抵達</span></div>
                <div className="tour-trip-meta"><b>{trip.route_code}</b><span>{trip.service_class === "daily_unmarked" ? "未標日別" : trip.service_class === "mon_thu" ? "週一至四" : "週五至日"}</span></div>
              </article>
            ))}
          </div>
        ) : <div className="tour-trip-empty">此快照與條件下沒有查到直達班次。可調整站點、出發時間或日別；未列站點不推定可停靠。</div>}
      </div>
      <div className="tour-transit-caveat">
        <ShieldCheck size={14} />
        <span>班表標示自 {timetable.effective_from} 實施，擷取日 {timetable.snapshot_captured_at ?? "未記錄"}；尚未確認查詢日期的實際營運。中途站為業者預估到站時間；未納入票價、餘位、九人座班次與加班車。這是班次篩選，不是最低票價結果。</span>
        <a href={timetable.source_url} target="_blank" rel="noreferrer">官方來源 <ArrowUpRight size={12} /></a>
      </div>
      {showRoundTrip && <div className="round-trip-panel">
        <div className="round-trip-heading">
          <div><h3>同日往返班次組合</h3><p>每個去程配一班符合最低停留時間的最晚回程，保留較長景點停留。</p></div>
          <span>{roundTrips.length} 個去程可配回程</span>
        </div>
        <div className="round-trip-controls">
          <label>至少停留<select value={minimumStayMinutes} onChange={(event) => setMinimumStayMinutes(Number(event.target.value))}>
            {[60, 120, 180, 240, 300].map((minutes) => <option value={minutes} key={minutes}>{minutes / 60} 小時</option>)}
          </select></label>
          <label>最晚回程發車<input type="time" value={returnBy} onChange={(event) => setReturnBy(event.target.value)} /></label>
          <span>起點 {roundTripOrigin.replaceAll(" ", "")} · 景點 {roundTripDestination.replaceAll(" ", "")}</span>
        </div>
        {roundTrips.length ? <div className="round-trip-list">
          {roundTrips.slice(0, 6).map(({ outbound, inbound, stayMinutes }) => (
            <div className="round-trip-row" key={`${outbound.trip.trip_id}:${inbound.trip.trip_id}`}>
              <div><small>去程</small><b>{outbound.departure.time}</b><span>{outbound.arrival.time} 抵達景點 · {outbound.trip.route_code}</span></div>
              <div className="round-trip-stay"><Clock3 size={13} /><b>{Math.floor(stayMinutes / 60)}小時 {stayMinutes % 60}分</b><small>景點停留</small></div>
              <div><small>回程</small><b>{inbound.departure.time}</b><span>{inbound.arrival.time} 抵達起點 · {inbound.trip.route_code}</span></div>
              <span className="round-trip-calendar">{outbound.trip.service_class === "daily_unmarked" ? "日別未標，需核對" : outbound.trip.service_class === "mon_thu" ? "週一至四標記" : "週五至日標記"}</span>
            </div>
          ))}
        </div> : <div className="tour-trip-empty">目前條件下沒有符合最低停留與最晚回程的同日班次組合；可放寬停留時間或延後回程時間。</div>}
        <div className="round-trip-warning">此為歷史班表上的時間組合篩選，不是特定日期的營運承諾。只配對相同日別標記；未納入景點開放時間、轉乘步行、票價、預約座位與道路延誤。</div>
      </div>}
    </section>
  );
}
