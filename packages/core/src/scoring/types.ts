import { z } from "zod";

import { disqualificationSchema, penaltySchema } from "../schemas/penalty.js";
import { punchSchema } from "../schemas/punch.js";
import { racePackageSchema } from "../schemas/race-package.js";
import { resultsPublicationStatusSchema } from "../schemas/results.js";
import { riderStartSchema, rowStartSchema } from "../schemas/starts.js";
import { startTimeSchema } from "../schemas/start-time.js";
import { isoTimestampSchema, schemaVersionSchema } from "../schemas/common.js";
import { DEFAULT_MIN_PASS_GAP_MS } from "../sync/defaults.js";

export const scoreRaceInputSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  race: racePackageSchema,
  punches: z.array(punchSchema),
  startTimes: z.array(startTimeSchema),
  /** "Row N go" taps. Missing on older score calls. */
  rowStarts: z.array(rowStartSchema).default([]),
  /** Late starters and wrong-row riders keyed at the start station. */
  riderStarts: z.array(riderStartSchema).default([]),
  /** Gap under which a repeat pass of the same check is flagged. */
  minPassGapMs: z.number().int().nonnegative().default(DEFAULT_MIN_PASS_GAP_MS),
  penalties: z.array(penaltySchema),
  disqualifications: z.array(disqualificationSchema),
  resultsVersion: z.number().int().positive(),
  resultsStatus: resultsPublicationStatusSchema,
  publishedAt: isoTimestampSchema,
});

export type ScoreRaceInput = z.infer<typeof scoreRaceInputSchema>;

export type ScoringWarning =
  | { code: "duplicate_punch_uuid"; uuid: string }
  | { code: "duplicate_start_time"; riderNumber: number }
  | { code: "duplicate_row_start"; row: number }
  | { code: "duplicate_rider_start"; riderNumber: number }
  | { code: "pass_too_soon"; riderNumber: number; uuid: string; checkId: string }
  | { code: "pass_out_of_order"; riderNumber: number; uuid: string; checkId: string }
  | { code: "duplicate_disqualification"; riderNumber: number }
  | { code: "missing_start_time"; riderNumber: number; punchCount: number }
  | { code: "punch_before_start"; riderNumber: number; uuid: string }
  | { code: "unknown_check"; riderNumber: number; checkId: string; uuid: string }
  | {
      code: "unknown_check_penalty";
      riderNumber: number;
      penaltyId: string;
      checkId: string;
    }
  | {
      code: "penalty_without_punch";
      riderNumber: number;
      penaltyId: string;
      checkId: string;
    }
  | { code: "disqualification_unknown_rider"; riderNumber: number }
  | {
      code: "start_row_out_of_range";
      riderNumber: number;
      startRow: number;
      classRowNumbers: number[];
    };
