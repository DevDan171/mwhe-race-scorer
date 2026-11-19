import { z } from "zod";

import { RIDER_CLASSES } from "../classes.js";
import {
  isoTimestampSchema,
  riderNumberSchema,
  schemaVersionSchema,
  uniqueField,
} from "./common.js";

export const riderClassSchema = z.enum(RIDER_CLASSES);

export const checkSchema = z.strictObject({
  id: z.string().min(1),
  order: z.number().int().positive(),
  name: z.string().min(1),
});

export const startRowSchema = z.strictObject({
  id: z.string().min(1),
  /** Row number across the whole race, starting at 1. Not restarted per class. */
  order: z.number().int().positive(),
  label: z.string().min(1),
  classes: z.array(riderClassSchema),
});

/**
 * One choice per race. A timed race counts `minutes` from each row's own
 * start. A lap race has no time limit. `laps: null` means it runs until the
 * finish.
 */
export const raceLengthSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("time"),
    minutes: z.number().int().positive(),
  }),
  z.strictObject({
    mode: z.literal("laps"),
    laps: z.number().int().positive().nullable(),
  }),
]);

export type RaceLength = z.infer<typeof raceLengthSchema>;

export function sameRaceLength(a: RaceLength, b: RaceLength): boolean {
  if (a.mode === "time" && b.mode === "time") return a.minutes === b.minutes;
  if (a.mode === "laps" && b.mode === "laps") return a.laps === b.laps;
  return false;
}

/**
 * Older packages stored `timeLimitMinutes` and `laps` together. Scoring only
 * ever used the time limit, so those packages are read as a timed race. A
 * package that already has `length` keeps that and the old keys are dropped.
 */
function withLength(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record.length === undefined && typeof record.timeLimitMinutes === "number") {
    record.length = { mode: "time", minutes: record.timeLimitMinutes };
  }
  delete record.timeLimitMinutes;
  delete record.laps;
  return record;
}

const raceObjectSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    order: z.number().int().positive(),
    length: raceLengthSchema,
    checks: z.array(checkSchema).min(1),
    startRows: z.array(startRowSchema).min(1),
    /** Seconds between row numbers. Row N leaves this many times (N - 1) after row 1. */
    rowGapSeconds: z.number().int().nonnegative().default(0),
    /** When row 1 leaves. Null until the site or the laptop sets it. */
    plannedStart: isoTimestampSchema.nullable().default(null),
  })
  .superRefine((race, ctx) => {
    uniqueField(race.checks, (check) => check.id, ctx, "checks", "Duplicate check id");
    uniqueField(
      race.checks,
      (check) => String(check.order),
      ctx,
      "checks",
      "Duplicate check order",
    );
    uniqueField(
      race.startRows,
      (row) => row.id,
      ctx,
      "startRows",
      "Duplicate start row id",
    );
    uniqueField(
      race.startRows,
      (row) => String(row.order),
      ctx,
      "startRows",
      "Duplicate start row order",
    );
    race.startRows.forEach((row, rowIndex) => {
      const seen = new Set<string>();
      row.classes.forEach((riderClass, classIndex) => {
        if (seen.has(riderClass)) {
          ctx.addIssue({
            code: "custom",
            message: "A class is listed twice on the same start row",
            path: ["startRows", rowIndex, "classes", classIndex],
            input: race,
          });
        }
        seen.add(riderClass);
      });
    });
  });

/**
 * One race inside an event. Checks are the lap order. `startRows[].order` is
 * the row number across the whole race, so class A on rows 2, 3, and 4 is
 * three rows. The race with the lowest `order` is the course the scoring
 * engine reads from `event`.
 */
export const raceSchema = z.preprocess(withLength, raceObjectSchema);

const eventObjectSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Calendar date of the event, `YYYY-MM-DD`. */
    date: z.iso.date(),
    /** Same length as the primary race (lowest `order`). */
    length: raceLengthSchema,
    checks: z.array(checkSchema).min(1),
  })
  .superRefine((event, ctx) => {
    uniqueField(event.checks, (check) => check.id, ctx, "checks", "Duplicate check id");
    uniqueField(
      event.checks,
      (check) => String(check.order),
      ctx,
      "checks",
      "Duplicate check order",
    );
  });

export const eventSchema = z.preprocess(withLength, eventObjectSchema);

/**
 * A rider on the series master list. Numbers are unique across the whole
 * series, not just inside one class.
 */
export const seriesRiderSchema = z.strictObject({
  seriesId: z.string().min(1),
  name: z.string().min(1),
  number: riderNumberSchema,
  class: riderClassSchema,
});

/** A start row on one race. Row numbers are not shared across races. */
export const assignedRowSchema = z.strictObject({
  raceId: z.string().min(1),
  row: z.number().int().positive(),
});

/**
 * Someone entered in this event. `seriesId` is null for a day-of entry that
 * is not on the series list. `registeredAt` is when they signed up, used to
 * line up riders who were not given a start row. `assignedRows` is the
 * start row on each race. A row is per race, so an empty list means none
 * of the races assigned one.
 */
export const eventRegistrationSchema = z.strictObject({
  riderNumber: riderNumberSchema,
  name: z.string().min(1),
  class: riderClassSchema,
  seriesId: z.string().min(1).nullable(),
  registeredAt: isoTimestampSchema.nullable().default(null),
  assignedRows: z.array(assignedRowSchema).default([]),
});

/**
 * Downloaded from MidwestHardEnduro.com before the race. The laptop treats
 * this as the starting roster and course.
 *
 * schemaVersion stays 1. `length`, `rowGapSeconds`, `plannedStart`,
 * `registeredAt`, and `assignedRows` can be omitted. A class may be on more
 * than one row. Packages that still have `timeLimitMinutes` parse as a timed
 * race.
 */
export const racePackageSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    event: eventSchema,
    races: z.array(raceSchema).min(1),
    classes: z.array(riderClassSchema),
    riders: z.array(seriesRiderSchema),
    registrations: z.array(eventRegistrationSchema),
  })
  .superRefine((race, ctx) => {
    const expected = [...RIDER_CLASSES];
    const classesMatch =
      race.classes.length === expected.length &&
      expected.every((riderClass, index) => race.classes[index] === riderClass);
    if (!classesMatch) {
      ctx.addIssue({
        code: "custom",
        message: "classes must be the official MWHE class list in canonical order",
        path: ["classes"],
        input: race.classes,
      });
    }

    uniqueField(race.races, (entry) => entry.id, ctx, "races", "Duplicate race id");
    uniqueField(
      race.races,
      (entry) => String(entry.order),
      ctx,
      "races",
      "Duplicate race order",
    );

    const primary = primaryRace(race.races);
    if (!sameRaceLength(primary.length, race.event.length)) {
      ctx.addIssue({
        code: "custom",
        message: "event.length must match the length of the primary race (lowest order)",
        path: ["event", "length"],
        input: race,
      });
    }
    const checksMatch =
      primary.checks.length === race.event.checks.length &&
      primary.checks.every((check, index) => {
        const eventCheck = race.event.checks[index];
        return (
          eventCheck !== undefined &&
          check.id === eventCheck.id &&
          check.order === eventCheck.order &&
          check.name === eventCheck.name
        );
      });
    if (!checksMatch) {
      ctx.addIssue({
        code: "custom",
        message: "event.checks must match the checks of the primary race (lowest order)",
        path: ["event", "checks"],
        input: race,
      });
    }

    uniqueField(
      race.riders,
      (rider) => String(rider.number),
      ctx,
      "riders",
      "Rider numbers must be unique series-wide",
    );
    uniqueField(
      race.riders,
      (rider) => rider.seriesId,
      ctx,
      "riders",
      "Duplicate series id",
    );

    uniqueField(
      race.registrations,
      (registration) => String(registration.riderNumber),
      ctx,
      "registrations",
      "Duplicate event registration number",
    );

    const raceIds = new Set(race.races.map((entry) => entry.id));
    const seriesByNumber = new Map(race.riders.map((rider) => [rider.number, rider]));
    race.registrations.forEach((registration, index) => {
      const seenRaceIds = new Set<string>();
      registration.assignedRows.forEach((assignment, assignmentIndex) => {
        if (seenRaceIds.has(assignment.raceId)) {
          ctx.addIssue({
            code: "custom",
            message: "A rider can have only one start row on a race",
            path: ["registrations", index, "assignedRows", assignmentIndex],
            input: registration,
          });
        }
        seenRaceIds.add(assignment.raceId);
        if (!raceIds.has(assignment.raceId)) {
          ctx.addIssue({
            code: "custom",
            message: "Assigned start row names a race that is not in this package",
            path: ["registrations", index, "assignedRows", assignmentIndex, "raceId"],
            input: registration,
          });
        }
      });
      const seriesRider = seriesByNumber.get(registration.riderNumber);
      if (registration.seriesId === null) {
        if (seriesRider) {
          ctx.addIssue({
            code: "custom",
            message:
              "A day-of registration cannot use a number that already belongs to a series rider",
            path: ["registrations", index, "riderNumber"],
            input: registration,
          });
        }
        return;
      }
      if (!seriesRider || seriesRider.seriesId !== registration.seriesId) {
        ctx.addIssue({
          code: "custom",
          message:
            "Registration seriesId does not match the series rider with this number",
          path: ["registrations", index, "seriesId"],
          input: registration,
        });
      }
    });
  });

export type Check = z.infer<typeof checkSchema>;
export type StartRow = z.infer<typeof startRowSchema>;
export type Race = z.infer<typeof raceSchema>;
export type Event = z.infer<typeof eventSchema>;
export type SeriesRider = z.infer<typeof seriesRiderSchema>;
export type AssignedRow = z.infer<typeof assignedRowSchema>;
export type EventRegistration = z.infer<typeof eventRegistrationSchema>;
export type RacePackage = z.infer<typeof racePackageSchema>;

/** The race with the lowest `order`. Scoring reads this course from `event`. */
export function primaryRace(races: readonly Race[]): Race {
  const first = races[0];
  if (!first) throw new Error("A race package needs a race");
  return races.reduce((best, entry) => (entry.order < best.order ? entry : best), first);
}

/** One race that mirrors the event course. Scoring fixtures use this. */
export function defaultRace(event: Event): Race {
  return {
    id: `${event.id}:race`,
    name: event.name,
    order: 1,
    length: event.length,
    checks: event.checks.map((check) => ({ ...check })),
    startRows: [
      {
        id: `${event.id}:row-1`,
        order: 1,
        label: "Row 1",
        classes: [...RIDER_CLASSES],
      },
    ],
    rowGapSeconds: 0,
    plannedStart: null,
  };
}
