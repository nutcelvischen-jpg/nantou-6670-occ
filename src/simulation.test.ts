import { describe, expect, it } from "vitest";
import {
  advanceTwin,
  assertTwinInvariants,
  createTwinState,
  deriveTwinMetrics,
  setTwinConfig,
} from "./simulation";

describe("deterministic public-transport twin model", () => {
  it("conserves passengers, respects vehicle capacity and keeps cumulative distance nonnegative", () => {
    let state = { ...createTwinState(), paused: false };
    state = advanceTwin(state, 90_000);
    assertTwinInvariants(state);
    expect(state.arrivals).toBe(
      deriveTwinMetrics(state).waiting +
        deriveTwinMetrics(state).onboard +
        state.completed,
    );
    expect(
      state.vehicles.every(
        (v) =>
          v.occupancy >= 0 && v.occupancy <= v.capacity && v.vehicleKm >= 0,
      ),
    ).toBe(true);
  });
  it("produces the same state for different render-frame chunking", () => {
    const start = { ...createTwinState(), paused: false };
    const one = advanceTwin(start, 25_000);
    const split = advanceTwin(
      advanceTwin(advanceTwin(start, 6_000), 9_000),
      10_000,
    );
    expect(split.simSeconds).toBe(one.simSeconds);
    expect(split.queueByStop).toEqual(one.queueByStop);
    expect(split.vehicles).toEqual(one.vehicles);
    expect(split.history).toEqual(one.history);
  });
  it("supports zero vehicles without inventing service or NaN metrics", () => {
    let state = setTwinConfig(createTwinState(), {
      vehicleCount: 0,
      electricShare: 0,
    });
    state = { ...state, paused: false };
    state = advanceTwin(state, 120_000);
    const metrics = deriveTwinMetrics(state);
    expect(metrics.waiting).toBeGreaterThan(0);
    expect(metrics.boardings).toBe(0);
    expect(metrics.loadFactor).toBe(0);
    assertTwinInvariants(state);
  });
  it("makes the configured headway change the active fleet requirement", () => {
    const base = createTwinState();
    const wideHeadway = setTwinConfig(base, { headwayMinutes: 30 });
    const closeHeadway = setTwinConfig(base, { headwayMinutes: 5 });
    expect(deriveTwinMetrics(wideHeadway).activeVehicles).toBeLessThan(
      deriveTwinMetrics(closeHeadway).activeVehicles,
    );
  });
  it("charges illustrative driver-hours for active service vehicles only", () => {
    const wideHeadway = setTwinConfig(createTwinState(), {
      headwayMinutes: 30,
    });
    const closeHeadway = setTwinConfig(createTwinState(), {
      headwayMinutes: 15,
    });
    wideHeadway.simSeconds = 3600;
    closeHeadway.simSeconds = 3600;

    const wideMetrics = deriveTwinMetrics(wideHeadway);
    const closeMetrics = deriveTwinMetrics(closeHeadway);
    expect(wideMetrics.activeVehicles).toBe(5);
    expect(closeMetrics.activeVehicles).toBe(8);
    expect(wideMetrics.operatingCostNtd).toBe(5 * 260);
    expect(closeMetrics.operatingCostNtd).toBe(8 * 260);
  });
  it("atomically rejects invalid configuration", () => {
    const original = createTwinState();
    expect(() => setTwinConfig(original, { electricShare: 1.5 })).toThrow(
      RangeError,
    );
    expect(original.config.electricShare).toBe(0.25);
  });
  it("uses distinct diesel and electric energy factors", () => {
    const diesel = createTwinState({
      vehicleCount: 1,
      demandMultiplier: 1,
      electricShare: 0,
      headwayMinutes: 15,
      basePassengersPerHour: 420,
      routeLengthKm: 38,
      speedKph: 32,
      dieselKmPerL: 2.26,
      electricKmPerKwh: 0.7,
      electricityKgPerKwh: 0.509,
      dieselKgPerL: 2.65,
    });
    diesel.vehicles[0].vehicleKm = 100;
    expect(deriveTwinMetrics(diesel).dieselKg).toBeCloseTo(117.2566, 3);
    const electric = setTwinConfig(diesel, { electricShare: 1 });
    electric.vehicles[0].vehicleKm = 100;
    expect(deriveTwinMetrics(electric).electricKg).toBeCloseTo(72.7143, 3);
  });
});
