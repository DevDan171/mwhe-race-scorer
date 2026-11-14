import { z } from "zod";

import { riderNumberSchema, schemaVersionSchema, uniqueField } from "./common.js";
import { riderClassSchema } from "./race-package.js";

/**
 * The only rider fields a checkpoint phone is allowed to hold. Extra keys
 * are rejected so series ids and contact data never land on a station.
 */
export const phoneRosterRiderSchema = z.strictObject({
  name: z.string().min(1),
  number: riderNumberSchema,
  class: riderClassSchema,
});

export const phoneRosterSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    eventId: z.string().min(1),
    version: z.number().int().nonnegative(),
    riders: z.array(phoneRosterRiderSchema),
  })
  .superRefine((roster, ctx) => {
    uniqueField(
      roster.riders,
      (rider) => String(rider.number),
      ctx,
      "riders",
      "Roster rider numbers must be unique",
    );
  });

export type PhoneRosterRider = z.infer<typeof phoneRosterRiderSchema>;
export type PhoneRoster = z.infer<typeof phoneRosterSchema>;
