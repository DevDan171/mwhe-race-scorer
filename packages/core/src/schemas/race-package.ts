import { z } from "zod";

import { RIDER_CLASSES } from "../classes.js";
import { riderNumberSchema, schemaVersionSchema, uniqueField } from "./common.js";

export const riderClassSchema = z.enum(RIDER_CLASSES);

export const checkSchema = z.strictObject({
  id: z.string().min(1),
  order: z.number().int().positive(),
  name: z.string().min(1),
});

export const startRowSchema = z.strictObject({
  id: z.string().min(1),
  order: z.number().int().positive(),
  label: z.string().min(1),
  classes: z.array(riderClassSchema),
});

/**
 * One race inside an event. Checks are the lap order; `laps` is how many
 * times that list is ridden. The race with the lowest `order` is the course
 * the scoring engine reads from `event`.
 */
export const raceSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    order: z.number().int().positive(),
    timeLimitMinutes: z.number().int().positive(),
    laps: z.number().int().positive(),
    checks: z.array(checkSchema).min(1),
    startRows: z.array(startRowSchema).min(1),
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
    const seenClasses = new Set<string>();
    race.startRows.forEach((row, rowIndex) => {
      row.classes.forEach((riderClass, classIndex) => {
        if (seenClasses.has(riderClass)) {
          ctx.addIssue({
            code: "custom",
            message: "A class can only be on one start row in a race",
            path: ["startRows", rowIndex, "classes", classIndex],
            input: race,
          });
        }
        seenClasses.add(riderClass);
      });
    });
  });

export const eventSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Calendar date of the event, `YYYY-MM-DD`. */
    date: z.iso.date(),
    timeLimitMinutes: z.number().int().positive(),
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

/**
 * Someone entered in this event. `seriesId` is null for a day-of entry that
 * is not on the series list. The name and class here are what the phone
 * roster and the results use for the day.
 */
export const eventRegistrationSchema = z.strictObject({
  riderNumber: riderNumberSchema,
  name: z.string().min(1),
  class: riderClassSchema,
  seriesId: z.string().min(1).nullable(),
});

/**
 * Downloaded from MidwestHardEnduro.com before the race. The laptop treats
 * this as the starting roster and course.
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

    const primary = race.races.reduce((best, entry) =>
      entry.order < best.order ? entry : best,
    );
    if (primary.timeLimitMinutes !== race.event.timeLimitMinutes) {
      ctx.addIssue({
        code: "custom",
        message:
          "event.timeLimitMinutes must match the time limit of the primary race (lowest order)",
        path: ["event", "timeLimitMinutes"],
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

    const seriesByNumber = new Map(race.riders.map((rider) => [rider.number, rider]));
    race.registrations.forEach((registration, index) => {
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
export type EventRegistration = z.infer<typeof eventRegistrationSchema>;
export type RacePackage = z.infer<typeof racePackageSchema>;

/** One race that mirrors the event course. Scoring fixtures use this. */
export function defaultRace(event: Event): Race {
  return {
    id: `${event.id}:race`,
    name: event.name,
    order: 1,
    timeLimitMinutes: event.timeLimitMinutes,
    laps: 1,
    checks: event.checks.map((check) => ({ ...check })),
    startRows: [
      {
        id: `${event.id}:row-1`,
        order: 1,
        label: "Row 1",
        classes: [...RIDER_CLASSES],
      },
    ],
  };
}
