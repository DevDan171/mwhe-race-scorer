import { z } from "zod";

import { SCHEMA_VERSION } from "../version.js";
import { isoTimestampSchema, schemaVersionSchema } from "./common.js";

export const changelogActionSchema = z.enum(["add", "delete", "change"]);

export const changelogEntitySchema = z.strictObject({
  type: z.enum([
    "punch",
    "start_time",
    "penalty",
    "registration",
    "disqualification",
    "result",
  ]),
  id: z.string().min(1),
});

/**
 * Every manual add, delete, or change on the laptop writes one of these.
 * `before` is null on add. `after` is null on delete.
 */
export const changelogEntrySchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: z.uuid(),
  who: z.string().min(1),
  when: isoTimestampSchema,
  entity: changelogEntitySchema,
  action: changelogActionSchema,
  before: z.unknown(),
  after: z.unknown(),
  why: z.string().min(1),
});

export type ChangelogAction = z.infer<typeof changelogActionSchema>;
export type ChangelogEntity = z.infer<typeof changelogEntitySchema>;
export type ChangelogEntry = z.infer<typeof changelogEntrySchema>;

export function createChangelogEntry(
  entry: Omit<ChangelogEntry, "schemaVersion">,
): ChangelogEntry {
  return changelogEntrySchema.parse({
    ...entry,
    schemaVersion: SCHEMA_VERSION,
  });
}
