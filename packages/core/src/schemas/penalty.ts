import { z } from "zod";

import { isoTimestampSchema, riderNumberSchema, schemaVersionSchema } from "./common.js";

export const penaltyScopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("overall") }),
  z.strictObject({
    type: z.literal("check"),
    checkId: z.string().min(1),
  }),
]);

export const appliedBySchema = z.enum(["race_director", "admin"]);

/** Time penalty in whole seconds, either on one check or on the whole race. */
export const penaltySchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: z.uuid(),
  riderNumber: riderNumberSchema,
  seconds: z.number().int().positive(),
  scope: penaltyScopeSchema,
  appliedBy: appliedBySchema,
  reason: z.string().min(1),
  createdAt: isoTimestampSchema,
});

/**
 * DQ is manual. The race director (or an admin) sets it; scoring never
 * infers a DQ from punches or the time limit.
 */
export const disqualificationSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  riderNumber: riderNumberSchema,
  reason: z.string().min(1),
  appliedBy: appliedBySchema,
  createdAt: isoTimestampSchema,
});

export type PenaltyScope = z.infer<typeof penaltyScopeSchema>;
export type AppliedBy = z.infer<typeof appliedBySchema>;
export type Penalty = z.infer<typeof penaltySchema>;
export type Disqualification = z.infer<typeof disqualificationSchema>;
