import { describe, expect, it } from "vitest";

import { makePunch, makeScoreInput, makeStart } from "../test-support.js";
import { SCHEMA_VERSION } from "../version.js";
import { scoreRace } from "./engine.js";
import { raceEndWarning } from "./end-mode.js";
import type { RiderStart, RowStart } from "../schemas/starts.js";

const COURSE = [
  { id: "cp1", order: 1, name: "CP1" },
  { id: "cp2", order: 2, name: "CP2" },
  { id: "finish", order: 3, name: "Finish" },
];

function at(seconds: number): string {
  return new Date(Date.parse("2026-06-14T14:00:00.000Z") + seconds * 1000).toISOString();
}

function hit(n: number, checkId: string, seconds: number) {
  return makePunch({
    n,
    riderNumber: 7,
    checkId,
    timestamp: at(seconds),
  });
}

describe("lap assignment and end modes", () => {
  it("warns when a race has neither a lap count nor a time limit", () => {
    expect(raceEndWarning({ mode: "laps", laps: null })).toMatch(/no lap count/i);
    expect(raceEndWarning({ mode: "laps", laps: 2 })).toBeNull();
    expect(raceEndWarning({ mode: "time", minutes: 90 })).toBeNull();
  });

  it("counts every valid pass on a multi-lap race and ranks by passes then time", () => {
    const fast = [
      hit(1, "cp1", 60),
      hit(2, "cp2", 120),
      hit(3, "finish", 180),
      hit(4, "cp1", 300),
      hit(5, "cp2", 360),
      hit(6, "finish", 420),
    ].map((punch) => ({ ...punch, riderNumber: 7 }));
    const slow = [hit(11, "cp1", 90), hit(12, "cp2", 200), hit(13, "finish", 400)].map(
      (punch) => ({ ...punch, riderNumber: 8 }),
    );
    const result = scoreRace(
      makeScoreInput({
        length: { mode: "laps", laps: 2 },
        checks: COURSE,
        riders: [
          { number: 7, name: "Fast", class: "A", startRow: 1 },
          { number: 8, name: "Slow", class: "A", startRow: 1 },
        ],
        plannedStart: "2026-06-14T14:00:00.000Z",
        punches: [...fast, ...slow],
        minPassGapMs: 60_000,
      }),
    );
    const leader = result.payload.rows.find((row) => row.number === 7);
    const trailer = result.payload.rows.find((row) => row.number === 8);
    expect(leader?.checks).toBe(6);
    expect(leader?.status).toBe("finished");
    expect(leader?.checkResults.filter((check) => check.lap === 2)).toHaveLength(3);
    expect(leader?.elapsedSeconds).toBe(420);
    expect(trailer?.checks).toBe(3);
    expect(leader?.positionOverall).toBe(1);
    expect(trailer?.positionOverall).toBe(2);
  });

  it("shows a pass after the lap count and leaves it unscored", () => {
    const result = scoreRace(
      makeScoreInput({
        length: { mode: "laps", laps: 1 },
        checks: COURSE,
        riders: [{ number: 7, name: "Fast", class: "A" }],
        startTimes: [makeStart(7, 0)],
        minPassGapMs: 1_000,
        punches: [
          hit(1, "cp1", 30),
          hit(2, "cp2", 60),
          hit(3, "finish", 90),
          hit(4, "cp1", 200),
        ],
      }),
    );
    // One lap stays on the distinct-check path, so a repeat does not add a check.
    expect(result.payload.rows[0]?.checks).toBe(3);
    const multi = scoreRace(
      makeScoreInput({
        length: { mode: "laps", laps: 2 },
        checks: COURSE,
        riders: [{ number: 7, name: "Fast", class: "A" }],
        startTimes: [makeStart(7, 0)],
        minPassGapMs: 1_000,
        punches: [
          hit(1, "cp1", 30),
          hit(2, "cp2", 60),
          hit(3, "finish", 90),
          hit(4, "cp1", 200),
          hit(5, "cp2", 230),
          hit(6, "finish", 260),
          hit(7, "cp1", 400),
        ],
      }),
    );
    const row = multi.payload.rows[0];
    expect(row?.checks).toBe(6);
    expect(row?.checkResults.at(-1)?.unscoredReason).toBe("after_lap_count");
    expect(row?.elapsedSeconds).toBe(260);
  });

  it("records a later lap but does not score it once the lap count is finished", () => {
    const result = scoreRace(
      makeScoreInput({
        length: { mode: "laps", laps: 1 },
        checks: COURSE,
        riders: [{ number: 7, name: "Fast", class: "A" }],
        startTimes: [makeStart(7, 0)],
        punches: [hit(1, "cp1", 10), hit(2, "cp1", 400)],
      }),
    );
    expect(result.payload.rows[0]?.checks).toBe(1);
    expect(result.payload.rows[0]?.checkResults).toHaveLength(1);
  });

  it("flags a too-soon repeat and an out-of-order pass without dropping them", () => {
    const result = scoreRace(
      makeScoreInput({
        length: { mode: "laps", laps: 2 },
        checks: COURSE,
        riders: [{ number: 7, name: "Fast", class: "A" }],
        startTimes: [makeStart(7, 0)],
        minPassGapMs: 120_000,
        punches: [
          hit(1, "cp1", 30),
          hit(2, "cp1", 40),
          hit(3, "finish", 50),
          hit(4, "cp2", 200),
        ],
      }),
    );
    const row = result.payload.rows[0];
    expect(row?.checks).toBe(2);
    expect(row?.checkResults.map((check) => check.unscoredReason ?? "counted")).toEqual([
      "counted",
      "too_soon",
      "out_of_order",
      "counted",
    ]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "pass_too_soon",
      "pass_out_of_order",
    ]);
  });

  it("keeps a timed race on distinct checks and stops scoring after the limit", () => {
    const result = scoreRace(
      makeScoreInput({
        timeLimitMinutes: 3,
        checks: COURSE,
        riders: [{ number: 7, name: "Fast", class: "A" }],
        startTimes: [makeStart(7, 0)],
        punches: [hit(1, "cp1", 60), hit(2, "cp1", 90), hit(3, "finish", 240)],
      }),
    );
    const row = result.payload.rows[0];
    expect(row?.checks).toBe(1);
    expect(row?.checkResults).toHaveLength(2);
    expect(
      row?.checkResults.find((check) => check.checkId === "finish")?.countsForScore,
    ).toBe(false);
  });
});

describe("start precedence", () => {
  function rowGo(row: number, seconds: number, source?: "laptop"): RowStart {
    return {
      schemaVersion: SCHEMA_VERSION,
      uuid: `00000000-0000-4000-8000-${row.toString(16).padStart(12, "0")}`,
      row,
      timestamp: at(seconds),
      createdAt: at(seconds),
      voided: false,
      deviceId: "start-phone",
      ...(source ? { source } : {}),
    };
  }

  function individual(seconds: number, voided = false): RiderStart {
    return {
      schemaVersion: SCHEMA_VERSION,
      uuid: "00000000-0000-4000-8000-000000000099",
      riderNumber: 7,
      timestamp: at(seconds),
      createdAt: at(seconds),
      voided,
      deviceId: "start-phone",
    };
  }

  function race(extra: Parameters<typeof makeScoreInput>[0]) {
    return scoreRace(
      makeScoreInput({
        checks: [{ id: "cp1", order: 1, name: "CP1" }],
        riders: [{ number: 7, name: "Alex", class: "A", startRow: 1 }],
        plannedStart: at(0),
        punches: [hit(1, "cp1", 100)],
        ...extra,
      }),
    );
  }

  it("uses row go instead of the planned row clock", () => {
    const result = race({ rowStarts: [rowGo(1, 20)] });
    expect(result.payload.rows[0]?.elapsedSeconds).toBe(80);
  });

  it("lets an individual start override the row, and a voided one fall back", () => {
    const live = race({ rowStarts: [rowGo(1, 20)], riderStarts: [individual(40)] });
    expect(live.payload.rows[0]?.elapsedSeconds).toBe(60);
    const voided = race({
      rowStarts: [rowGo(1, 20)],
      riderStarts: [individual(40, true)],
    });
    expect(voided.payload.rows[0]?.elapsedSeconds).toBe(80);
  });

  it("lets a hand-edited start beat the individual start and the row go", () => {
    const result = race({
      rowStarts: [rowGo(1, 20)],
      riderStarts: [individual(40)],
      startTimes: [makeStart(7, 10)],
    });
    expect(result.payload.rows[0]?.elapsedSeconds).toBe(90);
  });

  it("lets a laptop edit of the row beat the station tap", () => {
    const result = race({
      rowStarts: [
        rowGo(1, 20),
        {
          ...rowGo(1, 35),
          source: "laptop",
          uuid: "00000000-0000-4000-8000-0000000000aa",
        },
      ],
    });
    expect(result.payload.rows[0]?.elapsedSeconds).toBe(65);
  });
});
