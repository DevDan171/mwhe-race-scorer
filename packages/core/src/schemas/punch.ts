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
});

export type Punch = z.infer<typeof punchSchema>;
