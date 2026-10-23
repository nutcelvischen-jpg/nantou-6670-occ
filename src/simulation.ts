/** Deterministic public-transport digital-twin demo model.
 * This model is illustrative, not calibrated to an operator's GPS, dispatch or load data.
 * The map/3D scene, KPI cards and history all consume this one state.
 */
export const FIXED_STEP_MS = 500;
const STOP_POSITIONS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
const SAMPLE_INTERVAL_SECONDS = 30;

export type TwinConfig = {
  vehicleCount: number;
  demandMultiplier: number;
  electricShare: number;
  headwayMinutes: number;
  basePassengersPerHour: number;
  routeLengthKm: number;
  speedKph: number;
  dieselKmPerL: number;
  electricKmPerKwh: number;
  electricityKgPerKwh: number;
  dieselKgPerL: number;
};
export type VehicleState = {
  id: string;
  active: boolean;
  progress: number;
  direction: 1 | -1;
  occupancy: number;
  capacity: number;
  electric: boolean;
  vehicleKm: number;
  tripsCompleted: number;
};
export type TwinMetrics = {
  simSeconds: number;
  arrivals: number;
  boardings: number;
  completed: number;
  waiting: number;
  onboard: number;
  vehicleKm: number;
  dieselKg: number;
  electricKg: number;
  operatingCostNtd: number;
  loadFactor: number;
  serviceRate: number;
  activeVehicles: number;
};
export type TwinSnapshot = {
  metrics: TwinMetrics;
  queueByStop: number[];
  vehicles: VehicleState[];
};
export type TwinState = {
  config: TwinConfig;
  simSeconds: number;
  speed: 1 | 2 | 4;
  paused: boolean;
  accumulatorMs: number;
  arrivalRemainders: number[];
  queueByStop: number[];
  vehicles: VehicleState[];
  arrivals: number;
  boardings: number;
  completed: number;
  nextSampleSeconds: number;
  history: TwinSnapshot[];
};

export const DEFAULT_TWIN_CONFIG: TwinConfig = {
  vehicleCount: 8,
  demandMultiplier: 1,
  electricShare: 0.25,
  headwayMinutes: 15,
  basePassengersPerHour: 420,
  routeLengthKm: 38,
  speedKph: 32,
  dieselKmPerL: 2.26,
  electricKmPerKwh: 0.7,
  electricityKgPerKwh: 0.474,
  dieselKgPerL: 2.65,
};

function validateConfig(c: TwinConfig): void {
  const finitePositive = [
    c.demandMultiplier,
    c.headwayMinutes,
    c.basePassengersPerHour,
    c.routeLengthKm,
    c.speedKph,
    c.dieselKmPerL,
    c.electricKmPerKwh,
    c.electricityKgPerKwh,
    c.dieselKgPerL,
  ];
  if (
    !Number.isInteger(c.vehicleCount) ||
    c.vehicleCount < 0 ||
    c.vehicleCount > 60 ||
    finitePositive.some((v) => !Number.isFinite(v) || v <= 0) ||
    !Number.isFinite(c.electricShare) ||
    c.electricShare < 0 ||
    c.electricShare > 1
  ) {
    throw new RangeError("Twin configuration is outside supported bounds.");
  }
}

export function createTwinState(
  config: TwinConfig = DEFAULT_TWIN_CONFIG,
): TwinState {
  validateConfig(config);
  const electricCount = Math.round(config.vehicleCount * config.electricShare);
  const requiredFleet = Math.ceil(
    (((2 * config.routeLengthKm) / config.speedKph) * 60) /
      config.headwayMinutes,
  );
  const activeCount = Math.min(config.vehicleCount, requiredFleet);
  const vehicles = Array.from(
    { length: config.vehicleCount },
    (_, i): VehicleState => ({
      id: `bus-${String(i + 1).padStart(2, "0")}`,
      active: i < activeCount,
      progress: (i * 0.61803398875) % 1,
      direction: i % 2 === 0 ? 1 : -1,
      occupancy: 0,
      capacity: 45,
      electric: i < electricCount,
      vehicleKm: 0,
      tripsCompleted: 0,
    }),
  );
  const state: TwinState = {
    config: { ...config },
    simSeconds: 0,
    speed: 1,
    paused: true,
    accumulatorMs: 0,
    arrivalRemainders: Array(6).fill(0),
    queueByStop: Array(6).fill(0),
    vehicles,
    arrivals: 0,
    boardings: 0,
    completed: 0,
    nextSampleSeconds: SAMPLE_INTERVAL_SECONDS,
    history: [],
  };
  state.history = [
    {
      metrics: deriveTwinMetrics(state),
      queueByStop: [...state.queueByStop],
      vehicles: state.vehicles.map((v) => ({ ...v })),
    },
  ];
  return state;
}

/** A simple AM/PM shape drives arrival intensity; exact hourly history is shown separately. */
function demandShape(hour: number): number {
  if (hour >= 7 && hour < 9) return 1.25;
  if (hour >= 15 && hour < 19) return 1.45;
  if (hour >= 10 && hour < 14) return 0.72;
  return 0.55;
}

function crossed(
  oldP: number,
  newP: number,
  stopP: number,
  dir: 1 | -1,
): boolean {
  return dir === 1
    ? oldP < stopP && newP >= stopP
    : oldP > stopP && newP <= stopP;
}

function stepOnce(state: TwinState): TwinState {
  const dt = FIXED_STEP_MS / 1000;
  const simSeconds = state.simSeconds + dt;
  const hour = (6 + simSeconds / 3600) % 24;
  const arrivals = state.arrivals;
  const queueByStop = [...state.queueByStop];
  let added = 0;
  const arrivalRemainders = state.arrivalRemainders.map((r, i) => {
    const rate =
      ((state.config.basePassengersPerHour / 3600) *
        state.config.demandMultiplier *
        demandShape(hour)) /
      6;
    const fractional = r + rate * dt;
    const count = Math.floor(fractional);
    if (count > 0) {
      queueByStop[i] += count;
      added += count;
    }
    return fractional - count;
  });

  let boardings = state.boardings,
    completed = state.completed;
  const vehicles = state.vehicles.map((v) => {
    if (!v.active) return v;
    const oldP = v.progress;
    const distance = (state.config.speedKph / 3600) * dt;
    const delta = distance / state.config.routeLengthKm;
    let newP = Math.max(0, Math.min(1, oldP + v.direction * delta));
    let direction = v.direction;
    let tripsCompleted = v.tripsCompleted;
    for (const stopP of STOP_POSITIONS) {
      if (crossed(oldP, newP, stopP, v.direction)) {
        const stopIndex = Math.min(5, STOP_POSITIONS.indexOf(stopP));
        const terminal = stopIndex === 0 || stopIndex === 5;
        const alighting = terminal
          ? v.occupancy
          : Math.floor(v.occupancy * 0.18);
        completed += alighting;
        const occupancy = v.occupancy - alighting;
        const available = Math.max(0, v.capacity - occupancy);
        const boarding = Math.min(available, queueByStop[stopIndex]);
        queueByStop[stopIndex] -= boarding;
        boardings += boarding;
        if (terminal) {
          direction = v.direction === 1 ? -1 : 1;
          tripsCompleted += 1;
        }
        return {
          ...v,
          progress: newP,
          direction,
          occupancy: occupancy + boarding,
          vehicleKm: v.vehicleKm + distance,
          tripsCompleted,
        };
      }
    }
    return {
      ...v,
      progress: newP,
      direction,
      vehicleKm: v.vehicleKm + distance,
      tripsCompleted,
    };
  });
  const next: TwinState = {
    ...state,
    simSeconds,
    vehicles,
    arrivalRemainders,
    arrivals: arrivals + added,
    boardings,
    completed,
    queueByStop,
    accumulatorMs: state.accumulatorMs - FIXED_STEP_MS,
  };
  if (simSeconds + 1e-9 >= state.nextSampleSeconds) {
    next.history = [
      ...state.history,
      {
        metrics: deriveTwinMetrics(next),
        queueByStop: [...next.queueByStop],
        vehicles: next.vehicles.map((v) => ({ ...v })),
      },
    ].slice(-240);
    next.nextSampleSeconds += SAMPLE_INTERVAL_SECONDS;
  }
  return next;
}

/** Advance wall-clock milliseconds. Fixed model steps make results independent of render frame rate. */
export function advanceTwin(state: TwinState, elapsedMs: number): TwinState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 120_000)
    throw new RangeError("elapsedMs must be 0–120000.");
  if (state.paused || elapsedMs === 0) return state;
  let next = {
    ...state,
    accumulatorMs: state.accumulatorMs + elapsedMs * state.speed,
  };
  while (next.accumulatorMs + 1e-9 >= FIXED_STEP_MS) next = stepOnce(next);
  return next;
}

export function setTwinConfig(
  state: TwinState,
  changes: Partial<TwinConfig>,
): TwinState {
  const config = { ...state.config, ...changes };
  validateConfig(config);
  return createTwinState(config);
}

export function deriveTwinMetrics(state: TwinState): TwinMetrics {
  const waiting = state.queueByStop.reduce((s, q) => s + q, 0);
  const onboard = state.vehicles.reduce((s, v) => s + v.occupancy, 0);
  const vehicleKm = state.vehicles.reduce((s, v) => s + v.vehicleKm, 0);
  const electricKm = state.vehicles
    .filter((v) => v.electric)
    .reduce((s, v) => s + v.vehicleKm, 0);
  const dieselKm = vehicleKm - electricKm;
  const dieselKg =
    (dieselKm / state.config.dieselKmPerL) * state.config.dieselKgPerL;
  const electricKg =
    (electricKm / state.config.electricKmPerKwh) *
    state.config.electricityKgPerKwh;
  const energyCost =
    (dieselKm / state.config.dieselKmPerL) * 32 +
    (electricKm / state.config.electricKmPerKwh) * 4.2;
  const variableCost = energyCost + vehicleKm * 12;
  const activeVehicles = state.vehicles.filter((v) => v.active);
  const laborCost = ((activeVehicles.length * state.simSeconds) / 3600) * 260;
  const capacity = activeVehicles.reduce((s, v) => s + v.capacity, 0);
  return {
    simSeconds: state.simSeconds,
    arrivals: state.arrivals,
    boardings: state.boardings,
    completed: state.completed,
    waiting,
    onboard,
    vehicleKm,
    dieselKg,
    electricKg,
    operatingCostNtd: variableCost + laborCost,
    loadFactor: capacity ? onboard / capacity : 0,
    serviceRate: state.arrivals ? state.boardings / state.arrivals : 0,
    activeVehicles: activeVehicles.length,
  };
}

export function assertTwinInvariants(state: TwinState): void {
  const m = deriveTwinMetrics(state);
  if (state.queueByStop.some((q) => !Number.isInteger(q) || q < 0))
    throw new Error("Queue must be nonnegative integers.");
  if (
    state.vehicles.some(
      (v) =>
        v.occupancy < 0 ||
        v.occupancy > v.capacity ||
        v.progress < 0 ||
        v.progress > 1,
    )
  )
    throw new Error("Vehicle occupancy or route progress is out of bounds.");
  if (m.arrivals !== m.waiting + m.onboard + m.completed)
    throw new Error("Passenger conservation failed.");
  if (state.vehicles.some((v) => v.vehicleKm < 0) || m.vehicleKm < 0)
    throw new Error("Cumulative vehicle distance cannot be negative.");
}
