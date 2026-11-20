import type { Punch } from "../schemas/punch.js";

export type UnscoredReason = "too_soon" | "out_of_order" | "after_lap_count";

export interface AssignedPass {
  punch: Punch;
  timestampMs: number;
  /** Lap the rider was on when this pass was seen. */
  lap: number;
  counts: boolean;
  reason: UnscoredReason | null;
}

/**
 * Walk punches in time order and assign them to laps.
 * Lap 1 is check 1 through the finish, then lap 2, and so on.
 * A pass that skips ahead or comes back early is kept and flagged.
 * A repeat of the same check inside `minGapMs` of the last counted
 * pass of that check is kept and flagged. Neither one counts.
 * After the lap count is finished, later passes are kept and not scored.
 */
export function assignLapPasses(args: {
  hits: readonly { punch: Punch; timestampMs: number }[];
  course: readonly { id: string }[];
  lapCount: number;
  minGapMs: number;
}): AssignedPass[] {
  const sorted = [...args.hits].sort(
    (a, b) => a.timestampMs - b.timestampMs || a.punch.uuid.localeCompare(b.punch.uuid),
  );
  const indexOf = new Map(args.course.map((check, index) => [check.id, index]));
  const lastCounted = new Map<string, number>();
  let lap = 1;
  let nextIndex = 0;
  const passes: AssignedPass[] = [];

  for (const hit of sorted) {
    const index = indexOf.get(hit.punch.checkId);
    if (index === undefined) continue;
    const previous = lastCounted.get(hit.punch.checkId);
    if (
      previous !== undefined &&
      args.minGapMs > 0 &&
      hit.timestampMs - previous < args.minGapMs
    ) {
      passes.push({
        punch: hit.punch,
        timestampMs: hit.timestampMs,
        lap,
        counts: false,
        reason: "too_soon",
      });
      continue;
    }
    if (lap > args.lapCount) {
      passes.push({
        punch: hit.punch,
        timestampMs: hit.timestampMs,
        lap: args.lapCount,
        counts: false,
        reason: "after_lap_count",
      });
      continue;
    }
    if (index !== nextIndex) {
      passes.push({
        punch: hit.punch,
        timestampMs: hit.timestampMs,
        lap,
        counts: false,
        reason: "out_of_order",
      });
      continue;
    }
    passes.push({
      punch: hit.punch,
      timestampMs: hit.timestampMs,
      lap,
      counts: true,
      reason: null,
    });
    lastCounted.set(hit.punch.checkId, hit.timestampMs);
    if (index === args.course.length - 1) {
      lap += 1;
      nextIndex = 0;
    } else {
      nextIndex += 1;
    }
  }

  return passes;
}
