import { z } from "zod";

import { PROTEST_WINDOW_MINUTES } from "../version.js";
import { riderNumberSchema, schemaVersionSchema } from "./common.js";
import { riderClassSchema } from "./race-package.js";

export const resultStatusSchema = z.enum(["finished", "DNF", "DQ"]);

export const resultsPublicationStatusSchema = z.enum(["provisional", "official"]);

export const checkResultSchema = z.strictObject({
  checkId: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().positive(),
  cumulativeSeconds: z.number(),
  segmentSeconds: z.number(),
  /** Punch is after start + the event time limit. Shown, not scored. */
  overLimit: z.boolean(),
  countsForScore: z.boolean(),
  /** Check-scoped penalties attached to this check, in seconds. */
  penaltySeconds: z.number().int().nonnegative(),
});

export const resultRowSchema = z.strictObject({
  name: z.string().min(1),
  number: riderNumberSchema,
  class: riderClassSchema.nullable(),
  /** True when the number was punched but is not on the event roster. */
  unknown: z.boolean(),
  /** Distinct in-limit checks. Over-limit punches are not included. */
  checks: z.number().int().nonnegative(),
  /** Last in-limit punch minus start. Null when there is no scored punch. */
  elapsedSeconds: z.number().nullable(),
  penaltySeconds: z.number().int().nonnegative(),
  overallPenaltySeconds: z.number().int().nonnegative(),
  /** Elapsed plus every penalty. Null when elapsed is null. */
  totalTimeSeconds: z.number().nullable(),
  checkResults: z.array(checkResultSchema),
  positionInClass: z.number().int().positive().nullable(),
  positionOverall: z.number().int().positive().nullable(),
  status: resultStatusSchema,
});

/**
 * Published to MidwestHardEnduro.com. `version` increments on every
 * republish. Status stays `provisional` until the protest window closes,
 * then the laptop publishes `official`.
 */
export const resultsPayloadSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  eventId: z.string().min(1),
  version: z.number().int().positive(),
  status: resultsPublicationStatusSchema,
  publishedAt: z.iso.datetime({ offset: true }),
  protestWindowMinutes: z.literal(PROTEST_WINDOW_MINUTES),
  rows: z.array(resultRowSchema),
});

export type ResultStatus = z.infer<typeof resultStatusSchema>;
export type ResultsPublicationStatus = z.infer<typeof resultsPublicationStatusSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type ResultRow = z.infer<typeof resultRowSchema>;
export type ResultsPayload = z.infer<typeof resultsPayloadSchema>;
