import { z } from "zod";

import { RIDER_CLASSES } from "../classes.js";
import { riderNumberSchema, schemaVersionSchema, uniqueField } from "./common.js";

export const riderClassSchema = z.enum(RIDER_CLASSES);

export const checkSchema = z.strictObject({
  id: z.string().min(1),
  order: z.number().int().positive(),
  name: z.string().min(1),
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
export type Event = z.infer<typeof eventSchema>;
export type SeriesRider = z.infer<typeof seriesRiderSchema>;
export type EventRegistration = z.infer<typeof eventRegistrationSchema>;
export type RacePackage = z.infer<typeof racePackageSchema>;
