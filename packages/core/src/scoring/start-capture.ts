import type { RiderStart, RowStart } from "../schemas/starts.js";
import { riderStartSchema, rowStartSchema } from "../schemas/starts.js";

interface Capture {
  uuid: string;
  voided: boolean;
}

/** Any voided copy wins. The first non-void body is kept, then marked voided. */
export function dedupeCaptures<T extends Capture>(items: readonly T[]): T[] {
  const first = new Map<string, T>();
  const voided = new Set<string>();
  for (const item of items) {
    if (!first.has(item.uuid)) first.set(item.uuid, item);
    if (item.voided) voided.add(item.uuid);
  }
  return [...first.values()].map((item) =>
    voided.has(item.uuid) ? { ...item, voided: true } : item,
  );
}

export function dedupeRowStarts(items: readonly RowStart[]): RowStart[] {
  return dedupeCaptures(items.map((item) => rowStartSchema.parse(item)));
}

export function dedupeRiderStarts(items: readonly RiderStart[]): RiderStart[] {
  return dedupeCaptures(items.map((item) => riderStartSchema.parse(item)));
}

/**
 * The row clock from a "Row N go" tap. A laptop edit of that row beats a
 * station tap. Otherwise the latest live tap wins. More than one live tap
 * from the same source is reported so the caller can warn.
 */
export function rowClockFromTaps(
  row: number,
  taps: readonly RowStart[],
): { startedAt: string; duplicate: boolean } | null {
  const live = taps.filter((tap) => !tap.voided && tap.row === row);
  const laptop = live.filter((tap) => tap.source === "laptop");
  const pool = laptop.length > 0 ? laptop : live;
  if (pool.length === 0) return null;
  const latest = [...pool].sort(byTime).at(-1);
  if (!latest) return null;
  return { startedAt: latest.timestamp, duplicate: pool.length > 1 };
}

/** Latest live individual start for this rider. */
export function riderClockFromTaps(
  riderNumber: number,
  taps: readonly RiderStart[],
): { startedAt: string; duplicate: boolean } | null {
  const live = taps.filter((tap) => !tap.voided && tap.riderNumber === riderNumber);
  if (live.length === 0) return null;
  const latest = [...live].sort(byTime).at(-1);
  if (!latest) return null;
  return { startedAt: latest.timestamp, duplicate: live.length > 1 };
}

function byTime(
  a: { timestamp: string; createdAt: string },
  b: { timestamp: string; createdAt: string },
): number {
  const stamp = a.timestamp.localeCompare(b.timestamp);
  if (stamp !== 0) return stamp;
  return a.createdAt.localeCompare(b.createdAt);
}
