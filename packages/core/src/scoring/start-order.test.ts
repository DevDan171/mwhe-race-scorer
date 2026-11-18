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
  row: number | null = null,
  registeredAt: string | null = null,
  raceId = "race",
): EventRegistration {
  return {
    riderNumber,
    name: `Rider ${riderNumber}`,
    class: riderClass,
    seriesId: null,
    registeredAt,
    assignedRows: row === null ? [] : [{ raceId, row }],
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

  it("splits unassigned riders by registration time, earliest row first", () => {
    const plan = planStartOrder(race(), [
      rider(4, "A", null, "2026-07-05T00:00:00.000Z"),
      rider(21, "A", null, "2026-07-01T00:00:00.000Z"),
      rider(10, "A", null, "2026-07-03T00:00:00.000Z"),
      rider(11, "A", null, "2026-07-02T00:00:00.000Z"),
      rider(20, "A", null, "2026-07-04T00:00:00.000Z"),
    ]);
    const rows = plan.rows.filter((row) => row.classes.includes("A"));
    expect(rows.map((row) => row.riders.map((entry) => entry.riderNumber))).toEqual([
      [21, 11],
      [10, 20],
      [4],
    ]);
    expect(
      rows.every((row) => row.riders.every((entry) => entry.placement === "split")),
    ).toBe(true);
  });

  it("breaks a registration-time tie by the lower rider number", () => {
    const plan = planStartOrder(race(), [
      rider(40, "A", null, "2026-07-01T00:00:00.000Z"),
      rider(8, "A", null, "2026-07-01T00:00:00.000Z"),
      rider(12, "A", null, null),
    ]);
    const numbers = plan.rows
      .filter((row) => row.classes.includes("A"))
      .map((row) => row.riders.map((entry) => entry.riderNumber));
    expect(numbers).toEqual([[8], [40], [12]]);
  });

  it("keeps an assigned row and does not reshuffle the others around it", () => {
    const plan = planStartOrder(race(), [
      rider(4, "A", null, "2026-07-01T00:00:00.000Z"),
      rider(10, "A", 4, "2026-07-02T00:00:00.000Z"),
      rider(11, "A", null, "2026-07-03T00:00:00.000Z"),
      rider(20, "A", null, "2026-07-04T00:00:00.000Z"),
      rider(21, "A", null, "2026-07-05T00:00:00.000Z"),
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

  it("ignores a start row that belongs to a different race", () => {
    const plan = planStartOrder(race(), [
      rider(8, "A", 4, "2026-07-01T00:00:00.000Z", "other-race"),
      rider(9, "A", null, "2026-07-02T00:00:00.000Z"),
    ]);
    expect(plan.warnings).toEqual([]);
    const numbers = plan.rows
      .filter((row) => row.classes.includes("A"))
      .map((row) => row.riders.map((entry) => entry.riderNumber));
    expect(numbers).toEqual([[8], [9], []]);
  });

  it("places a rider by registration time when the assigned row is not their class", () => {
    const plan = planStartOrder(race(), [
      rider(8, "A", 5, "2026-07-02T00:00:00.000Z"),
      rider(9, "A", null, "2026-07-01T00:00:00.000Z"),
    ]);
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
    expect(numbers).toEqual([[9], [8], []]);
    expect(plan.rows[1]?.riders[0]?.ignoredStartRow).toBeNull();
    expect(plan.rows[2]?.riders[0]?.ignoredStartRow).toBe(5);
  });
});
