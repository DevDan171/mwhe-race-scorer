import type { RiderClass } from "../classes.js";
import { RIDER_CLASSES } from "../classes.js";
import type { ResultStatus } from "../schemas/results.js";

/**
 * Class points. P1 25, P2 22, P3 20, P4 18, P5 16, P6 15, then one less
 * per place through P20 = 1. P21 and later score 0.
 */
export function pointsForPlace(place: number): number {
  if (!Number.isInteger(place) || place < 1) return 0;
  if (place === 1) return 25;
  if (place === 2) return 22;
  if (place === 3) return 20;
  if (place === 4) return 18;
  if (place === 5) return 16;
  if (place === 6) return 15;
  if (place <= 20) return 15 - (place - 6);
  return 0;
}

export function pointsForResult(result: {
  status: ResultStatus;
  positionInClass: number | null;
}): number {
  if (result.status !== "finished" || result.positionInClass === null) return 0;
  return pointsForPlace(result.positionInClass);
}

export interface SeriesEventResult {
  eventId: string;
  /** `YYYY-MM-DD`. Newer dates outrank older ones when points are tied. */
  date: string;
  riderNumber: number;
  class: RiderClass | null;
  positionInClass: number | null;
  status: ResultStatus;
}

export interface SeriesStanding {
  riderNumber: number;
  class: RiderClass;
  points: number;
  rank: number;
}

export interface ClassStandings {
  class: RiderClass;
  rows: SeriesStanding[];
  /**
   * True when a points tie had to look past the most recent event because
   * neither rider had a classified finish there. That fallback is still an
   * open decision. See `rankSeries`.
   */
  usedOpenTieBreakFallback: boolean;
}

interface Finish {
  position: number;
}

interface Accumulator {
  riderNumber: number;
  class: RiderClass;
  points: number;
  finishes: Map<string, Finish | "none">;
}

/**
 * Sum class points across events and rank within each class.
 *
 * A points tie is broken by the better classified finish at the most recent
 * event. A classified finish beats no finish. DNF, DQ, and "not in the
 * event" are all "no finish".
 *
 * TODO(series-points-tiebreak): The owner has not decided what to do when
 * neither rider raced the most recent event (including both DNF / DQ /
 * absent — whether those should be treated differently is part of the open
 * question). Fallback used here: walk back through older events with the
 * same rule. If every event is still tied, the lower rider number ranks
 * higher. `usedOpenTieBreakFallback` is set when a tie actually takes that
 * path.
 */
export function rankSeries(events: readonly SeriesEventResult[]): ClassStandings[] {
  const eventOrder = uniqueEventsNewestFirst(events);
  const riders = new Map<string, Accumulator>();

  for (const result of events) {
    if (result.class === null) continue;
    const key = `${result.class}:${result.riderNumber}`;
    const accumulator = riders.get(key) ?? {
      riderNumber: result.riderNumber,
      class: result.class,
      points: 0,
      finishes: new Map<string, Finish | "none">(),
    };
    accumulator.points += pointsForResult(result);
    const finish: Finish | "none" =
      result.status === "finished" && result.positionInClass !== null
        ? { position: result.positionInClass }
        : "none";
    const previous = accumulator.finishes.get(result.eventId);
    if (previous === undefined || previous === "none") {
      accumulator.finishes.set(result.eventId, finish);
    }
    riders.set(key, accumulator);
  }

  return RIDER_CLASSES.flatMap((riderClass) => {
    const group = [...riders.values()].filter((rider) => rider.class === riderClass);
    if (group.length === 0) return [];
    group.sort((a, b) => compareStandings(a, b, eventOrder));
    return [
      {
        class: riderClass,
        usedOpenTieBreakFallback: tieUsedOpenFallback(group, eventOrder),
        rows: group.map((rider, index) => ({
          riderNumber: rider.riderNumber,
          class: rider.class,
          points: rider.points,
          rank: index + 1,
        })),
      },
    ];
  });
}

function compareStandings(
  a: Accumulator,
  b: Accumulator,
  eventOrder: readonly string[],
): number {
  if (a.points !== b.points) return b.points - a.points;
  for (const eventId of eventOrder) {
    const compared = compareFinish(a.finishes.get(eventId), b.finishes.get(eventId));
    if (compared !== 0) return compared;
  }
  return a.riderNumber - b.riderNumber;
}

/**
 * The open fallback was used when two riders on equal points have no
 * classified finish at the newest event, so ranking had to look further
 * back (or fall through to rider number).
 */
function tieUsedOpenFallback(
  group: readonly Accumulator[],
  eventOrder: readonly string[],
): boolean {
  const latest = eventOrder[0];
  if (latest === undefined) return false;
  for (let index = 0; index < group.length - 1; index += 1) {
    const left = group[index];
    const right = group[index + 1];
    if (left === undefined || right === undefined) continue;
    if (left.points !== right.points) continue;
    if (!hasFinish(left.finishes.get(latest)) && !hasFinish(right.finishes.get(latest))) {
      return true;
    }
  }
  return false;
}

function hasFinish(finish: Finish | "none" | undefined): finish is Finish {
  return finish !== undefined && finish !== "none";
}

function compareFinish(
  a: Finish | "none" | undefined,
  b: Finish | "none" | undefined,
): number {
  const aPosition = hasFinish(a) ? a.position : null;
  const bPosition = hasFinish(b) ? b.position : null;
  if (aPosition !== null && bPosition !== null) return aPosition - bPosition;
  if (aPosition !== null) return -1;
  if (bPosition !== null) return 1;
  return 0;
}

function uniqueEventsNewestFirst(events: readonly SeriesEventResult[]): string[] {
  const meta = new Map<string, { date: string; eventId: string }>();
  for (const event of events) {
    meta.set(event.eventId, { date: event.date, eventId: event.eventId });
  }
  return [...meta.values()]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      // Same calendar day: smaller event id is treated as more recent so the
      // order stays stable. This is not a series rule.
      return a.eventId < b.eventId ? -1 : 1;
    })
    .map((event) => event.eventId);
}
