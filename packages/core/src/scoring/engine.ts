import type { Check } from "../schemas/race-package.js";
import type { Disqualification, Penalty } from "../schemas/penalty.js";
import type { Punch } from "../schemas/punch.js";
import type {
  CheckResult,
  ResultRow,
  ResultStatus,
  ResultsPayload,
} from "../schemas/results.js";
import { resultsPayloadSchema } from "../schemas/results.js";
import type { StartTime } from "../schemas/start-time.js";
import { PROTEST_WINDOW_MINUTES, SCHEMA_VERSION } from "../version.js";
import { parseIsoMs, secondsBetween } from "./time.js";
import {
  scoreRaceInputSchema,
  type ScoreRaceInput,
  type ScoringWarning,
} from "./types.js";

/**
 * Scoring rules live in docs/scoring-rules.md. In short:
 * dedupe by uuid (any voided copy drops the punch), ignore voided punches,
 * count distinct in-limit checks, total time is the latest in-limit punch
 * minus the start plus every penalty, and rank by checks then time.
 * There are no ties: earlier last punch, then lower rider number.
 */

export interface ScoreRaceResult {
  payload: ResultsPayload;
  warnings: ScoringWarning[];
}

interface ScoredRider {
  row: ResultRow;
  totalTimeMs: number | null;
  lastPunchMs: number | null;
}

export function scoreRace(input: ScoreRaceInput): ScoreRaceResult {
  const parsed = scoreRaceInputSchema.parse(input);
  const warnings: ScoringWarning[] = [];
  const checksById = new Map(parsed.race.event.checks.map((check) => [check.id, check]));
  const starts = resolveStarts(parsed.startTimes, warnings);
  const disqualifications = resolveDisqualifications(parsed.disqualifications, warnings);
  const punches = dedupePunches(parsed.punches, warnings);
  const punchesByRider = groupBy(punches, (punch) => punch.riderNumber);
  const penaltiesByRider = groupBy(parsed.penalties, (penalty) => penalty.riderNumber);
  const registered = new Map(
    parsed.race.registrations.map((registration) => [
      registration.riderNumber,
      registration,
    ]),
  );

  const riderNumbers = new Set<number>([...registered.keys(), ...punchesByRider.keys()]);
  for (const riderNumber of disqualifications.keys()) {
    riderNumbers.add(riderNumber);
  }

  const scored: ScoredRider[] = [...riderNumbers]
    .sort((a, b) => a - b)
    .map((riderNumber) =>
      scoreRider({
        riderNumber,
        registration: registered.get(riderNumber),
        punches: punchesByRider.get(riderNumber) ?? [],
        penalties: penaltiesByRider.get(riderNumber) ?? [],
        start: starts.get(riderNumber),
        disqualification: disqualifications.get(riderNumber),
        checksById,
        timeLimitMinutes: parsed.race.event.timeLimitMinutes,
        warnings,
      }),
    );

  assignPositions(scored);

  const rows = scored
    .map((entry) => entry.row)
    .sort((a, b) => {
      if (a.positionOverall === null && b.positionOverall === null) {
        return a.number - b.number;
      }
      if (a.positionOverall === null) return 1;
      if (b.positionOverall === null) return -1;
      return a.positionOverall - b.positionOverall;
    });

  const payload = resultsPayloadSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    eventId: parsed.race.event.id,
    version: parsed.resultsVersion,
    status: parsed.resultsStatus,
    publishedAt: parsed.publishedAt,
    protestWindowMinutes: PROTEST_WINDOW_MINUTES,
    rows,
  });

  return { payload, warnings };
}

function resolveStarts(
  startTimes: readonly StartTime[],
  warnings: ScoringWarning[],
): Map<number, StartTime> {
  const starts = new Map<number, StartTime>();
  for (const start of startTimes) {
    if (starts.has(start.riderNumber)) {
      warnings.push({ code: "duplicate_start_time", riderNumber: start.riderNumber });
    }
    starts.set(start.riderNumber, start);
  }
  return starts;
}

function resolveDisqualifications(
  disqualifications: readonly Disqualification[],
  warnings: ScoringWarning[],
): Map<number, Disqualification> {
  const byRider = new Map<number, Disqualification>();
  for (const disqualification of disqualifications) {
    if (byRider.has(disqualification.riderNumber)) {
      warnings.push({
        code: "duplicate_disqualification",
        riderNumber: disqualification.riderNumber,
      });
    }
    byRider.set(disqualification.riderNumber, disqualification);
  }
  return byRider;
}

/**
 * UUID is the punch identity. If any synced copy is voided, the punch is
 * voided, so an undo still wins when an older copy arrives later. Otherwise
 * the first copy is kept.
 */
function dedupePunches(punches: readonly Punch[], warnings: ScoringWarning[]): Punch[] {
  const first = new Map<string, Punch>();
  const voided = new Set<string>();
  for (const punch of punches) {
    if (first.has(punch.uuid)) {
      warnings.push({ code: "duplicate_punch_uuid", uuid: punch.uuid });
    } else {
      first.set(punch.uuid, punch);
    }
    if (punch.voided) voided.add(punch.uuid);
  }
  return [...first.values()].filter((punch) => !punch.voided && !voided.has(punch.uuid));
}

interface ScoreRiderArgs {
  riderNumber: number;
  registration:
    | {
        name: string;
        class: ResultRow["class"];
      }
    | undefined;
  punches: readonly Punch[];
  penalties: readonly Penalty[];
  start: StartTime | undefined;
  disqualification: Disqualification | undefined;
  checksById: Map<string, Check>;
  timeLimitMinutes: number;
  warnings: ScoringWarning[];
}

function scoreRider(args: ScoreRiderArgs): ScoredRider {
  const unknown = args.registration === undefined;
  const name = args.registration?.name ?? "UNKNOWN";
  const riderClass = args.registration?.class ?? null;
  if (args.disqualification && unknown) {
    args.warnings.push({
      code: "disqualification_unknown_rider",
      riderNumber: args.riderNumber,
    });
  }

  if (!args.start) {
    const livePunches = args.punches.filter((punch) => !punch.voided);
    if (livePunches.length > 0) {
      args.warnings.push({
        code: "missing_start_time",
        riderNumber: args.riderNumber,
        punchCount: livePunches.length,
      });
    }
    // No start means no elapsed time, so penalties are recorded but not
    // added into a total. The laptop has to enter a start before they count.
    const recorded = sumPenalties(args.penalties);
    return {
      row: {
        ...blankRow({
          name,
          number: args.riderNumber,
          riderClass,
          unknown,
          status: args.disqualification ? "DQ" : "DNF",
        }),
        penaltySeconds: recorded.totalSeconds,
        overallPenaltySeconds: recorded.overallSeconds,
      },
      totalTimeMs: null,
      lastPunchMs: null,
    };
  }

  const startMs = parseIsoMs(args.start.startedAt);
  const limitMs = startMs + args.timeLimitMinutes * 60_000;
  const known: Array<{ punch: Punch; timestampMs: number }> = [];

  for (const punch of args.punches) {
    if (punch.voided) continue;
    const timestampMs = parseIsoMs(punch.timestamp);
    if (timestampMs < startMs) {
      args.warnings.push({
        code: "punch_before_start",
        riderNumber: args.riderNumber,
        uuid: punch.uuid,
      });
      continue;
    }
    if (!args.checksById.has(punch.checkId)) {
      args.warnings.push({
        code: "unknown_check",
        riderNumber: args.riderNumber,
        checkId: punch.checkId,
        uuid: punch.uuid,
      });
      continue;
    }
    known.push({ punch, timestampMs });
  }

  const perCheck = new Map<
    string,
    { scoringMs: number | null; overLimitMs: number | null }
  >();
  let lastPunchMs: number | null = null;

  for (const hit of known) {
    const overLimit = hit.timestampMs > limitMs;
    const current = perCheck.get(hit.punch.checkId) ?? {
      scoringMs: null,
      overLimitMs: null,
    };
    if (overLimit) {
      if (current.overLimitMs === null || hit.timestampMs < current.overLimitMs) {
        current.overLimitMs = hit.timestampMs;
      }
    } else {
      if (current.scoringMs === null || hit.timestampMs < current.scoringMs) {
        current.scoringMs = hit.timestampMs;
      }
      if (lastPunchMs === null || hit.timestampMs > lastPunchMs) {
        lastPunchMs = hit.timestampMs;
      }
    }
    perCheck.set(hit.punch.checkId, current);
  }

  const penalty = summarizePenalties(args, perCheck);
  const checkResults = buildCheckResults({
    perCheck,
    checksById: args.checksById,
    startMs,
    penaltyByCheck: penalty.byCheck,
  });
  const scoringChecks = checkResults.filter((check) => check.countsForScore).length;
  const elapsedMs = lastPunchMs === null ? null : lastPunchMs - startMs;
  const totalTimeMs = elapsedMs === null ? null : elapsedMs + penalty.totalSeconds * 1000;
  const status: ResultStatus = args.disqualification
    ? "DQ"
    : scoringChecks === 0
      ? "DNF"
      : "finished";

  return {
    totalTimeMs,
    lastPunchMs,
    row: {
      name,
      number: args.riderNumber,
      class: riderClass,
      unknown,
      checks: scoringChecks,
      elapsedSeconds:
        elapsedMs === null ? null : secondsBetween(startMs + elapsedMs, startMs),
      penaltySeconds: penalty.totalSeconds,
      overallPenaltySeconds: penalty.overallSeconds,
      totalTimeSeconds: totalTimeMs === null ? null : totalTimeMs / 1000,
      checkResults,
      positionInClass: null,
      positionOverall: null,
      status,
    },
  };
}

function sumPenalties(penalties: readonly Penalty[]): {
  totalSeconds: number;
  overallSeconds: number;
} {
  let totalSeconds = 0;
  let overallSeconds = 0;
  for (const penalty of penalties) {
    totalSeconds += penalty.seconds;
    if (penalty.scope.type === "overall") overallSeconds += penalty.seconds;
  }
  return { totalSeconds, overallSeconds };
}

function summarizePenalties(
  args: ScoreRiderArgs,
  perCheck: Map<string, { scoringMs: number | null; overLimitMs: number | null }>,
): { totalSeconds: number; overallSeconds: number; byCheck: Map<string, number> } {
  let totalSeconds = 0;
  let overallSeconds = 0;
  const byCheck = new Map<string, number>();

  for (const penalty of args.penalties) {
    totalSeconds += penalty.seconds;
    if (penalty.scope.type === "overall") {
      overallSeconds += penalty.seconds;
      continue;
    }
    const checkId = penalty.scope.checkId;
    if (!args.checksById.has(checkId)) {
      args.warnings.push({
        code: "unknown_check_penalty",
        riderNumber: args.riderNumber,
        penaltyId: penalty.id,
        checkId,
      });
      continue;
    }
    byCheck.set(checkId, (byCheck.get(checkId) ?? 0) + penalty.seconds);
    const punched = perCheck.get(checkId);
    const reached =
      punched !== undefined &&
      (punched.scoringMs !== null || punched.overLimitMs !== null);
    if (!reached) {
      args.warnings.push({
        code: "penalty_without_punch",
        riderNumber: args.riderNumber,
        penaltyId: penalty.id,
        checkId,
      });
    }
  }

  return { totalSeconds, overallSeconds, byCheck };
}

function buildCheckResults(args: {
  perCheck: Map<string, { scoringMs: number | null; overLimitMs: number | null }>;
  checksById: Map<string, Check>;
  startMs: number;
  penaltyByCheck: Map<string, number>;
}): CheckResult[] {
  const rows: CheckResult[] = [];
  for (const [checkId, times] of args.perCheck) {
    const check = args.checksById.get(checkId);
    if (!check) continue;
    const countsForScore = times.scoringMs !== null;
    const stamp = countsForScore ? times.scoringMs : times.overLimitMs;
    if (stamp === null) continue;
    rows.push({
      checkId,
      name: check.name,
      order: check.order,
      cumulativeSeconds: secondsBetween(stamp, args.startMs),
      segmentSeconds: 0,
      overLimit: !countsForScore,
      countsForScore,
      penaltySeconds: args.penaltyByCheck.get(checkId) ?? 0,
    });
  }

  rows.sort((a, b) => a.order - b.order);
  let previousCumulative: number | null = null;
  for (const row of rows) {
    row.segmentSeconds =
      previousCumulative === null
        ? row.cumulativeSeconds
        : row.cumulativeSeconds - previousCumulative;
    previousCumulative = row.cumulativeSeconds;
  }
  return rows;
}

function blankRow(args: {
  name: string;
  number: number;
  riderClass: ResultRow["class"];
  unknown: boolean;
  status: ResultStatus;
}): ResultRow {
  return {
    name: args.name,
    number: args.number,
    class: args.riderClass,
    unknown: args.unknown,
    checks: 0,
    elapsedSeconds: null,
    penaltySeconds: 0,
    overallPenaltySeconds: 0,
    totalTimeSeconds: null,
    checkResults: [],
    positionInClass: null,
    positionOverall: null,
    status: args.status,
  };
}

/**
 * More checks, then lower total time, then earlier last punch, then lower
 * rider number. DQ is listed but not ranked. DNF (zero scoring checks) sorts
 * after anyone with a time.
 */
function compareRank(a: ScoredRider, b: ScoredRider): number {
  if (a.row.checks !== b.row.checks) return b.row.checks - a.row.checks;
  if (a.totalTimeMs !== b.totalTimeMs) {
    if (a.totalTimeMs === null) return 1;
    if (b.totalTimeMs === null) return -1;
    return a.totalTimeMs - b.totalTimeMs;
  }
  if (a.lastPunchMs !== b.lastPunchMs) {
    if (a.lastPunchMs === null) return 1;
    if (b.lastPunchMs === null) return -1;
    return a.lastPunchMs - b.lastPunchMs;
  }
  return a.row.number - b.row.number;
}

function assignPositions(scored: ScoredRider[]): void {
  const rankable = scored.filter((entry) => entry.row.status !== "DQ");
  rankable.sort(compareRank);
  rankable.forEach((entry, index) => {
    entry.row.positionOverall = index + 1;
  });

  const byClass = new Map<string, ScoredRider[]>();
  for (const entry of rankable) {
    if (entry.row.class === null) continue;
    const group = byClass.get(entry.row.class) ?? [];
    group.push(entry);
    byClass.set(entry.row.class, group);
  }
  for (const group of byClass.values()) {
    group.sort(compareRank);
    group.forEach((entry, index) => {
      entry.row.positionInClass = index + 1;
    });
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const id = key(item);
    const group = groups.get(id) ?? [];
    group.push(item);
    groups.set(id, group);
  }
  return groups;
}
