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
  raceId: z.string().min(1).optional(),
  checkId: z.string().min(1).optional(),
  appVersion: z.string().min(1).optional(),
  batteryPercent: z.number().int().min(0).max(100).nullable().optional(),
  rosterVersion: z.number().int().nonnegative().optional(),
  deviceNow: isoTimestampSchema.optional(),
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
  clockOffsetMs: z.number().int().optional(),
  unknownNumber: z.boolean().optional(),
});

/**
 * QR export/import for a station that cannot reach the laptop. Large captures
 * split across `part` / `parts`. `encodeCheckpointQr` splits a capture and
 * `assembleCheckpointFrames` stitches it back together.
 */
export const qrCheckpointExportSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    type: z.literal("qr_checkpoint_export"),
    eventId: z.string().min(1),
    raceId: z.string().min(1).optional(),
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

/** Laptop screen -> phone camera. One secret, one phone, one check. */
export const stationPairingSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("station_pairing"),
  hubUrl: z.string().min(1),
  eventId: z.string().min(1),
  eventName: z.string().min(1),
  raceId: z.string().min(1),
  raceName: z.string().min(1),
  checkId: z.string().min(1),
  checkName: z.string().min(1),
  pairingSecret: z.string().regex(/^[0-9a-f]{64}$/),
  laptopNow: isoTimestampSchema,
  hubVersion: z.string().min(1),
  clockOffsetWarnMs: z.number().int().nonnegative(),
});

/** Phone -> laptop, after the QR scan. Bearer token is the pairing secret. */
export const stationHelloSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("station_hello"),
  deviceId: z.string().min(1),
  eventId: z.string().min(1),
  raceId: z.string().min(1),
  checkId: z.string().min(1),
  appVersion: z.string().min(1),
  deviceNow: isoTimestampSchema,
  batteryPercent: z.number().int().min(0).max(100).nullable().optional(),
  rosterVersion: z.number().int().nonnegative(),
});

export const versionBlockReasonSchema = z.enum(["app_version_mismatch"]);

export const stationHelloAckSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("station_hello_ack"),
  laptopNow: isoTimestampSchema,
  clockOffsetMs: z.number().int(),
  goLiveAllowed: z.boolean(),
  reason: versionBlockReasonSchema.nullable(),
  hubVersion: z.string().min(1),
  rosterDeltas: z.array(rosterDeltaMessageSchema),
  clockOffsetWarnMs: z.number().int().nonnegative(),
});

export const syncResultSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("sync_result"),
  laptopNow: isoTimestampSchema,
  clockOffsetMs: z.number().int(),
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  voidsApplied: z.number().int().nonnegative(),
  rosterDeltas: z.array(rosterDeltaMessageSchema),
  goLiveAllowed: z.boolean(),
  hubVersion: z.string().min(1),
  reason: versionBlockReasonSchema.nullable(),
  clockOffsetWarnMs: z.number().int().nonnegative(),
});

export const rosterSyncSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("roster_sync"),
  laptopNow: isoTimestampSchema,
  rosterDeltas: z.array(rosterDeltaMessageSchema),
});

export const syncErrorSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  type: z.literal("sync_error"),
  error: z.enum(["unauthorized", "bad_request", "conflict"]),
  message: z.string().min(1),
});

/** Roster deltas for a phone that cannot reach the laptop. */
export const qrRosterExportSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    type: z.literal("qr_roster_export"),
    eventId: z.string().min(1),
    exportedAt: isoTimestampSchema,
    part: z.number().int().positive(),
    parts: z.number().int().positive(),
    deltas: z.array(rosterDeltaMessageSchema),
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
  stationPairingSchema,
  stationHelloSchema,
  stationHelloAckSchema,
  syncResultSchema,
  rosterSyncSchema,
  syncErrorSchema,
  qrRosterExportSchema,
]);

export type PushPunchesMessage = z.infer<typeof pushPunchesMessageSchema>;
export type RosterDeltaMessage = z.infer<typeof rosterDeltaMessageSchema>;
export type QrPunch = z.infer<typeof qrPunchSchema>;
export type QrCheckpointExport = z.infer<typeof qrCheckpointExportSchema>;
export type StationPairing = z.infer<typeof stationPairingSchema>;
export type StationHello = z.infer<typeof stationHelloSchema>;
export type StationHelloAck = z.infer<typeof stationHelloAckSchema>;
export type SyncResult = z.infer<typeof syncResultSchema>;
export type RosterSync = z.infer<typeof rosterSyncSchema>;
export type SyncError = z.infer<typeof syncErrorSchema>;
export type QrRosterExport = z.infer<typeof qrRosterExportSchema>;
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
      eventId: parsed.eventId,
      ...(parsed.raceId ? { raceId: parsed.raceId } : {}),
      riderNumber: punch.riderNumber,
      timestamp: punch.timestamp,
      createdAt: punch.createdAt,
      voided: punch.voided,
      ...(punch.clockOffsetMs !== undefined
        ? { clockOffsetMs: punch.clockOffsetMs }
        : {}),
      ...(punch.unknownNumber !== undefined
        ? { unknownNumber: punch.unknownNumber }
        : {}),
    }),
  );
}
