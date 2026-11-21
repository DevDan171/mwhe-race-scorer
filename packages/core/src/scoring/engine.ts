import { primaryRace, type Check } from "../schemas/race-package.js";
import type { Disqualification, Penalty } from "../schemas/penalty.js";
import type { Punch } from "../schemas/punch.js";
import type { RiderStart, RowStart } from "../schemas/starts.js";
import type {
  CheckResult,
  ResultRow,
  ResultStatus,
  ResultsPayload,
} from "../schemas/results.js";
import { resultsPayloadSchema } from "../schemas/results.js";
import type { StartTime } from "../schemas/start-time.js";
import { PROTEST_WINDOW_MINUTES, SCHEMA_VERSION } from "../version.js";
import { multiLapCount } from "./end-mode.js";
import { assignLapPasses } from "./laps.js";
import {
  dedupeRiderStarts,
  dedupeRowStarts,
  riderClockFromTaps,
  rowClockFromTaps,
} from "./start-capture.js";
import { planStartOrder } from "./start-order.js";
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
  const course = primaryRace(parsed.race.races);
  const plan = planStartOrder(course, parsed.race.registrations);
  warnings.push(...plan.warnings);
  const rowStarts = dedupeRowStarts(parsed.rowStarts);
  const riderStarts = dedupeRiderStarts(parsed.riderStarts);
  warnDuplicateStarts(rowStarts, riderStarts, warnings);
  const derivedStarts = new Map<number, string>();
  for (const row of plan.rows) {
    const tapped = rowClockFromTaps(row.rowNumber, rowStarts);
    const startedAt = tapped?.startedAt ?? row.startedAt;
    if (!startedAt) continue;
    for (const rider of row.riders) derivedStarts.set(rider.riderNumber, startedAt);
  }
  const timeLimitMinutes = course.length.mode === "time" ? course.length.minutes : null;
  const lapCount = multiLapCount(course.length);
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
        start: startForRider(
          riderNumber,
          starts,
          derivedStarts,
          riderClockFromTaps(riderNumber, riderStarts)?.startedAt,
        ),
        disqualification: disqualifications.get(riderNumber),
        checksById,
        timeLimitMinutes,
        lapCount,
        minPassGapMs: parsed.minPassGapMs,
        courseOrder: [...course.checks].sort((a, b) => a.order - b.order),
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

/**
 * A start entered on the laptop wins. Otherwise the rider uses their row's
 * clock, which is null until the race has a planned start.
 */
function startForRider(
  riderNumber: number,
  starts: Map<number, StartTime>,
  derivedStarts: Map<number, string>,
  riderStartAt: string | undefined,
): StartTime | undefined {
  const explicit = starts.get(riderNumber);
  if (explicit) return explicit;
  if (riderStartAt) {
    return {
      schemaVersion: SCHEMA_VERSION,
      riderNumber,
      startedAt: riderStartAt,
    };
  }
  const derived = derivedStarts.get(riderNumber);
  if (!derived) return undefined;
  return {
    schemaVersion: SCHEMA_VERSION,
    riderNumber,
    startedAt: derived,
  };
}

function warnDuplicateStarts(
  rowStarts: readonly RowStart[],
  riderStarts: readonly RiderStart[],
  warnings: ScoringWarning[],
): void {
  const rows = new Set<number>();
  for (const tap of rowStarts) {
    if (tap.voided) continue;
    const pool = rowStarts.filter(
      (item) =>
        !item.voided &&
        item.row === tap.row &&
        (item.source === "laptop") === (tap.source === "laptop"),
    );
    if (pool.length > 1 && !rows.has(tap.row)) {
      rows.add(tap.row);
      warnings.push({ code: "duplicate_row_start", row: tap.row });
    }
  }
  const riders = new Set<number>();
  for (const tap of riderStarts) {
    if (tap.voided) continue;
    if (
      riderStarts.filter((item) => !item.voided && item.riderNumber === tap.riderNumber)
        .length > 1
    ) {
      if (!riders.has(tap.riderNumber)) {
        riders.add(tap.riderNumber);
        warnings.push({ code: "duplicate_rider_start", riderNumber: tap.riderNumber });
      }
    }
  }
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
  /** Null on a lap race. There is no clock, including when laps were left blank. */
  timeLimitMinutes: number | null;
  /** Set only when the race scores more than one lap. */
  lapCount: number | null;
  minPassGapMs: number;
  courseOrder: readonly Check[];
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
  // A timed race counts the limit from this rider's own start, which is
  // their row's clock unless the laptop entered a different one.
  const limitMs =
    args.timeLimitMinutes === null
      ? Number.POSITIVE_INFINITY
      : startMs + args.timeLimitMinutes * 60_000;
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

  if (args.lapCount !== null && args.lapCount > 1) {
    return scoreLapRider(args, known, startMs);
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

function scoreLapRider(
  args: ScoreRiderArgs,
  known: Array<{ punch: Punch; timestampMs: number }>,
  startMs: number,
): ScoredRider {
  const passes = assignLapPasses({
    hits: known,
    course: args.courseOrder,
    lapCount: args.lapCount ?? 1,
    minGapMs: args.minPassGapMs,
  });
  for (const pass of passes) {
    if (pass.reason === "too_soon") {
      args.warnings.push({
        code: "pass_too_soon",
        riderNumber: args.riderNumber,
        uuid: pass.punch.uuid,
        checkId: pass.punch.checkId,
      });
    }
    if (pass.reason === "out_of_order") {
      args.warnings.push({
        code: "pass_out_of_order",
        riderNumber: args.riderNumber,
        uuid: pass.punch.uuid,
        checkId: pass.punch.checkId,
      });
    }
  }
  const perCheck = new Map<
    string,
    { scoringMs: number | null; overLimitMs: number | null }
  >();
  for (const pass of passes) {
    const current = perCheck.get(pass.punch.checkId) ?? {
      scoringMs: null,
      overLimitMs: null,
    };
    if (pass.counts && current.scoringMs === null) current.scoringMs = pass.timestampMs;
    if (!pass.counts && current.overLimitMs === null)
      current.overLimitMs = pass.timestampMs;
    perCheck.set(pass.punch.checkId, current);
  }
  const penalty = summarizePenalties(args, perCheck);
  const penaltyUsed = new Set<string>();
  const lastCountedByLap = new Map<number, number>();
  const checkResults: CheckResult[] = [];
  let lastPunchMs: number | null = null;
  let scoringChecks = 0;
  for (const pass of passes) {
    const check = args.checksById.get(pass.punch.checkId);
    if (!check) continue;
    if (pass.counts) {
      scoringChecks += 1;
      if (lastPunchMs === null || pass.timestampMs > lastPunchMs)
        lastPunchMs = pass.timestampMs;
    }
    const previous = lastCountedByLap.get(pass.lap);
    const cumulativeSeconds = secondsBetween(pass.timestampMs, startMs);
    const segmentSeconds =
      pass.counts && previous !== undefined
        ? secondsBetween(pass.timestampMs, previous)
        : pass.counts
          ? cumulativeSeconds
          : 0;
    if (pass.counts) lastCountedByLap.set(pass.lap, pass.timestampMs);
    const showPenalty = pass.counts && !penaltyUsed.has(pass.punch.checkId);
    if (showPenalty) penaltyUsed.add(pass.punch.checkId);
    checkResults.push({
      checkId: pass.punch.checkId,
      name: check.name,
      order: check.order,
      cumulativeSeconds,
      segmentSeconds,
      overLimit: false,
      countsForScore: pass.counts,
      penaltySeconds: showPenalty ? (penalty.byCheck.get(pass.punch.checkId) ?? 0) : 0,
      lap: pass.lap,
      ...(pass.reason ? { unscoredReason: pass.reason } : {}),
    });
  }
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
      name: args.registration?.name ?? "UNKNOWN",
      number: args.riderNumber,
      class: args.registration?.class ?? null,
      unknown: args.registration === undefined,
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
