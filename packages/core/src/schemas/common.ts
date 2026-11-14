import { z } from "zod";

import { SCHEMA_VERSION } from "../version.js";

export const schemaVersionSchema = z.literal(SCHEMA_VERSION);

/** Device clock timestamp. Phones are set from GPS; there is no central clock. */
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const riderNumberSchema = z.number().int().positive();

export function uniqueField<T>(
  items: readonly T[],
  key: (item: T) => string,
  ctx: z.RefinementCtx,
  path: string,
  message: string,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const value = key(item);
    if (seen.has(value)) {
      ctx.addIssue({
        code: "custom",
        message,
        path: [path, index],
        input: items,
      });
      return;
    }
    seen.add(value);
  });
}
