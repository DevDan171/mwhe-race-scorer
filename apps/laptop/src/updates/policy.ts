/** How often a running app looks for a release, when a race is not underway. */
export const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** Extra time after a timed race so scoring and the protest window are left alone. */
const TIMED_RACE_BUFFER_MS = 3 * 60 * 60 * 1000;

/** A lap race has no clock limit. Treat the start day as live for this long. */
const LAP_RACE_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface UpdateRaceClock {
  plannedStart: string | null;
  length: { mode: "time"; minutes: number } | { mode: "laps"; laps: number | null };
}

/**
 * Updates stay quiet while scoring is open, and while a planned start is still
 * inside its race window. Prep before the start is not blocked.
 */
export function updatesArePaused(input: {
  screen: string;
  races: readonly UpdateRaceClock[];
  now: number;
}): boolean {
  if (input.screen === "scoring") return true;
  return input.races.some((race) => raceIsUnderway(race, input.now));
}

export function shouldCheckForUpdates(input: {
  online: boolean;
  paused: boolean;
  downloading: boolean;
}): boolean {
  return input.online && !input.paused && !input.downloading;
}

function raceIsUnderway(race: UpdateRaceClock, now: number): boolean {
  if (!race.plannedStart) return false;
  const start = Date.parse(race.plannedStart);
  if (!Number.isFinite(start) || now < start) return false;
  const windowMs =
    race.length.mode === "time"
      ? race.length.minutes * 60 * 1000 + TIMED_RACE_BUFFER_MS
      : LAP_RACE_WINDOW_MS;
  return now < start + windowMs;
}
