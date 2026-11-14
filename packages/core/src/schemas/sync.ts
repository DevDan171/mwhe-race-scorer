import { z } from "zod";

import { SCHEMA_VERSION } from "../version.js";
import { isoTimestampSchema, riderNumberSchema, schemaVersionSchema } from "./common.js";
import { punchSchema, type Punch } from "./punch.js";
import { phoneRosterRiderSchema } from "./rider.js";

/** Station -> laptop. The phone pushes the punches it holds. */
export const pushPunchesMessageSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("push_punches"),
  deviceId: z.string().min(1),
  eventId: z.string().min(1),
  sentAt: isoTimestampSchema,
  punches: z.array(punchSchema),
});

/**
 * Laptop -> station. Versioned roster delta. Apply in order: `version`
 * must be the station's current roster version + 1.
 */
export const rosterDeltaMessageSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    type: z.literal("roster_delta"),
    eventId: z.string().min(1),
    version: z.number().int().positive(),
    baseVersion: z.number().int().nonnegative(),
    upserts: z.array(phoneRosterRiderSchema),
    removals: z.array(riderNumberSchema),
  })
  .superRefine((delta, ctx) => {
    const upserts = new Set<number>();
    delta.upserts.forEach((rider, index) => {
      if (upserts.has(rider.number)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate rider number in roster upserts",
          path: ["upserts", index],
          input: delta,
        });
      }
      upserts.add(rider.number);
    });
    const removals = new Set<number>();
    delta.removals.forEach((riderNumber, index) => {
      if (removals.has(riderNumber)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate rider number in roster removals",
          path: ["removals", index],
          input: delta,
        });
      }
      removals.add(riderNumber);
      if (upserts.has(riderNumber)) {
        ctx.addIssue({
          code: "custom",
          message: "A rider cannot be upserted and removed in the same delta",
          path: ["removals", index],
          input: delta,
        });
      }
    });
  });

/**
 * One punch inside a QR frame. `checkId` and `deviceId` live on the frame
 * because a station is locked to one check.
 */
export const qrPunchSchema = z.strictObject({
  uuid: z.uuid(),
  riderNumber: riderNumberSchema,
  timestamp: isoTimestampSchema,
  createdAt: isoTimestampSchema,
  voided: z.boolean(),
});

/**
 * QR export/import for a station that cannot reach the laptop. Large captures
 * split across `part` / `parts`. Chunking and reassembly are a later phase;
 * this is the frame format.
 */
export const qrCheckpointExportSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    type: z.literal("qr_checkpoint_export"),
    eventId: z.string().min(1),
    checkId: z.string().min(1),
    deviceId: z.string().min(1),
    exportedAt: isoTimestampSchema,
    part: z.number().int().positive(),
    parts: z.number().int().positive(),
    punches: z.array(qrPunchSchema),
  })
  .superRefine((frame, ctx) => {
    if (frame.part > frame.parts) {
      ctx.addIssue({
        code: "custom",
        message: "QR part cannot be greater than parts",
        path: ["part"],
        input: frame,
      });
    }
  });

export const syncMessageSchema = z.discriminatedUnion("type", [
  pushPunchesMessageSchema,
  rosterDeltaMessageSchema,
  qrCheckpointExportSchema,
]);

export type PushPunchesMessage = z.infer<typeof pushPunchesMessageSchema>;
export type RosterDeltaMessage = z.infer<typeof rosterDeltaMessageSchema>;
export type QrPunch = z.infer<typeof qrPunchSchema>;
export type QrCheckpointExport = z.infer<typeof qrCheckpointExportSchema>;
export type SyncMessage = z.infer<typeof syncMessageSchema>;

/** Expand a QR frame into full punches the laptop can store. */
export function importQrCheckpointExport(frame: QrCheckpointExport): Punch[] {
  const parsed = qrCheckpointExportSchema.parse(frame);
  return parsed.punches.map((punch) =>
    punchSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      uuid: punch.uuid,
      checkId: parsed.checkId,
      deviceId: parsed.deviceId,
      riderNumber: punch.riderNumber,
      timestamp: punch.timestamp,
      createdAt: punch.createdAt,
      voided: punch.voided,
    }),
  );
}
