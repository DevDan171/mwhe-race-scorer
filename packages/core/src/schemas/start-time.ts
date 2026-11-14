import { z } from "zod";

import { isoTimestampSchema, riderNumberSchema, schemaVersionSchema } from "./common.js";

/** Per-rider start, edited on the laptop. There is no shared start clock. */
export const startTimeSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  riderNumber: riderNumberSchema,
  startedAt: isoTimestampSchema,
});

export type StartTime = z.infer<typeof startTimeSchema>;
