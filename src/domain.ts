import type aggregates from "./data/ticket-aggregates.json";
export type Aggregates = typeof aggregates;
export type TripCandidate = {
  id: string;
  label: string;
  hour: number;
  capacity: number;
  cost: number;
  vehicle: string;
  variant: string;
};
export type ScheduleSolution = {
  status: "optimal" | "feasible" | "infeasible" | "unknown";
  objective: number | null;
  selected: TripCandidate[];
  served: number;
  unserved: number;
  demand: number;
  bound: number | null;
  scope: string;
  solver?: string;
  gap?: number | null;
};
export const tripCandidates: TripCandidate[] = [
  {
    id: "T-1510",
    label: "15:10",
    hour: 15,
    capacity: 45,
    cost: 2020,
    vehicle: "6670-03",
    variant: "6670D",
  },
  {
    id: "T-1540",
    label: "15:40",
    hour: 15,
    capacity: 35,
    cost: 1820,
    vehicle: "6670-08",
    variant: "6670A",
  },
  {
    id: "T-1610",
    label: "16:10",
    hour: 16,
    capacity: 55,
    cost: 2270,
    vehicle: "6670-05",
    variant: "6670D",
  },
  {
    id: "T-1640",
    label: "16:40",
    hour: 16,
    capacity: 35,
    cost: 1760,
    vehicle: "6670-11",
    variant: "6670A",
  },
  {
    id: "T-1710",
    label: "17:10",
    hour: 17,
    capacity: 45,
    cost: 2110,
    vehicle: "6670-03",
    variant: "6670D",
  },
  {
    id: "T-1740",
    label: "17:40",
    hour: 17,
    capacity: 55,
    cost: 2370,
    vehicle: "6670-12",
    variant: "6670A",
  },
  {
    id: "T-1810",
    label: "18:10",
    hour: 18,
    capacity: 55,
    cost: 2280,
    vehicle: "6670-05",
    variant: "6670D",
  },
  {
    id: "T-1840",
    label: "18:40",
    hour: 18,
    capacity: 35,
    cost: 1800,
    vehicle: "6670-08",
    variant: "6670A",
  },
];
/** Exact enumeration for a small, explicitly synthetic candidate set. */
export function solveMinimumCost(
  demand: number,
  minServedRatio = 0.9,
): ScheduleSolution {
  if (!Number.isInteger(demand) || demand < 0 || !Number.isFinite(minServedRatio) || minServedRatio < 0 || minServedRatio > 1) {
    throw new RangeError("demand must be a nonnegative integer and minServedRatio must be in [0, 1].");
  }
  let best: TripCandidate[] | null = null,
    bestCost = Number.POSITIVE_INFINITY,
    bestServed = 0;
  const minServed = Math.ceil(demand * minServedRatio);
  for (let mask = 0; mask < 1 << tripCandidates.length; mask++) {
    const selected = tripCandidates.filter((_, i) => (mask & (1 << i)) !== 0);
    const duplicateVehicle = selected.some((a, i) =>
      selected
        .slice(i + 1)
        .some((b) => a.vehicle === b.vehicle && Math.abs(a.hour - b.hour) < 2),
    );
    if (duplicateVehicle) continue;
    const capacity = selected.reduce((s, t) => s + t.capacity, 0),
      served = Math.min(demand, capacity);
    if (served < minServed) continue;
    const cost = selected.reduce((s, t) => s + t.cost, 0);
    if (cost < bestCost || (cost === bestCost && served > bestServed)) {
      best = selected;
      bestCost = cost;
      bestServed = served;
    }
  }
  return best
    ? {
        status: "optimal",
        objective: bestCost,
        selected: best,
        served: bestServed,
        unserved: demand - bestServed,
        demand,
        bound: bestCost,
        scope: "候選班次集合窮舉；合成成本與容量",
          solver: "前端全枚舉",
          gap: 0,
      }
    : {
        status: "infeasible",
        objective: null,
        selected: [],
        served: 0,
        unserved: demand,
        demand,
        bound: null,
        scope: "指定服務底線與候選集合",
        solver: "前端全枚舉",
        gap: null,
      };
}
export function cheapestFareFixture() {
  const options = [
    { name: "直達車", fare: 120, arrival: "08:40", transfers: 0, minutes: 40 },
    { name: "埔里轉乘", fare: 90, arrival: "09:00", transfers: 1, minutes: 55 },
  ];
  return options.sort((a, b) => a.fare - b.fare || a.minutes - b.minutes)[0];
}
export function estimateCarbon(
  vehicleKm: number,
  dieselKmPerL = 2.26,
  electricKmPerKwh = 0.7,
  electricFactor = 0.467,
  dieselKgPerKmOverride?: number,
) {
  if (
    !Number.isFinite(vehicleKm) ||
    vehicleKm < 0 ||
    !Number.isFinite(dieselKmPerL) ||
    dieselKmPerL <= 0 ||
    !Number.isFinite(electricKmPerKwh) ||
    electricKmPerKwh <= 0 ||
    !Number.isFinite(electricFactor) ||
    electricFactor < 0 ||
    (dieselKgPerKmOverride !== undefined &&
      (!Number.isFinite(dieselKgPerKmOverride) || dieselKgPerKmOverride < 0))
  ) {
    throw new RangeError("Carbon inputs must be finite and within valid ranges.");
  }
  const dieselKg = dieselKgPerKmOverride === undefined
    ? (vehicleKm / dieselKmPerL) * 2.65
    : vehicleKm * dieselKgPerKmOverride;
  const evKg = (vehicleKm / electricKmPerKwh) * electricFactor;
  return {
    dieselKg,
    evKg,
    savedKg: dieselKg - evKg,
    dieselBasis:
      dieselKgPerKmOverride === undefined
        ? "2.650 kgCO₂e/L、" + dieselKmPerL + " km/L（參考值）"
        : dieselKgPerKmOverride + " kgCO₂e/車公里（情境輸入）",
    evBasis: "0.7 km/kWh、" + electricFactor + " kgCO₂e/kWh（係數為情境值）",
  };
}
export function aggregateHours(data: Aggregates, year: number, route: string) {
  const row = data.years.find((x) => Number(x.source.slice(0, 4)) === year);
  if (!row)
    return Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: row.hour_by_route
      .filter((x) => (route === "全部" || x.route === route) && x.hour === hour)
      .reduce((s, x) => s + x.transactions, 0),
  }));
}

export type TimetableLeg = {
  tripId: string;
  from: string;
  to: string;
  departSeconds: number;
  arriveSeconds: number;
  fareNtd: number;
};
export type JourneyRequest = {
  origin: string;
  destination: string;
  departAfterSeconds: number;
  latestArrivalSeconds: number;
  minTransferSeconds: number;
  maxTransfers: number;
  maxLabels?: number;
};
export type JourneyResult = {
  status: "optimal" | "unreachable" | "search_limit";
  searchComplete: boolean;
  fareNtd: number | null;
  arrivalSeconds: number | null;
  transfers: number | null;
  legs: TimetableLeg[];
  labelsVisited: number;
  scope: "complete_fixture_graph" | "label_budget_exhausted";
};
export const journeyFixture: TimetableLeg[] = [
  {
    tripId: "direct-0800",
    from: "埔里轉運站",
    to: "高鐵臺中站",
    departSeconds: 8 * 3600,
    arriveSeconds: 8 * 3600 + 40 * 60,
    fareNtd: 120,
  },
  {
    tripId: "puli-0805",
    from: "埔里轉運站",
    to: "埔里轉運站-轉乘點",
    departSeconds: 8 * 3600 + 5 * 60,
    arriveSeconds: 8 * 3600 + 25 * 60,
    fareNtd: 40,
  },
  {
    tripId: "transfer-0830",
    from: "埔里轉運站-轉乘點",
    to: "高鐵臺中站",
    departSeconds: 8 * 3600 + 30 * 60,
    arriveSeconds: 9 * 3600,
    fareNtd: 50,
  },
  {
    tripId: "transfer-0820",
    from: "埔里轉運站-轉乘點",
    to: "高鐵臺中站",
    departSeconds: 8 * 3600 + 20 * 60,
    arriveSeconds: 8 * 3600 + 50 * 60,
    fareNtd: 20,
  },
];
type JourneyLabel = {
  stop: string;
  arrival: number;
  fare: number;
  legs: TimetableLeg[];
  usedTrips: Set<string>;
};
/** Exhaustive finite timetable label search. Fare is primary; arrival is the deterministic tie-break. */
export function findMinimumFareJourney(
  request: JourneyRequest,
  timetable: TimetableLeg[] = journeyFixture,
): JourneyResult {
  const limit = request.maxLabels ?? 5000;
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("maxLabels must be a positive integer.");
  const start: JourneyLabel = {
    stop: request.origin,
    arrival: request.departAfterSeconds,
    fare: 0,
    legs: [],
    usedTrips: new Set(),
  };
  const frontier = [start],
    labelsByStop = new Map<string, JourneyLabel[]>([[request.origin, [start]]]);
  const destinations: JourneyLabel[] = [];
  let visited = 0;
  while (frontier.length && visited < limit) {
    frontier.sort(
      (a, b) =>
        a.fare - b.fare ||
        a.arrival - b.arrival ||
        a.legs.length - b.legs.length,
    );
    const label = frontier.shift()!;
    visited++;
    if (label.stop === request.destination && label.legs.length) {
      destinations.push(label);
      continue;
    }
    if (label.legs.length > request.maxTransfers) continue;
    for (const edge of timetable) {
      if (
        edge.from !== label.stop ||
        label.usedTrips.has(edge.tripId) ||
        edge.departSeconds <
          label.arrival +
            (label.legs.length ? request.minTransferSeconds : 0) ||
        edge.departSeconds < request.departAfterSeconds ||
        edge.arriveSeconds > request.latestArrivalSeconds ||
        edge.arriveSeconds < edge.departSeconds ||
        edge.fareNtd < 0
      )
        continue;
      const next: JourneyLabel = {
        stop: edge.to,
        arrival: edge.arriveSeconds,
        fare: label.fare + edge.fareNtd,
        legs: [...label.legs, edge],
        usedTrips: new Set([...label.usedTrips, edge.tripId]),
      };
      const prior = labelsByStop.get(next.stop) ?? [];
      if (
        prior.some(
          (x) =>
            x.fare <= next.fare &&
            x.arrival <= next.arrival &&
            x.legs.length <= next.legs.length,
        )
      )
        continue;
      labelsByStop.set(next.stop, [
        ...prior.filter(
          (x) =>
            !(
              next.fare <= x.fare &&
              next.arrival <= x.arrival &&
              next.legs.length <= x.legs.length
            ),
        ),
        next,
      ]);
      frontier.push(next);
    }
  }
  const searchComplete = frontier.length === 0;
  destinations.sort(
    (a, b) =>
      a.fare - b.fare || a.arrival - b.arrival || a.legs.length - b.legs.length,
  );
  const best = destinations[0];
  return {
    status: searchComplete
      ? best
        ? "optimal"
        : "unreachable"
      : "search_limit",
    searchComplete,
    fareNtd: best?.fare ?? null,
    arrivalSeconds: best?.arrival ?? null,
    transfers: best ? Math.max(0, best.legs.length - 1) : null,
    legs: best?.legs ?? [],
    labelsVisited: visited,
    scope: searchComplete ? "complete_fixture_graph" : "label_budget_exhausted",
  };
}

export type DailyCount = { date: string; transactions: number };
export type ForecastPoint = {
  date: string;
  actual: number | null;
  prediction: number | null;
  trainingDays: number;
  status: "scored" | "insufficient_history";
};
export type ForecastReport = {
  backtest: ForecastPoint[];
  nextSevenDays: ForecastPoint[];
  mae: number | null;
  wape: number | null;
  eligibleDays: number;
  holdoutStart: string | null;
  trainingWindowDays: number;
  model: "same_weekday_4w_median";
};

/**
 * Transparent four-week same-weekday median baseline. It only learns from observed rows before each target date;
 * missing calendar dates remain missing and are never silently filled as zero demand.
 */
export function buildDailyForecast(
  daily: DailyCount[],
  holdoutCalendarDays = 28,
  trainingWindowDays = 28,
  minTrainingDays = 2,
): ForecastReport {
  const observed = [...daily]
    .filter(
      (r) =>
        Number.isFinite(r.transactions) &&
        r.transactions >= 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.date),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!observed.length)
    return {
      backtest: [],
      nextSevenDays: [],
      mae: null,
      wape: null,
      eligibleDays: 0,
      holdoutStart: null,
      trainingWindowDays,
      model: "same_weekday_4w_median",
    };
  const byDate = new Map(observed.map((r) => [r.date, r.transactions]));
  const dayNumber = (date: string) =>
    Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
  const dateString = (day: number) =>
    new Date(day * 86_400_000).toISOString().slice(0, 10);
  const predict = (targetDate: string): ForecastPoint => {
    const targetDay = dayNumber(targetDate);
    const dow = new Date(`${targetDate}T00:00:00Z`).getUTCDay();
    const samples: number[] = [];
    for (let d = targetDay - trainingWindowDays; d < targetDay; d++) {
      if (new Date(d * 86_400_000).getUTCDay() !== dow) continue;
      const value = byDate.get(dateString(d));
      if (value !== undefined) samples.push(value);
    }
    const actual = byDate.get(targetDate) ?? null;
    const orderedSamples = [...samples].sort((a, b) => a - b);
    const middle = Math.floor(orderedSamples.length / 2);
    const median =
      orderedSamples.length % 2 === 0
        ? (orderedSamples[middle - 1] + orderedSamples[middle]) / 2
        : orderedSamples[middle];
    return {
      date: targetDate,
      actual,
      prediction:
        samples.length >= minTrainingDays
          ? Math.round(median)
          : null,
      trainingDays: samples.length,
      status:
        samples.length >= minTrainingDays ? "scored" : "insufficient_history",
    };
  };
  const lastDay = dayNumber(observed.at(-1)!.date);
  const holdoutStart = dateString(
    lastDay - Math.max(1, holdoutCalendarDays) + 1,
  );
  const backtest = observed
    .filter((r) => r.date >= holdoutStart)
    .map((r) => predict(r.date));
  const scored = backtest.filter(
    (r) => r.status === "scored" && r.actual !== null && r.prediction !== null,
  );
  const absoluteError = scored.reduce(
    (sum, r) => sum + Math.abs((r.actual ?? 0) - (r.prediction ?? 0)),
    0,
  );
  const actualTotal = scored.reduce((sum, r) => sum + (r.actual ?? 0), 0);
  const nextSevenDays = Array.from({ length: 7 }, (_, i) =>
    predict(dateString(lastDay + i + 1)),
  );
  return {
    backtest,
    nextSevenDays,
    mae: scored.length ? absoluteError / scored.length : null,
    wape: actualTotal > 0 ? absoluteError / actualTotal : null,
    eligibleDays: scored.length,
    holdoutStart,
    trainingWindowDays,
    model: "same_weekday_4w_median",
  };
}
