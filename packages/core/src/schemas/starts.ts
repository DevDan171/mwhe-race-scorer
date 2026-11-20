import { z } from "zod";

import { isoTimestampSchema, riderNumberSchema, schemaVersionSchema } from "./common.js";
import { riderClassSchema } from "./race-package.js";

/** What a phone is locked to when it is paired. */
export const stationRoleSchema = z.enum(["start", "check", "finish"]);

export type StationRole = z.infer<typeof stationRoleSchema>;

/** Start-row label sent to a phone. No rider PII. */
export const startRowBriefSchema = z.strictObject({
  order: z.number().int().positive(),
  label: z.string().min(1),
  classes: z.array(riderClassSchema).min(1),
});

export type StartRowBrief = z.infer<typeof startRowBriefSchema>;

/**
 * One tap of "Row N go". The timestamp is the phone's clock. A voided copy
 * wins, same as a punch. `source: "laptop"` is a hand edit and beats a
 * station tap for that row.
 */
export const rowStartSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  uuid: z.uuid(),
  eventId: z.string().min(1).optional(),
  raceId: z.string().min(1).optional(),
  row: z.number().int().positive(),
  timestamp: isoTimestampSchema,
  createdAt: isoTimestampSchema,
  voided: z.boolean(),
  deviceId: z.string().min(1),
  clockOffsetMs: z.number().int().optional(),
  source: z.enum(["station", "laptop"]).optional(),
});

export type RowStart = z.infer<typeof rowStartSchema>;

/**
 * A late starter or a rider sent on the wrong row. Overrides that rider's
 * row clock. A hand-entered start on the laptop still beats this.
 */
export const riderStartSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  uuid: z.uuid(),
  eventId: z.string().min(1).optional(),
  raceId: z.string().min(1).optional(),
  riderNumber: riderNumberSchema,
  timestamp: isoTimestampSchema,
  createdAt: isoTimestampSchema,
  voided: z.boolean(),
  deviceId: z.string().min(1),
  clockOffsetMs: z.number().int().optional(),
  unknownNumber: z.boolean().optional(),
});

export type RiderStart = z.infer<typeof riderStartSchema>;
