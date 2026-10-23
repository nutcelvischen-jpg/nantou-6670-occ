import { describe, expect, it } from "vitest";
import {
  buildDailyForecast,
  estimateCarbon,
  findMinimumFareJourney,
  journeyFixture,
  solveMinimumCost,
  tripCandidates,
} from "./domain";

const base = {
  origin: "埔里轉運站",
  destination: "高鐵臺中站",
  departAfterSeconds: 8 * 3600,
  latestArrivalSeconds: 9 * 3600 + 30 * 60,
  minTransferSeconds: 300,
  maxTransfers: 2,
};
describe("finite timetable minimum-fare search", () => {
  it("chooses the valid NT$90 transfer and rejects the missed NT$60 connection", () => {
    const result = findMinimumFareJourney(base);
    expect(result.status).toBe("optimal");
    expect(result.fareNtd).toBe(90);
    expect(result.legs.map((x) => x.tripId)).toEqual([
      "puli-0805",
      "transfer-0830",
    ]);
  });
  it("respects transfer buffer and latest-arrival constraints", () => {
    expect(
      findMinimumFareJourney({ ...base, minTransferSeconds: 600 }).fareNtd,
    ).toBe(120);
    expect(
      findMinimumFareJourney({
        ...base,
        minTransferSeconds: 300,
        latestArrivalSeconds: 8 * 3600 + 45 * 60,
      }).fareNtd,
    ).toBe(120);
  });
  it("does not claim optimal when the label budget truncates search", () => {
    const result = findMinimumFareJourney({ ...base, maxLabels: 1 });
    expect(result.status).toBe("search_limit");
    expect(result.searchComplete).toBe(false);
  });
  it("matches an independent enumeration oracle on the tiny fixture", () => {
    const viable: number[] = [];
    for (const a of journeyFixture.filter((x) => x.from === base.origin))
      for (const b of journeyFixture.filter((x) => x.from === a.to)) {
        if (
          b.departSeconds >= a.arriveSeconds + base.minTransferSeconds &&
          b.arriveSeconds <= base.latestArrivalSeconds
        )
          viable.push(a.fareNtd + b.fareNtd);
      }
    const expected = Math.min(
      ...journeyFixture
        .filter(
          (x) =>
            x.from === base.origin &&
            x.to === base.destination &&
            x.arriveSeconds <= base.latestArrivalSeconds,
        )
        .map((x) => x.fareNtd),
      ...viable,
    );
    expect(findMinimumFareJourney(base).fareNtd).toBe(expected);
  });
});

describe("leakage-safe daily demand baseline", () => {
  const daily = (days: number, missing: number[] = []) => {
    const start = Date.UTC(2025, 0, 1);
    return Array.from({ length: days }, (_, i) => ({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      transactions: 100 + new Date(start + i * 86_400_000).getUTCDay() * 10 + i,
    })).filter((_, i) => !missing.includes(i));
  };
  it("scores a held-out week with prior same-weekday values only", () => {
    const source = daily(100);
    const report = buildDailyForecast(source, 7, 56, 4);
    expect(report.eligibleDays).toBe(7);
    expect(report.nextSevenDays).toHaveLength(7);
    expect(report.nextSevenDays.every((p) => p.status === "scored")).toBe(true);
    const target = source.at(-1)!;
    const changedTarget = source.map((r) =>
      r.date === target.date ? { ...r, transactions: 999999 } : r,
    );
    expect(
      buildDailyForecast(changedTarget, 7, 56, 4).backtest.at(-1)?.prediction,
    ).toBe(report.backtest.at(-1)?.prediction);
  });
  it("uses the median of the four prior same-weekday observations", () => {
    const report = buildDailyForecast(
      [
        { date: "2025-01-01", transactions: 10 },
        { date: "2025-01-08", transactions: 10 },
        { date: "2025-01-15", transactions: 10 },
        { date: "2025-01-22", transactions: 1000 },
        { date: "2025-01-29", transactions: 77 },
      ],
      1,
    );
    expect(report.model).toBe("same_weekday_4w_median");
    expect(report.backtest[0].trainingDays).toBe(4);
    expect(report.backtest[0].prediction).toBe(10);
  });
  it("keeps missing dates missing instead of treating them as zero", () => {
    const report = buildDailyForecast(daily(80, [30, 37, 44]), 7, 56, 4);
    expect(report.nextSevenDays.every((p) => p.actual === null)).toBe(true);
    expect(report.nextSevenDays.every((p) => p.prediction !== null)).toBe(true);
  });
  it("returns null WAPE for a zero-actual holdout and explicit insufficient history", () => {
    const zeros = Array.from({ length: 90 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      transactions: 0,
    }));
    expect(buildDailyForecast(zeros, 7).wape).toBeNull();
    const short = buildDailyForecast(zeros.slice(0, 10), 7);
    expect(short.eligibleDays).toBe(0);
    expect(
      short.backtest.every((p) => p.status === "insufficient_history"),
    ).toBe(true);
  });
});

describe("finite fleet candidate optimizer", () => {
  const oracle = (demand: number, ratio: number) => {
    let best = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < 2 ** tripCandidates.length; mask++) {
      const selected = tripCandidates.filter((_, i) => (mask & (1 << i)) !== 0);
      const compatible = selected.every((a, i) =>
        selected.slice(i + 1).every((b) => a.vehicle !== b.vehicle || Math.abs(a.hour - b.hour) >= 2),
      );
      if (!compatible || selected.reduce((s, t) => s + t.capacity, 0) < Math.ceil(demand * ratio)) continue;
      best = Math.min(best, selected.reduce((s, t) => s + t.cost, 0));
    }
    return Number.isFinite(best) ? best : null;
  };
  it("matches independent full subset enumeration for the supported candidate set", () => {
    for (const demand of [40, 80, 160, 280, 400]) {
      const result = solveMinimumCost(demand, 0.9);
      expect(result.objective).toBe(oracle(demand, 0.9));
      if (result.status === "optimal") {
        for (let i = 0; i < result.selected.length; i++) for (const b of result.selected.slice(i + 1)) {
          expect(result.selected[i].vehicle === b.vehicle && Math.abs(result.selected[i].hour - b.hour) < 2).toBe(false);
        }
      }
    }
  });
  it("returns infeasible when the service floor exceeds all candidate seats", () => {
    const result = solveMinimumCost(1000, 0.9);
    expect(result.status).toBe("infeasible");
    expect(result.selected).toHaveLength(0);
    expect(result.objective).toBeNull();
  });
  it("rejects invalid demand and service policy", () => {
    expect(() => solveMinimumCost(-1)).toThrow(RangeError);
    expect(() => solveMinimumCost(30, 1.1)).toThrow(RangeError);
  });
});

describe("versioned carbon scenario arithmetic", () => {
  it("reproduces the historical 1.172/0.727 kg/km pair from its inputs", () => {
    const result = estimateCarbon(100, 2.26, 0.7, 0.509);
    expect(result.dieselKg / 100).toBeCloseTo(2.65 / 2.26, 10);
    expect(result.evKg / 100).toBeCloseTo(0.7271428571, 9);
    expect(result.savedKg / 100).toBeCloseTo(0.445, 2);
  });
  it("keeps the electricity factor change isolated from diesel emissions", () => {
    const a = estimateCarbon(100, 2.26, 0.7, 0.467);
    const b = estimateCarbon(100, 2.26, 0.7, 0.474);
    expect(a.dieselKg).toBe(b.dieselKg);
    expect(a.evKg).not.toBe(b.evKg);
    expect(0.474 / 0.7).toBeCloseTo(0.6771428571, 9);
  });
  it("accepts explicit user-provided diesel sensitivity factors", () => {
    const low = estimateCarbon(100, 2.26, 0.7, 0.474, 1.585);
    const high = estimateCarbon(100, 2.26, 0.7, 0.474, 2.123);
    expect(low.dieselKg).toBe(158.5);
    expect(high.dieselKg).toBe(212.3);
    expect(low.dieselBasis).toContain("情境輸入");
  });
  it("rejects invalid distance, efficiency, and emission factor inputs", () => {
    expect(() => estimateCarbon(-1)).toThrow(RangeError);
    expect(() => estimateCarbon(1, 0)).toThrow(RangeError);
    expect(() => estimateCarbon(1, 2.26, 0.7, -0.1)).toThrow(RangeError);
  });
});
