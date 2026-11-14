import { describe, expect, it } from "vitest";

import { createDemoRace } from "../fixtures/demo-race.js";
import { projectPhoneRoster } from "../roster/project.js";
import type { ResultRow } from "../schemas/results.js";
import { pointsForResult } from "./points.js";
import { scoreRace } from "./engine.js";

function row(rows: ResultRow[], number: number): ResultRow {
  const found = rows.find((entry) => entry.number === number);
  if (!found) throw new Error(`No result row for #${number}`);
  return found;
}

describe("demo race", () => {
  const result = scoreRace(createDemoRace());
  const rows = result.payload.rows;

  it("publishes a provisional result for the event", () => {
    expect(result.payload).toMatchObject({
      eventId: "timber-ridge-2026",
      version: 1,
      status: "provisional",
      protestWindowMinutes: 30,
    });
  });

  it("ranks the field with no ties", () => {
    expect(
      rows.map((entry) => [
        entry.positionOverall,
        entry.number,
        entry.checks,
        entry.totalTimeSeconds,
        entry.status,
      ]),
    ).toEqual([
      [1, 1, 4, 6000, "finished"],
      [2, 7, 4, 6900, "finished"],
      [3, 42, 4, 7470, "finished"],
      [4, 55, 3, 6780, "finished"],
      [5, 120, 3, 9600, "finished"],
      [6, 999, 2, 3600, "finished"],
      [7, 88, 2, 5400, "finished"],
      [8, 3, 0, null, "DNF"],
      [9, 64, 0, null, "DNF"],
      [10, 90, 0, null, "DNF"],
      [null, 77, 4, 5600, "DQ"],
    ]);
    const positions = rows
      .map((entry) => entry.positionOverall)
      .filter((position): position is number => position !== null);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("keeps Alex's duplicated CP2 punch and drops the unknown check", () => {
    const alex = row(rows, 1);
    expect(alex).toMatchObject({
      name: "Alex Hargrove",
      class: "Pro",
      checks: 4,
      elapsedSeconds: 6000,
      penaltySeconds: 0,
      totalTimeSeconds: 6000,
      positionInClass: 1,
      positionOverall: 1,
    });
    expect(
      alex.checkResults.map((check) => [check.checkId, check.cumulativeSeconds]),
    ).toEqual([
      ["cp1", 1200],
      ["cp2", 2700],
      ["cp3", 4200],
      ["cp4", 6000],
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "duplicate_punch_uuid" }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "unknown_check",
        riderNumber: 1,
        checkId: "not-a-check",
      }),
    );
  });

  it("scores Casey from a later start", () => {
    expect(row(rows, 42)).toMatchObject({
      name: "Casey Nguyen",
      class: "A",
      checks: 4,
      totalTimeSeconds: 7470,
      positionInClass: 1,
      positionOverall: 3,
      status: "finished",
    });
  });

  it("applies Dana's penalties, ignores the voided CP4, and does not double-count CP1", () => {
    const dana = row(rows, 55);
    expect(dana).toMatchObject({
      checks: 3,
      elapsedSeconds: 6600,
      overallPenaltySeconds: 60,
      penaltySeconds: 180,
      totalTimeSeconds: 6780,
      positionInClass: 2,
      positionOverall: 4,
      status: "finished",
    });
    expect(dana.checkResults).toEqual([
      expect.objectContaining({
        checkId: "cp1",
        cumulativeSeconds: 1800,
        segmentSeconds: 1800,
        penaltySeconds: 0,
      }),
      expect.objectContaining({
        checkId: "cp2",
        cumulativeSeconds: 3900,
        segmentSeconds: 2100,
        penaltySeconds: 120,
      }),
      expect.objectContaining({
        checkId: "cp3",
        cumulativeSeconds: 6600,
        segmentSeconds: 2700,
        penaltySeconds: 0,
      }),
    ]);
  });

  it("shows Gale's CP4 but does not let it count", () => {
    const gale = row(rows, 120);
    expect(gale).toMatchObject({
      class: "+40A",
      checks: 3,
      totalTimeSeconds: 9600,
      positionInClass: 1,
      positionOverall: 5,
      status: "finished",
    });
    expect(gale.checkResults[3]).toMatchObject({
      checkId: "cp4",
      cumulativeSeconds: 11400,
      segmentSeconds: 1800,
      overLimit: true,
      countsForScore: false,
    });
  });

  it("flags the unknown number and still ranks them overall", () => {
    expect(row(rows, 999)).toMatchObject({
      name: "UNKNOWN",
      class: null,
      unknown: true,
      checks: 2,
      totalTimeSeconds: 3600,
      positionOverall: 6,
      positionInClass: null,
      status: "finished",
    });
  });

  it("marks start-and-no-checks, and no-start, as DNF", () => {
    expect(row(rows, 3)).toMatchObject({
      name: "Indigo Shaw",
      class: "Pro",
      status: "DNF",
      checks: 0,
      positionInClass: 3,
      positionOverall: 8,
    });
    expect(row(rows, 90)).toMatchObject({
      name: "Fran Okonkwo",
      status: "DNF",
      checks: 0,
      positionInClass: 2,
      positionOverall: 10,
    });
    expect(row(rows, 64)).toMatchObject({
      name: "Jules Marin",
      class: "C",
      status: "DNF",
      checks: 0,
      totalTimeSeconds: null,
      positionInClass: 1,
      positionOverall: 9,
    });
  });

  it("does not rank the disqualified rider", () => {
    expect(row(rows, 77)).toMatchObject({
      name: "Harper Quinn",
      class: "A",
      status: "DQ",
      checks: 4,
      totalTimeSeconds: 5600,
      positionOverall: null,
      positionInClass: null,
    });
  });

  it("gives class points only to classified finishers", () => {
    const points = Object.fromEntries(
      rows.map((entry) => [entry.number, pointsForResult(entry)]),
    );
    expect(points).toEqual({
      1: 25,
      7: 22,
      42: 25,
      55: 22,
      120: 25,
      999: 0,
      88: 25,
      3: 0,
      64: 0,
      90: 0,
      77: 0,
    });
  });

  it("projects a phone roster with only name, number, and class", () => {
    const roster = projectPhoneRoster(createDemoRace().race);
    expect(roster.riders).toHaveLength(10);
    expect(roster.riders.some((rider) => rider.number === 999)).toBe(false);
    for (const rider of roster.riders) {
      expect(Object.keys(rider).sort()).toEqual(["class", "name", "number"]);
    }
  });
});
