import { RIDER_CLASSES, type RiderClass } from "./classes.js";
import type { Penalty } from "./schemas/penalty.js";
import type { Punch } from "./schemas/punch.js";
import { defaultRace, type RaceLength, type StartRow } from "./schemas/race-package.js";
import type { StartTime } from "./schemas/start-time.js";
import type { ScoreRaceInput } from "./scoring/types.js";
import { SCHEMA_VERSION } from "./version.js";

export const EPOCH = "2026-06-14T14:00:00.000Z";

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function iso(offsetSeconds: number): string {
  return new Date(Date.parse(EPOCH) + offsetSeconds * 1000).toISOString();
}

export function isoMs(offsetMs: number): string {
  return new Date(Date.parse(EPOCH) + offsetMs).toISOString();
}

export interface TestRider {
  number: number;
  name: string;
  class: RiderClass;
  /** Null is a day-of entry with no series record. */
  seriesId?: string | null;
  /** Race-wide row number. Omit to leave the rider unassigned. */
  startRow?: number | null;
}

export function makePunch(args: {
  n: number;
  riderNumber: number;
  checkId: string;
  offsetSeconds?: number;
  timestamp?: string;
  voided?: boolean;
}): Punch {
  const timestamp = args.timestamp ?? iso(args.offsetSeconds ?? 0);
  return {
    schemaVersion: SCHEMA_VERSION,
    uuid: uuid(args.n),
    checkId: args.checkId,
    deviceId: "device-1",
    riderNumber: args.riderNumber,
    timestamp,
    createdAt: timestamp,
    voided: args.voided ?? false,
  };
}

export function makeStart(riderNumber: number, offsetSeconds = 0): StartTime {
  return {
    schemaVersion: SCHEMA_VERSION,
    riderNumber,
    startedAt: iso(offsetSeconds),
  };
}

export function makePenalty(args: {
  n: number;
  riderNumber: number;
  seconds: number;
  scope: Penalty["scope"];
}): Penalty {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uuid(args.n),
    riderNumber: args.riderNumber,
    seconds: args.seconds,
    scope: args.scope,
    appliedBy: "race_director",
    reason: "Test penalty",
    createdAt: iso(0),
  };
}

const DEFAULT_CHECKS = [
  { id: "cp1", order: 1, name: "CP1" },
  { id: "cp2", order: 2, name: "CP2" },
  { id: "cp3", order: 3, name: "CP3" },
  { id: "cp4", order: 4, name: "CP4" },
];

export function makeScoreInput(
  args: {
    riders?: TestRider[];
    timeLimitMinutes?: number;
    length?: RaceLength;
    startRows?: StartRow[];
    rowGapSeconds?: number;
    plannedStart?: string | null;
    checks?: Array<{ id: string; order: number; name: string }>;
    punches?: Punch[];
    startTimes?: StartTime[];
    penalties?: Penalty[];
    disqualifications?: ScoreRaceInput["disqualifications"];
  } = {},
): ScoreRaceInput {
  const seriesRiders = [];
  const registrations = [];
  for (const rider of args.riders ?? []) {
    const seriesId = rider.seriesId === undefined ? `s-${rider.number}` : rider.seriesId;
    if (seriesId !== null) {
      seriesRiders.push({
        seriesId,
        name: rider.name,
        number: rider.number,
        class: rider.class,
      });
    }
    registrations.push({
      riderNumber: rider.number,
      name: rider.name,
      class: rider.class,
      seriesId,
      startRow: rider.startRow ?? null,
    });
  }

  const event = {
    id: "test-event",
    name: "Test Event",
    date: "2026-06-14",
    length: args.length ?? {
      mode: "time" as const,
      minutes: args.timeLimitMinutes ?? 180,
    },
    checks: args.checks ?? DEFAULT_CHECKS,
  };
  const race = defaultRace(event);
  if (args.startRows) race.startRows = args.startRows;
  if (args.rowGapSeconds !== undefined) race.rowGapSeconds = args.rowGapSeconds;
  if (args.plannedStart !== undefined) race.plannedStart = args.plannedStart;

  return {
    schemaVersion: SCHEMA_VERSION,
    resultsVersion: 3,
    resultsStatus: "provisional",
    publishedAt: "2026-06-14T20:00:00.000Z",
    race: {
      schemaVersion: SCHEMA_VERSION,
      classes: [...RIDER_CLASSES],
      event,
      races: [race],
      riders: seriesRiders,
      registrations,
    },
    punches: args.punches ?? [],
    startTimes: args.startTimes ?? [],
    penalties: args.penalties ?? [],
    disqualifications: args.disqualifications ?? [],
  };
}
