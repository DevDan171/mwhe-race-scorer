import { describe, expect, it } from "vitest";

import type { EventRegistration, Race } from "../schemas/race-package.js";
import { planStartOrder } from "./start-order.js";

const START = "2026-09-12T14:00:00.000Z";

function race(overrides: Partial<Race> = {}): Race {
  return {
    id: "race",
    name: "Test",
    order: 1,
    length: { mode: "time", minutes: 120 },
    checks: [{ id: "cp1", order: 1, name: "CP1" }],
    rowGapSeconds: 60,
    plannedStart: START,
    startRows: [
      { id: "pro", order: 1, label: "Pro", classes: ["Pro"] },
      { id: "a2", order: 2, label: "A", classes: ["A"] },
      { id: "a3", order: 3, label: "A", classes: ["A"] },
      { id: "a4", order: 4, label: "A", classes: ["A"] },
      { id: "plus", order: 5, label: "+40A", classes: ["+40A"] },
    ],
    ...overrides,
  };
}

function rider(
  riderNumber: number,
  riderClass: EventRegistration["class"],
  startRow: number | null = null,
): EventRegistration {
  return {
    riderNumber,
    name: `Rider ${riderNumber}`,
    class: riderClass,
    seriesId: null,
    startRow,
  };
}

describe("planStartOrder", () => {
  it("sets each row's clock from the row number minus one", () => {
    const plan = planStartOrder(race(), []);
    expect(plan.rows.map((row) => [row.rowNumber, row.startedAt])).toEqual([
      [1, "2026-09-12T14:00:00.000Z"],
      [2, "2026-09-12T14:01:00.000Z"],
      [3, "2026-09-12T14:02:00.000Z"],
      [4, "2026-09-12T14:03:00.000Z"],
      [5, "2026-09-12T14:04:00.000Z"],
    ]);
  });

  it("splits unassigned riders by number, earliest row first", () => {
    const plan = planStartOrder(race(), [
      rider(21, "A"),
      rider(4, "A"),
      rider(11, "A"),
      rider(20, "A"),
      rider(10, "A"),
    ]);
    const rows = plan.rows.filter((row) => row.classes.includes("A"));
    expect(rows.map((row) => row.riders.map((entry) => entry.riderNumber))).toEqual([
      [4, 10],
      [11, 20],
      [21],
    ]);
    expect(
      rows.every((row) => row.riders.every((entry) => entry.placement === "split")),
    ).toBe(true);
  });

  it("keeps an assigned row and does not reshuffle the others around it", () => {
    const plan = planStartOrder(race(), [
      rider(4, "A"),
      rider(10, "A", 4),
      rider(11, "A"),
      rider(20, "A"),
      rider(21, "A"),
    ]);
    const rows = plan.rows.filter((row) => row.classes.includes("A"));
    expect(rows.map((row) => row.riders.map((entry) => entry.riderNumber))).toEqual([
      [4, 11],
      [20],
      [10, 21],
    ]);
    expect(rows[2]?.riders.find((entry) => entry.riderNumber === 10)?.placement).toBe(
      "assigned",
    );
    expect(rows[2]?.riders.find((entry) => entry.riderNumber === 21)?.placement).toBe(
      "split",
    );
    expect(plan.warnings).toEqual([]);
  });

  it("places a rider by number when the assigned row is not their class", () => {
    const plan = planStartOrder(race(), [rider(8, "A", 5), rider(9, "A")]);
    expect(plan.warnings).toEqual([
      {
        code: "start_row_out_of_range",
        riderNumber: 8,
        startRow: 5,
        classRowNumbers: [2, 3, 4],
      },
    ]);
    const numbers = plan.rows
      .filter((row) => row.classes.includes("A"))
      .map((row) => row.riders.map((entry) => entry.riderNumber));
    expect(numbers).toEqual([[8], [9], []]);
    expect(plan.rows[1]?.riders[0]?.ignoredStartRow).toBe(5);
  });
});
