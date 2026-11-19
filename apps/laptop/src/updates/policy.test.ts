import { describe, expect, it } from "vitest";

import {
  shouldCheckForUpdates,
  UPDATE_CHECK_INTERVAL_MS,
  updatesArePaused,
  type UpdateRaceClock,
} from "./policy";

const start = "2026-06-14T14:00:00.000Z";
const timed: UpdateRaceClock = {
  plannedStart: start,
  length: { mode: "time", minutes: 180 },
};
const laps: UpdateRaceClock = {
  plannedStart: start,
  length: { mode: "laps", laps: null },
};

describe("updatesArePaused", () => {
  it("allows a check before the start and after the race window", () => {
    expect(
      updatesArePaused({
        screen: "events",
        races: [timed],
        now: Date.parse("2026-06-14T13:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      updatesArePaused({
        screen: "registration",
        races: [timed],
        now: Date.parse("2026-06-14T20:30:00.000Z"),
      }),
    ).toBe(false);
  });

  it("pauses on the scoring screen and during the race window", () => {
    expect(
      updatesArePaused({
        screen: "scoring",
        races: [],
        now: Date.parse("2026-06-14T10:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      updatesArePaused({
        screen: "events",
        races: [timed],
        now: Date.parse("2026-06-14T15:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      updatesArePaused({
        screen: "results",
        races: [laps],
        now: Date.parse("2026-06-14T20:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("ignores a race that has no planned start unless scoring is open", () => {
    expect(
      updatesArePaused({
        screen: "setup",
        races: [{ plannedStart: null, length: { mode: "time", minutes: 60 } }],
        now: Date.parse(start),
      }),
    ).toBe(false);
  });
});

describe("shouldCheckForUpdates", () => {
  it("stays quiet offline, during a race, and while a download is running", () => {
    expect(
      shouldCheckForUpdates({ online: false, paused: false, downloading: false }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ online: true, paused: true, downloading: false }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ online: true, paused: false, downloading: true }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ online: true, paused: false, downloading: false }),
    ).toBe(true);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(3 * 60 * 60 * 1000);
  });
});
