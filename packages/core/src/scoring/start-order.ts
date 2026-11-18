import type { RiderClass } from "../classes.js";
import type { EventRegistration, Race } from "../schemas/race-package.js";

/**
 * Who leaves on each start row, and when that row's clock starts.
 *
 * Row numbers run across the whole race. Row 1 leaves at `plannedStart`.
 * Row N leaves `(N - 1) * rowGapSeconds` later, even when a number is
 * missing in between. A class can occupy several of those rows.
 *
 * A registration `startRow` is that race-wide number. It is used when that
 * row includes the rider's class. Otherwise the rider is placed by number:
 * unassigned riders in the class are sorted by rider number and split into
 * contiguous blocks, one block per row of that class, as evenly as possible.
 * Earlier rows get the extra rider. The lowest numbers go on the earliest
 * row. Assigned riders are not part of that split, so giving one person a
 * row does not reshuffle everyone else. Inside a row, riders line up by
 * number.
 */
export interface PlannedRider {
  riderNumber: number;
  name: string;
  class: RiderClass;
  /** Race-wide row number. */
  rowNumber: number;
  /** 1-based index among this class's rows, in start order. */
  classRow: number;
  placement: "assigned" | "split";
  /** Set when the site named a row that is not one of this class's rows. */
  ignoredStartRow: number | null;
}

export interface PlannedRow {
  id: string;
  rowNumber: number;
  label: string;
  classes: RiderClass[];
  /** ISO time, or null when the race has no planned start. */
  startedAt: string | null;
  riders: PlannedRider[];
}

export interface StartRowWarning {
  code: "start_row_out_of_range";
  riderNumber: number;
  startRow: number;
  classRowNumbers: number[];
}

export interface StartPlan {
  rows: PlannedRow[];
  warnings: StartRowWarning[];
}

export function planStartOrder(
  race: Race,
  registrations: readonly EventRegistration[],
): StartPlan {
  const ordered = [...race.startRows].sort((a, b) => a.order - b.order);
  const ridersByRow = new Map<string, PlannedRider[]>(ordered.map((row) => [row.id, []]));
  const warnings: StartRowWarning[] = [];
  const classes: RiderClass[] = [];
  for (const row of ordered) {
    for (const riderClass of row.classes) {
      if (!classes.includes(riderClass)) classes.push(riderClass);
    }
  }

  for (const riderClass of classes) {
    const classRows = ordered.filter((row) => row.classes.includes(riderClass));
    const classRowNumbers = classRows.map((row) => row.order);
    const riders = registrations
      .filter((registration) => registration.class === riderClass)
      .sort((a, b) => a.riderNumber - b.riderNumber);
    const assigned = new Map<number, EventRegistration[]>();
    const unassigned: EventRegistration[] = [];

    for (const registration of riders) {
      const startRow = registration.startRow;
      if (startRow !== null && classRowNumbers.includes(startRow)) {
        const group = assigned.get(startRow) ?? [];
        group.push(registration);
        assigned.set(startRow, group);
        continue;
      }
      if (startRow !== null) {
        warnings.push({
          code: "start_row_out_of_range",
          riderNumber: registration.riderNumber,
          startRow,
          classRowNumbers,
        });
      }
      unassigned.push(registration);
    }

    const counts = splitCounts(unassigned.length, classRows.length);
    let cursor = 0;
    classRows.forEach((row, index) => {
      const count = counts[index] ?? 0;
      const block = unassigned.slice(cursor, cursor + count);
      cursor += count;
      const classRow = index + 1;
      const placed = [
        ...block.map((registration) =>
          plannedRider(registration, row.order, classRow, "split", registration.startRow),
        ),
        ...(assigned.get(row.order) ?? []).map((registration) =>
          plannedRider(registration, row.order, classRow, "assigned", null),
        ),
      ];
      ridersByRow.get(row.id)?.push(...placed);
    });
  }

  warnings.sort((a, b) => a.riderNumber - b.riderNumber);
  return {
    warnings,
    rows: ordered.map((row) => ({
      id: row.id,
      rowNumber: row.order,
      label: row.label,
      classes: [...row.classes],
      startedAt: rowStartedAt(race.plannedStart, row.order, race.rowGapSeconds),
      riders: (ridersByRow.get(row.id) ?? []).sort(
        (a, b) => a.riderNumber - b.riderNumber,
      ),
    })),
  };
}

/** Row N leaves at the planned start plus the gap times (N - 1). */
export function rowStartedAt(
  plannedStart: string | null,
  rowNumber: number,
  rowGapSeconds: number,
): string | null {
  if (plannedStart === null) return null;
  const ms = Date.parse(plannedStart) + (rowNumber - 1) * rowGapSeconds * 1000;
  return new Date(ms).toISOString();
}

function splitCounts(riderCount: number, rowCount: number): number[] {
  if (rowCount <= 0) return [];
  const base = Math.floor(riderCount / rowCount);
  const extra = riderCount % rowCount;
  return Array.from({ length: rowCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function plannedRider(
  registration: EventRegistration,
  rowNumber: number,
  classRow: number,
  placement: PlannedRider["placement"],
  ignoredStartRow: number | null,
): PlannedRider {
  return {
    riderNumber: registration.riderNumber,
    name: registration.name,
    class: registration.class,
    rowNumber,
    classRow,
    placement,
    ignoredStartRow: placement === "split" ? ignoredStartRow : null,
  };
}
