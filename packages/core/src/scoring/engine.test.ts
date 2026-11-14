import { describe, expect, it } from "vitest";

import { PROTEST_WINDOW_MINUTES, SCHEMA_VERSION } from "../version.js";
import {
  iso,
  isoMs,
  makePenalty,
  makePunch,
  makeScoreInput,
  makeStart,
  uuid,
} from "../test-support.js";
import type { ResultRow } from "../schemas/results.js";
import { scoreRace } from "./engine.js";

function row(rows: ResultRow[], number: number): ResultRow {
  const found = rows.find((entry) => entry.number === number);
  if (!found) throw new Error(`No result row for #${number}`);
  return found;
}

const alex = { number: 1, name: "Alex", class: "Pro" as const };
const blake = { number: 2, name: "Blake", class: "Pro" as const };
const casey = { number: 10, name: "Casey", class: "A" as const };

describe("scoreRace", () => {
  it("returns an empty provisional payload when nobody is entered", () => {
    const result = scoreRace(makeScoreInput());
    expect(result.payload).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      eventId: "test-event",
      version: 3,
      status: "provisional",
      protestWindowMinutes: PROTEST_WINDOW_MINUTES,
      rows: [],
    });
    expect(result.warnings).toEqual([]);
  });

  it("dedupes by uuid and drops the punch if any copy is voided", () => {
    const live = makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 100 });
    const undone = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1)],
        punches: [live, { ...live, voided: true, timestamp: iso(150) }],
      }),
    );
    expect(row(undone.payload.rows, 1).checks).toBe(0);
    expect(undone.warnings.map((warning) => warning.code)).toContain(
      "duplicate_punch_uuid",
    );

    const undoFirst = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1)],
        punches: [{ ...live, voided: true }, live],
      }),
    );
    expect(row(undoFirst.payload.rows, 1).checks).toBe(0);

    const keptFirst = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1)],
        punches: [live, { ...live, timestamp: iso(400) }],
      }),
    );
    expect(row(keptFirst.payload.rows, 1)).toMatchObject({
      checks: 1,
      elapsedSeconds: 100,
      totalTimeSeconds: 100,
    });
  });

  it("ignores a voided punch and a punch before the start", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1, 50)],
        punches: [
          makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 40 }),
          makePunch({
            n: 2,
            riderNumber: 1,
            checkId: "cp2",
            offsetSeconds: 80,
            voided: true,
          }),
          makePunch({ n: 3, riderNumber: 1, checkId: "cp3", offsetSeconds: 120 }),
        ],
      }),
    );
    const alexRow = row(result.payload.rows, 1);
    expect(alexRow.checks).toBe(1);
    expect(alexRow.checkResults.map((check) => check.checkId)).toEqual(["cp3"]);
    expect(alexRow.elapsedSeconds).toBe(70);
    expect(result.warnings).toContainEqual({
      code: "punch_before_start",
      riderNumber: 1,
      uuid: uuid(1),
    });
  });

  it("counts distinct checks and uses the earliest punch for that check", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1)],
        punches: [
          makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 100 }),
          makePunch({ n: 2, riderNumber: 1, checkId: "cp1", offsetSeconds: 130 }),
          makePunch({ n: 3, riderNumber: 1, checkId: "cp3", offsetSeconds: 250 }),
        ],
      }),
    );
    const alexRow = row(result.payload.rows, 1);
    expect(alexRow.checks).toBe(2);
    expect(alexRow.checkResults).toEqual([
      expect.objectContaining({
        checkId: "cp1",
        cumulativeSeconds: 100,
        segmentSeconds: 100,
        countsForScore: true,
        overLimit: false,
      }),
      expect.objectContaining({
        checkId: "cp3",
        cumulativeSeconds: 250,
        segmentSeconds: 150,
        countsForScore: true,
      }),
    ]);
  });

  it("uses the chronologically last in-limit punch for total time", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1)],
        punches: [
          makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 100 }),
          makePunch({ n: 2, riderNumber: 1, checkId: "cp2", offsetSeconds: 200 }),
          makePunch({ n: 3, riderNumber: 1, checkId: "cp1", offsetSeconds: 300 }),
        ],
      }),
    );
    const alexRow = row(result.payload.rows, 1);
    expect(alexRow.checks).toBe(2);
    expect(alexRow.checkResults[0]?.cumulativeSeconds).toBe(100);
    expect(alexRow.elapsedSeconds).toBe(300);
    expect(alexRow.totalTimeSeconds).toBe(300);
  });

  it("adds check and overall penalties to total time", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1)],
        punches: [
          makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 100 }),
        ],
        penalties: [
          makePenalty({ n: 10, riderNumber: 1, seconds: 30, scope: { type: "overall" } }),
          makePenalty({
            n: 11,
            riderNumber: 1,
            seconds: 15,
            scope: { type: "check", checkId: "cp1" },
          }),
          makePenalty({
            n: 12,
            riderNumber: 1,
            seconds: 5,
            scope: { type: "check", checkId: "cp2" },
          }),
          makePenalty({
            n: 13,
            riderNumber: 1,
            seconds: 7,
            scope: { type: "check", checkId: "missing" },
          }),
        ],
      }),
    );
    const alexRow = row(result.payload.rows, 1);
    expect(alexRow.elapsedSeconds).toBe(100);
    expect(alexRow.overallPenaltySeconds).toBe(30);
    expect(alexRow.penaltySeconds).toBe(57);
    expect(alexRow.totalTimeSeconds).toBe(157);
    expect(alexRow.checkResults[0]?.penaltySeconds).toBe(15);
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      "penalty_without_punch",
      "unknown_check_penalty",
    ]);
  });

  it("records an over-limit punch but does not score it", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        timeLimitMinutes: 10,
        startTimes: [makeStart(1)],
        punches: [
          makePunch({
            n: 1,
            riderNumber: 1,
            checkId: "cp1",
            timestamp: isoMs(10 * 60 * 1000),
          }),
          makePunch({
            n: 2,
            riderNumber: 1,
            checkId: "cp2",
            timestamp: isoMs(10 * 60 * 1000 + 1),
          }),
        ],
      }),
    );
    const alexRow = row(result.payload.rows, 1);
    expect(alexRow.checks).toBe(1);
    expect(alexRow.totalTimeSeconds).toBe(600);
    expect(alexRow.status).toBe("finished");
    expect(alexRow.checkResults[0]).toMatchObject({
      checkId: "cp1",
      overLimit: false,
      countsForScore: true,
    });
    expect(alexRow.checkResults[1]).toMatchObject({
      checkId: "cp2",
      overLimit: true,
      countsForScore: false,
    });
    expect(alexRow.checkResults[1]?.cumulativeSeconds).toBeCloseTo(600.001, 5);
  });

  it("is DNF when every punch is over the limit", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        timeLimitMinutes: 10,
        startTimes: [makeStart(1)],
        punches: [
          makePunch({
            n: 1,
            riderNumber: 1,
            checkId: "cp1",
            timestamp: isoMs(10 * 60 * 1000 + 1),
          }),
        ],
      }),
    );
    const alexRow = row(result.payload.rows, 1);
    expect(alexRow.status).toBe("DNF");
    expect(alexRow.checks).toBe(0);
    expect(alexRow.totalTimeSeconds).toBeNull();
    expect(alexRow.checkResults[0]?.overLimit).toBe(true);
  });

  it("ranks by checks, then time, then earlier last punch, then rider number", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [
          { number: 20, name: "Twenty", class: "A" },
          { number: 10, name: "Ten", class: "A" },
          { number: 30, name: "Thirty", class: "B" },
          { number: 40, name: "Forty", class: "A" },
        ],
        startTimes: [makeStart(20), makeStart(10), makeStart(30), makeStart(40)],
        punches: [
          // #20 and #10 both have 1 check and total 1000. #20's last punch is earlier
          // because 100 seconds of the total is a penalty.
          makePunch({ n: 1, riderNumber: 20, checkId: "cp1", offsetSeconds: 900 }),
          makePunch({ n: 2, riderNumber: 10, checkId: "cp1", offsetSeconds: 1000 }),
          // Same checks, same time, same last punch as #10. Lower number wins.
          makePunch({ n: 3, riderNumber: 40, checkId: "cp1", offsetSeconds: 1000 }),
          // More checks, so #30 ranks first even with a slow time.
          makePunch({ n: 4, riderNumber: 30, checkId: "cp1", offsetSeconds: 100 }),
          makePunch({ n: 5, riderNumber: 30, checkId: "cp2", offsetSeconds: 5000 }),
        ],
        penalties: [
          makePenalty({
            n: 9,
            riderNumber: 20,
            seconds: 100,
            scope: { type: "overall" },
          }),
        ],
      }),
    );

    expect(result.payload.rows.map((entry) => entry.number)).toEqual([30, 20, 10, 40]);
    expect(row(result.payload.rows, 30)).toMatchObject({
      positionOverall: 1,
      positionInClass: 1,
      checks: 2,
      class: "B",
    });
    expect(row(result.payload.rows, 20)).toMatchObject({
      positionOverall: 2,
      positionInClass: 1,
      totalTimeSeconds: 1000,
      class: "A",
    });
    expect(row(result.payload.rows, 10)).toMatchObject({
      positionOverall: 3,
      positionInClass: 2,
    });
    expect(row(result.payload.rows, 40)).toMatchObject({
      positionOverall: 4,
      positionInClass: 3,
    });
  });

  it("treats a registered rider with a start and no scoring checks as DNF", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex, blake],
        startTimes: [makeStart(1), makeStart(2)],
        punches: [
          makePunch({
            n: 1,
            riderNumber: 1,
            checkId: "cp1",
            offsetSeconds: 10,
            voided: true,
          }),
        ],
      }),
    );
    expect(row(result.payload.rows, 1)).toMatchObject({
      status: "DNF",
      checks: 0,
      totalTimeSeconds: null,
      positionOverall: 1,
      positionInClass: 1,
    });
    expect(row(result.payload.rows, 2).status).toBe("DNF");
  });

  it("includes a registered rider with no start time as DNF", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        punches: [makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 10 })],
        penalties: [
          makePenalty({ n: 2, riderNumber: 1, seconds: 30, scope: { type: "overall" } }),
        ],
      }),
    );
    expect(row(result.payload.rows, 1)).toMatchObject({
      status: "DNF",
      checks: 0,
      totalTimeSeconds: null,
      penaltySeconds: 30,
      checkResults: [],
    });
    expect(result.warnings).toContainEqual({
      code: "missing_start_time",
      riderNumber: 1,
      punchCount: 1,
    });
  });

  it("flags an unknown number, ranks them overall, and gives them no class position", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1), makeStart(999)],
        punches: [
          makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 100 }),
          makePunch({ n: 2, riderNumber: 999, checkId: "cp1", offsetSeconds: 50 }),
          makePunch({ n: 3, riderNumber: 999, checkId: "nope", offsetSeconds: 80 }),
        ],
      }),
    );
    expect(row(result.payload.rows, 999)).toMatchObject({
      name: "UNKNOWN",
      class: null,
      unknown: true,
      checks: 1,
      totalTimeSeconds: 50,
      positionOverall: 1,
      positionInClass: null,
      status: "finished",
    });
    expect(row(result.payload.rows, 1).positionOverall).toBe(2);
    expect(result.warnings).toContainEqual({
      code: "unknown_check",
      riderNumber: 999,
      checkId: "nope",
      uuid: uuid(3),
    });
  });

  it("keeps a DQ out of the rankings even when they reached every check", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex, casey],
        startTimes: [makeStart(1), makeStart(10)],
        punches: [
          makePunch({ n: 1, riderNumber: 10, checkId: "cp1", offsetSeconds: 10 }),
          makePunch({ n: 2, riderNumber: 10, checkId: "cp2", offsetSeconds: 20 }),
          makePunch({ n: 3, riderNumber: 1, checkId: "cp1", offsetSeconds: 500 }),
        ],
        disqualifications: [
          {
            schemaVersion: SCHEMA_VERSION,
            riderNumber: 10,
            reason: "Outside assistance",
            appliedBy: "race_director",
            createdAt: iso(30),
          },
          {
            schemaVersion: SCHEMA_VERSION,
            riderNumber: 10,
            reason: "Second note",
            appliedBy: "admin",
            createdAt: iso(40),
          },
        ],
      }),
    );
    expect(row(result.payload.rows, 10)).toMatchObject({
      status: "DQ",
      checks: 2,
      totalTimeSeconds: 20,
      positionOverall: null,
      positionInClass: null,
    });
    expect(row(result.payload.rows, 1)).toMatchObject({
      positionOverall: 1,
      positionInClass: 1,
    });
    expect(result.warnings).toContainEqual({
      code: "duplicate_disqualification",
      riderNumber: 10,
    });
  });

  it("warns when a DQ names a number that never registered", () => {
    const result = scoreRace(
      makeScoreInput({
        disqualifications: [
          {
            schemaVersion: SCHEMA_VERSION,
            riderNumber: 404,
            reason: "No entry",
            appliedBy: "race_director",
            createdAt: iso(1),
          },
        ],
      }),
    );
    expect(row(result.payload.rows, 404)).toMatchObject({
      unknown: true,
      status: "DQ",
      name: "UNKNOWN",
      positionOverall: null,
    });
    expect(result.warnings).toContainEqual({
      code: "disqualification_unknown_rider",
      riderNumber: 404,
    });
  });

  it("sorts two unranked riders by number", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [
          { number: 20, name: "Twenty", class: "A" },
          { number: 5, name: "Five", class: "B" },
        ],
        disqualifications: [
          {
            schemaVersion: SCHEMA_VERSION,
            riderNumber: 20,
            reason: "Course cut",
            appliedBy: "race_director",
            createdAt: iso(1),
          },
          {
            schemaVersion: SCHEMA_VERSION,
            riderNumber: 5,
            reason: "Course cut",
            appliedBy: "admin",
            createdAt: iso(2),
          },
        ],
      }),
    );
    expect(result.payload.rows.map((entry) => entry.number)).toEqual([5, 20]);
  });

  it("uses the last start time when the laptop sends more than one", () => {
    const result = scoreRace(
      makeScoreInput({
        riders: [alex],
        startTimes: [makeStart(1, 0), makeStart(1, 40)],
        punches: [
          makePunch({ n: 1, riderNumber: 1, checkId: "cp1", offsetSeconds: 100 }),
        ],
      }),
    );
    expect(row(result.payload.rows, 1).elapsedSeconds).toBe(60);
    expect(result.warnings).toContainEqual({
      code: "duplicate_start_time",
      riderNumber: 1,
    });
  });
});
