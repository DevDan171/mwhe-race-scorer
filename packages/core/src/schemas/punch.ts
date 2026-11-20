import { z } from "zod";

import { isoTimestampSchema, riderNumberSchema, schemaVersionSchema } from "./common.js";

/**
 * One checkpoint hit from a station phone.
 *
 * `checkId` is chosen when the station is set up and then locked.
 * `timestamp` comes from that phone's GPS-set clock. A rider number that is
 * not on the roster is still a valid punch; scoring flags it UNKNOWN.
 */
export const punchSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  uuid: z.uuid(),
  checkId: z.string().min(1),
  deviceId: z.string().min(1),
  riderNumber: riderNumberSchema,
  timestamp: isoTimestampSchema,
  createdAt: isoTimestampSchema,
  voided: z.boolean(),
  /**
   * Locked at station setup. Optional so a paper punch entered before this
   * field existed, and the Phase 0 fixtures, still parse.
   */
  eventId: z.string().min(1).optional(),
  raceId: z.string().min(1).optional(),
  /**
   * Phone clock minus laptop clock, in milliseconds, at the moment this punch
   * was saved. Positive means the phone was ahead. Paper punches omit it.
   */
  clockOffsetMs: z.number().int().optional(),
  /** True when the station roster did not contain this number. Never blocks the save. */
  unknownNumber: z.boolean().optional(),
});

export type Punch = z.infer<typeof punchSchema>;
