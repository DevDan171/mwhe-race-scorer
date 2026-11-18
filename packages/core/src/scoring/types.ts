import { z } from "zod";

import { disqualificationSchema, penaltySchema } from "../schemas/penalty.js";
import { punchSchema } from "../schemas/punch.js";
import { racePackageSchema } from "../schemas/race-package.js";
import { resultsPublicationStatusSchema } from "../schemas/results.js";
import { startTimeSchema } from "../schemas/start-time.js";
import { isoTimestampSchema, schemaVersionSchema } from "../schemas/common.js";

export const scoreRaceInputSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  race: racePackageSchema,
  punches: z.array(punchSchema),
  startTimes: z.array(startTimeSchema),
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
