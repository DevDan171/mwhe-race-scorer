import type { RaceLength } from "../schemas/race-package.js";

/**
 * A race needs either a lap count or a time limit. `laps: null` is neither:
 * the package says the race runs until the finish and does not say how many
 * laps that is.
 */
export function raceEndWarning(length: RaceLength): string | null {
  if (length.mode === "laps" && length.laps === null) {
    return "This race has no lap count and no time limit. Pick one before the start.";
  }
  return null;
}

/** More than one lap uses pass-by-pass scoring. One lap and timed races do not. */
export function multiLapCount(length: RaceLength): number | null {
  if (length.mode === "laps" && length.laps !== null && length.laps > 1)
    return length.laps;
  return null;
}
