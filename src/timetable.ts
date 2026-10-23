export type TimetableStop = {
  name: string;
  time: string;
  time_role: string;
};

export type TimetableTrip = {
  trip_id: string;
  route_code: string;
  direction: string;
  service_class: string;
  service_note: string;
  stops: TimetableStop[];
};

export type PublicTimetable = {
  dataset_status: string;
  source_url: string;
  effective_from: string;
  snapshot_captured_at?: string;
  route_name: string;
  time_quality: string;
  warnings: string[];
  stops_outbound: string[];
  stops_inbound: string[];
  trips: TimetableTrip[];
};

export type TimetableJourney = {
  trip: TimetableTrip;
  departure: TimetableStop;
  arrival: TimetableStop;
  durationMinutes: number;
};

export type SameDayRoundTrip = {
  outbound: TimetableJourney;
  inbound: TimetableJourney;
  stayMinutes: number;
};

export const timeToMinutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export function findTimetableJourneys(input: {
  trips: TimetableTrip[];
  direction?: string;
  origin: string;
  destination: string;
  departAfter: string;
  serviceClass: string;
}): TimetableJourney[] {
  const earliest = timeToMinutes(input.departAfter);
  if (earliest === null || !input.origin || !input.destination || input.origin === input.destination) return [];

  return input.trips.flatMap((trip) => {
    if (input.direction && trip.direction !== input.direction) return [];
    if (input.serviceClass !== "all" && trip.service_class !== input.serviceClass) return [];
    const from = trip.stops.findIndex((stop) => stop.name === input.origin);
    const to = trip.stops.findIndex((stop, index) => index > from && stop.name === input.destination);
    if (from < 0 || to < 0) return [];
    const departure = trip.stops[from];
    const arrival = trip.stops[to];
    const departureMinutes = timeToMinutes(departure.time);
    const arrivalMinutes = timeToMinutes(arrival.time);
    if (departureMinutes === null || arrivalMinutes === null || departureMinutes < earliest) return [];
    // This public snapshot does not document after-midnight service-day semantics.
    if (arrivalMinutes < departureMinutes) return [];
    return [{ trip, departure, arrival, durationMinutes: arrivalMinutes - departureMinutes }];
  }).sort((a, b) =>
    a.departure.time.localeCompare(b.departure.time) || a.trip.trip_id.localeCompare(b.trip.trip_id),
  );
}

export function findSameDayRoundTrips(input: {
  trips: TimetableTrip[];
  origin: string;
  destination: string;
  departAfter: string;
  returnBy: string;
  minimumStayMinutes: number;
  serviceClass: string;
}): SameDayRoundTrip[] {
  const returnDeadline = timeToMinutes(input.returnBy);
  if (
    returnDeadline === null ||
    !Number.isInteger(input.minimumStayMinutes) ||
    input.minimumStayMinutes < 0
  ) return [];
  const outbound = findTimetableJourneys({
    trips: input.trips,
    direction: "taichung_to_sun_moon_lake",
    origin: input.origin,
    destination: input.destination,
    departAfter: input.departAfter,
    serviceClass: input.serviceClass,
  });
  const inbound = findTimetableJourneys({
    trips: input.trips,
    direction: "sun_moon_lake_to_taichung",
    origin: input.destination,
    destination: input.origin,
    departAfter: "00:00",
    serviceClass: input.serviceClass,
  });
  const combinations: SameDayRoundTrip[] = [];
  for (const out of outbound) {
    const arrival = timeToMinutes(out.arrival.time);
    if (arrival === null) continue;
    let latestFeasibleReturn: TimetableJourney | null = null;
    for (const back of inbound) {
      // Do not combine rows with different/unknown service-day labels.
      if (out.trip.service_class !== back.trip.service_class) continue;
      const departure = timeToMinutes(back.departure.time);
      if (
        departure === null ||
        departure < arrival + input.minimumStayMinutes ||
        departure > returnDeadline
      ) continue;
      const selectedReturn = latestFeasibleReturn
        ? timeToMinutes(latestFeasibleReturn.departure.time)
        : null;
      if (selectedReturn === null || departure > selectedReturn) latestFeasibleReturn = back;
    }
    if (latestFeasibleReturn) {
      const departure = timeToMinutes(latestFeasibleReturn.departure.time);
      if (departure !== null) combinations.push({ outbound: out, inbound: latestFeasibleReturn, stayMinutes: departure - arrival });
    }
  }
  return combinations.sort((a, b) =>
    a.outbound.departure.time.localeCompare(b.outbound.departure.time) ||
    a.outbound.trip.trip_id.localeCompare(b.outbound.trip.trip_id) ||
    a.inbound.trip.trip_id.localeCompare(b.inbound.trip.trip_id),
  );
}
