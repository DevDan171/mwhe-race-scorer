import type { Punch } from "../schemas/punch.js";
import { punchSchema } from "../schemas/punch.js";

/** Phone clock minus laptop clock. Positive means the phone is ahead. */
export function clockOffsetMs(deviceNow: string, laptopNow: string): number {
  const device = Date.parse(deviceNow);
  const laptop = Date.parse(laptopNow);
  if (Number.isNaN(device) || Number.isNaN(laptop)) {
    throw new Error("Clock offset needs two timestamps.");
  }
  return device - laptop;
}

/** `+1.2 s` when the phone is ahead, `-0.4 s` when it is behind. */
export function formatClockOffset(offsetMs: number): string {
  const sign = offsetMs > 0 ? "+" : offsetMs < 0 ? "-" : "";
  return `${sign}${(Math.abs(offsetMs) / 1000).toFixed(1)} s`;
}

/**
 * Warn when the absolute offset reaches the threshold. A null offset means
 * the phone has not been compared to the laptop yet, so there is nothing to warn about.
 */
export function clockOffsetWarning(
  offsetMs: number | null | undefined,
  thresholdMs: number,
): string | null {
  if (offsetMs == null || Math.abs(offsetMs) < thresholdMs) return null;
  const direction = offsetMs > 0 ? "ahead of" : "behind";
  return `Phone clock is ${formatClockOffset(offsetMs)} ${direction} the laptop.`;
}

export function worstClockOffset(
  values: readonly (number | null | undefined)[],
): number | null {
  let worst: number | null = null;
  for (const value of values) {
    if (value == null) continue;
    if (worst == null || Math.abs(value) > Math.abs(worst)) worst = value;
  }
  return worst;
}

/**
 * App versions must match before a phone goes live. A leading `v` is ignored.
 * `0.3.0` does not match `0.3.1` or `0.3.0-rc.1`.
 */
export function versionsMatch(hubVersion: string, stationVersion: string): boolean {
  return normalizeAppVersion(hubVersion) === normalizeAppVersion(stationVersion);
}

export function normalizeAppVersion(version: string): string {
  return version.trim().replace(/^v(?=\d)/, "");
}

export interface PunchMerge {
  punches: Punch[];
  accepted: number;
  duplicates: number;
  voidsApplied: number;
}

/**
 * UUID is the identity. A void wins even when it arrives before the original
 * or long after it. A second non-void copy is a duplicate and is not stored.
 */
export function mergePunches(
  existing: readonly Punch[],
  incoming: readonly Punch[],
): PunchMerge {
  const punches = existing.map((punch) => punchSchema.parse(punch));
  const index = new Map(punches.map((punch, position) => [punch.uuid, position]));
  let accepted = 0;
  let duplicates = 0;
  let voidsApplied = 0;

  for (const raw of incoming) {
    const punch = punchSchema.parse(raw);
    const at = index.get(punch.uuid);
    if (at === undefined) {
      punches.push(punch);
      index.set(punch.uuid, punches.length - 1);
      accepted += 1;
      continue;
    }
    const stored = punches[at];
    if (!stored) continue;
    if (punch.voided && !stored.voided) {
      punches[at] = { ...stored, voided: true };
      voidsApplied += 1;
      continue;
    }
    duplicates += 1;
  }

  return { punches, accepted, duplicates, voidsApplied };
}

/**
 * The latest non-voided punch of this number at this check inside the window.
 * A window of zero or less turns the warning off.
 */
export function findDoubleTap(
  punches: readonly Punch[],
  input: { riderNumber: number; checkId: string; atMs: number; windowMs: number },
): Punch | null {
  if (input.windowMs <= 0) return null;
  let latest: Punch | null = null;
  for (const punch of punches) {
    if (punch.voided) continue;
    if (punch.riderNumber !== input.riderNumber || punch.checkId !== input.checkId)
      continue;
    const at = Date.parse(punch.timestamp);
    if (Number.isNaN(at)) continue;
    if (Math.abs(input.atMs - at) > input.windowMs) continue;
    if (!latest || Date.parse(latest.timestamp) <= at) latest = punch;
  }
  return latest;
}

export function isUnknownRiderNumber(
  numbers: readonly number[],
  riderNumber: number,
): boolean {
  return !numbers.includes(riderNumber);
}
