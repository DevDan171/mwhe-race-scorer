import { describe, expect, it } from "vitest";

import {
  pointsForPlace,
  pointsForResult,
  rankSeries,
  type SeriesEventResult,
} from "./points.js";

describe("pointsForPlace", () => {
  it("follows the MWHE schedule through P20 and then zero", () => {
    const expected: Record<number, number> = {
      1: 25,
      2: 22,
      3: 20,
      4: 18,
      5: 16,
      6: 15,
      7: 14,
      8: 13,
      9: 12,
      10: 11,
      11: 10,
      12: 9,
      13: 8,
      14: 7,
      15: 6,
      16: 5,
      17: 4,
      18: 3,
      19: 2,
      20: 1,
      21: 0,
      50: 0,
    };
    for (const [place, points] of Object.entries(expected)) {
      expect(pointsForPlace(Number(place))).toBe(points);
    }
    expect(pointsForPlace(0)).toBe(0);
    expect(pointsForResult({ status: "DNF", positionInClass: 1 })).toBe(0);
    expect(pointsForResult({ status: "DQ", positionInClass: 1 })).toBe(0);
    expect(pointsForResult({ status: "finished", positionInClass: null })).toBe(0);
  });
});

function finish(
  eventId: string,
  date: string,
  riderNumber: number,
  position: number | null,
  status: SeriesEventResult["status"] = "finished",
): SeriesEventResult {
  return {
    eventId,
    date,
    riderNumber,
    class: "Pro",
    positionInClass: position,
    status,
  };
}

describe("rankSeries", () => {
  it("breaks a points tie with the most recent event", () => {
    const standings = rankSeries([
      finish("round-1", "2026-05-01", 1, 1),
      finish("round-1", "2026-05-01", 2, 2),
      finish("round-2", "2026-06-01", 1, 2),
      finish("round-2", "2026-06-01", 2, 1),
    ]);
    const pro = standings.find((group) => group.class === "Pro");
    expect(pro?.usedOpenTieBreakFallback).toBe(false);
    expect(pro?.rows.map((row) => [row.riderNumber, row.points, row.rank])).toEqual([
      [2, 47, 1],
      [1, 47, 2],
    ]);
  });

  it("lets a classified finish beat a rider who missed that event", () => {
    const standings = rankSeries([
      finish("round-1", "2026-05-01", 1, 1),
      finish("round-2", "2026-06-01", 2, 1),
    ]);
    const pro = standings.find((group) => group.class === "Pro");
    expect(pro?.usedOpenTieBreakFallback).toBe(false);
    expect(pro?.rows.map((row) => row.riderNumber)).toEqual([2, 1]);
  });

  it("walks back when neither rider raced the most recent event", () => {
    const standings = rankSeries([
      finish("round-1", "2026-04-01", 1, 1),
      finish("round-2", "2026-05-01", 2, 1),
      finish("round-3", "2026-06-01", 9, 1),
    ]);
    const pro = standings.find((group) => group.class === "Pro");
    expect(pro?.usedOpenTieBreakFallback).toBe(true);
    expect(pro?.rows.map((row) => [row.riderNumber, row.points])).toEqual([
      [9, 25],
      [2, 25],
      [1, 25],
    ]);
  });

  it("falls through to rider number when no event separates them", () => {
    const standings = rankSeries([
      finish("round-1", "2026-06-01", 20, null, "DNF"),
      finish("round-1", "2026-06-01", 5, null, "DNF"),
    ]);
    const pro = standings.find((group) => group.class === "Pro");
    expect(pro?.usedOpenTieBreakFallback).toBe(true);
    expect(pro?.rows.map((row) => [row.riderNumber, row.points, row.rank])).toEqual([
      [5, 0, 1],
      [20, 0, 2],
    ]);
  });

  it("treats the smaller event id as more recent when the dates match", () => {
    const standings = rankSeries([
      { ...finish("b-round", "2026-06-01", 2, 1), eventId: "b-round" },
      { ...finish("a-round", "2026-06-01", 1, 1), eventId: "a-round" },
    ]);
    const pro = standings.find((group) => group.class === "Pro");
    expect(pro?.rows.map((row) => row.riderNumber)).toEqual([1, 2]);
  });

  it("keeps classes separate and ignores unknown rows", () => {
    const standings = rankSeries([
      { ...finish("round-1", "2026-06-01", 1, 1), class: "A" },
      { ...finish("round-1", "2026-06-01", 1, 2), class: "B" },
      { ...finish("round-1", "2026-06-01", 8, 1), class: null },
    ]);
    expect(standings.map((group) => group.class)).toEqual(["A", "B"]);
    expect(standings[0]?.rows[0]).toMatchObject({
      riderNumber: 1,
      class: "A",
      points: 25,
    });
    expect(standings[1]?.rows[0]).toMatchObject({
      riderNumber: 1,
      class: "B",
      points: 22,
    });
  });
});
