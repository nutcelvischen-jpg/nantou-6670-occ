import { describe, expect, it } from "vitest";
import timetable from "./data/ntbus-6670-timetable.json";
import { findSameDayRoundTrips, findTimetableJourneys, type TimetableTrip } from "./timetable";

const trips = timetable.trips as TimetableTrip[];

describe("public timetable journey lookup", () => {
  it("finds direct HSR-to-Sun-Moon-Lake buses and orders them by departure", () => {
    const result = findTimetableJourneys({
      trips,
      direction: "taichung_to_sun_moon_lake",
      origin: "高鐵 台中站",
      destination: "日月潭",
      departAfter: "08:00",
      serviceClass: "all",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((journey) => journey.departure.time >= "08:00")).toBe(true);
    expect(result.every((journey) => journey.durationMinutes > 0)).toBe(true);
    expect(result.map((journey) => journey.departure.time)).toEqual(
      [...result.map((journey) => journey.departure.time)].sort(),
    );
  });

  it("only returns trips that serve the selected stops in travel order", () => {
    const result = findTimetableJourneys({
      trips,
      direction: "sun_moon_lake_to_taichung",
      origin: "日月潭",
      destination: "埔里站",
      departAfter: "00:00",
      serviceClass: "all",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((journey) => journey.trip.direction === "sun_moon_lake_to_taichung")).toBe(true);
    expect(findTimetableJourneys({
      trips,
      direction: "taichung_to_sun_moon_lake",
      origin: "埔里站",
      destination: "日月潭",
      departAfter: "00:00",
      serviceClass: "all",
    }).length).toBeGreaterThan(0);
    expect(findTimetableJourneys({
      trips,
      direction: "sun_moon_lake_to_taichung",
      origin: "埔里站",
      destination: "日月潭",
      departAfter: "00:00",
      serviceClass: "all",
    })).toEqual([]);
  });

  it("keeps original service-day labels as filters without inferring a calendar", () => {
    const result = findTimetableJourneys({
      trips,
      direction: "taichung_to_sun_moon_lake",
      origin: "台中 干城站",
      destination: "埔里站",
      departAfter: "00:00",
      serviceClass: "mon_thu",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((journey) => journey.trip.service_class === "mon_thu")).toBe(true);
  });

  it("returns no result for invalid time, same stop, or stops absent from the trip", () => {
    const input = {
      trips,
      origin: "高鐵 台中站",
      destination: "日月潭",
      serviceClass: "all",
    };
    expect(findTimetableJourneys({ ...input, departAfter: "25:90" })).toEqual([]);
    expect(findTimetableJourneys({ ...input, origin: "埔里站", destination: "埔里站", departAfter: "00:00" })).toEqual([]);
    expect(findTimetableJourneys({ ...input, origin: "不存在的站", departAfter: "00:00" })).toEqual([]);
  });

  it("pairs compatible outbound and return rows within a same-day visit window", () => {
    const result = findSameDayRoundTrips({
      trips,
      origin: "高鐵 台中站",
      destination: "日月潭",
      departAfter: "07:00",
      returnBy: "20:00",
      minimumStayMinutes: 120,
      serviceClass: "all",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(new Set(result.map((option) => option.outbound.trip.trip_id)).size).toBe(result.length);
    for (const option of result) {
      expect(option.outbound.trip.direction).toBe("taichung_to_sun_moon_lake");
      expect(option.inbound.trip.direction).toBe("sun_moon_lake_to_taichung");
      expect(option.outbound.trip.service_class).toBe(option.inbound.trip.service_class);
      expect(option.stayMinutes).toBeGreaterThanOrEqual(120);
      expect(option.inbound.departure.time <= "20:00").toBe(true);
    }
  });

  it("does not claim a round trip when return time or same-class connection is infeasible", () => {
    expect(findSameDayRoundTrips({
      trips,
      origin: "高鐵 台中站",
      destination: "日月潭",
      departAfter: "07:00",
      returnBy: "07:00",
      minimumStayMinutes: 120,
      serviceClass: "all",
    })).toEqual([]);
    expect(findSameDayRoundTrips({
      trips,
      origin: "高鐵 台中站",
      destination: "日月潭",
      departAfter: "07:00",
      returnBy: "20:00",
      minimumStayMinutes: 1800,
      serviceClass: "all",
    })).toEqual([]);
  });

  it("chooses the latest compatible return before the requested deadline", () => {
    const miniTrips: TimetableTrip[] = [
      {
        trip_id: "outbound-one",
        route_code: "OUT",
        direction: "taichung_to_sun_moon_lake",
        service_class: "daily_unmarked",
        service_note: "unknown",
        stops: [
          { name: "City", time: "07:00", time_role: "scheduled_departure" },
          { name: "Lake", time: "09:00", time_role: "estimated_terminal_arrival" },
        ],
      },
      ...["11:00", "17:00", "19:00"].map((time, index): TimetableTrip => ({
        trip_id: `return-${index}`,
        route_code: "BACK",
        direction: "sun_moon_lake_to_taichung",
        service_class: "daily_unmarked",
        service_note: "unknown",
        stops: [
          { name: "Lake", time, time_role: "scheduled_departure" },
          { name: "City", time: "20:00", time_role: "estimated_terminal_arrival" },
        ],
      })),
    ];
    const [option] = findSameDayRoundTrips({
      trips: miniTrips,
      origin: "City",
      destination: "Lake",
      departAfter: "06:00",
      returnBy: "18:00",
      minimumStayMinutes: 120,
      serviceClass: "all",
    });
    expect(option.inbound.departure.time).toBe("17:00");
    expect(option.stayMinutes).toBe(480);
  });
});
