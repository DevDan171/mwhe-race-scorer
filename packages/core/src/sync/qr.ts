import type { Punch } from "../schemas/punch.js";
import { punchSchema } from "../schemas/punch.js";
import type { RiderStart, RowStart } from "../schemas/starts.js";
import type {
  QrCheckpointExport,
  QrRosterExport,
  QrStartExport,
  RosterDeltaMessage,
} from "../schemas/sync.js";
import {
  importQrCheckpointExport,
  qrCheckpointExportSchema,
  qrRosterExportSchema,
  qrStartExportSchema,
  rosterDeltaMessageSchema,
} from "../schemas/sync.js";
import { SCHEMA_VERSION } from "../version.js";
import { QR_CHUNK_MAX_CHARS } from "./defaults.js";

export interface CheckpointQrInput {
  eventId: string;
  raceId?: string;
  checkId: string;
  deviceId: string;
  exportedAt: string;
  punches: readonly Punch[];
  maxChars?: number;
}

/** JSON texts, one per QR code. `part` / `parts` line up across the set. */
export function encodeCheckpointQr(input: CheckpointQrInput): string[] {
  const maxChars = input.maxChars ?? QR_CHUNK_MAX_CHARS;
  const compact = input.punches.map((punch) => toCompact(punch));
  const frames = pack(compact, maxChars, (slice, part, parts) =>
    qrCheckpointExportSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      type: "qr_checkpoint_export",
      eventId: input.eventId,
      ...(input.raceId ? { raceId: input.raceId } : {}),
      checkId: input.checkId,
      deviceId: input.deviceId,
      exportedAt: input.exportedAt,
      part,
      parts,
      punches: slice,
    }),
  );
  return frames.map((frame) => JSON.stringify(frame));
}

export interface RosterQrInput {
  eventId: string;
  exportedAt: string;
  deltas: readonly RosterDeltaMessage[];
  maxChars?: number;
}

export interface StartQrInput {
  eventId: string;
  raceId?: string;
  deviceId: string;
  exportedAt: string;
  rowStarts: readonly RowStart[];
  riderStarts: readonly RiderStart[];
  maxChars?: number;
}

export function encodeStartQr(input: StartQrInput): string[] {
  const maxChars = input.maxChars ?? QR_CHUNK_MAX_CHARS;
  const items = [
    ...input.rowStarts.map((start) => ({ kind: "row" as const, start })),
    ...input.riderStarts.map((start) => ({ kind: "rider" as const, start })),
  ];
  const frames = pack(items, maxChars, (slice, part, parts) =>
    qrStartExportSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      type: "qr_start_export",
      eventId: input.eventId,
      ...(input.raceId ? { raceId: input.raceId } : {}),
      deviceId: input.deviceId,
      exportedAt: input.exportedAt,
      part,
      parts,
      items: slice,
    }),
  );
  return frames.map((frame) => JSON.stringify(frame));
}

export function readStartFrames(text: string): QrStartExport[] {
  const values = parseQrPayload(text);
  if (values.length === 0) throw new Error("Paste a start QR payload first.");
  return values.map((value) => qrStartExportSchema.parse(value));
}

export function assembleStartFrames(frames: readonly QrStartExport[]): {
  rowStarts: RowStart[];
  riderStarts: RiderStart[];
} {
  const parsed = frames.map((frame) => qrStartExportSchema.parse(frame));
  const ordered = requireComplete(parsed, startKey);
  const rowStarts: RowStart[] = [];
  const riderStarts: RiderStart[] = [];
  for (const frame of ordered) {
    for (const item of frame.items) {
      if (item.kind === "row") rowStarts.push(item.start);
      else riderStarts.push(item.start);
    }
  }
  return { rowStarts, riderStarts };
}

function startKey(frame: QrStartExport): string {
  return `${frame.eventId}:${frame.deviceId}:${frame.exportedAt}`;
}

export function encodeRosterQr(input: RosterQrInput): string[] {
  const maxChars = input.maxChars ?? QR_CHUNK_MAX_CHARS;
  const deltas = input.deltas.map((delta) => rosterDeltaMessageSchema.parse(delta));
  const frames = pack(deltas, maxChars, (slice, part, parts) =>
    qrRosterExportSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      type: "qr_roster_export",
      eventId: input.eventId,
      exportedAt: input.exportedAt,
      part,
      parts,
      deltas: slice,
    }),
  );
  return frames.map((frame) => JSON.stringify(frame));
}

/**
 * Accepts one JSON value, a JSON array of frames, or several JSON values
 * separated by a blank line (the "copy all" paste).
 */
export function parseQrPayload(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const whole = tryJson(trimmed);
  if (whole !== undefined) {
    return Array.isArray(whole) ? whole : [whole];
  }
  const chunks = trimmed
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (chunks.length === 0) return [];
  const values: unknown[] = [];
  for (const chunk of chunks) {
    const value = tryJson(chunk);
    if (value === undefined) {
      throw new Error("That text is not a station QR payload.");
    }
    if (Array.isArray(value)) values.push(...value);
    else values.push(value);
  }
  return values;
}

export function readCheckpointFrames(text: string): QrCheckpointExport[] {
  const values = parseQrPayload(text);
  if (values.length === 0) throw new Error("Paste a QR payload first.");
  return values.map((value) => qrCheckpointExportSchema.parse(value));
}

export function readRosterFrames(text: string): QrRosterExport[] {
  const values = parseQrPayload(text);
  if (values.length === 0) throw new Error("Paste a roster QR payload first.");
  return values.map((value) => qrRosterExportSchema.parse(value));
}

export function assembleCheckpointFrames(frames: readonly QrCheckpointExport[]): Punch[] {
  const parsed = frames.map((frame) => qrCheckpointExportSchema.parse(frame));
  const ordered = requireComplete(parsed, checkpointKey);
  return ordered.flatMap((frame) => importQrCheckpointExport(frame));
}

export function assembleRosterFrames(
  frames: readonly QrRosterExport[],
): RosterDeltaMessage[] {
  const parsed = frames.map((frame) => qrRosterExportSchema.parse(frame));
  const ordered = requireComplete(parsed, rosterKey);
  return ordered.flatMap((frame) => frame.deltas);
}

export interface FrameProgress {
  parts: number;
  have: number[];
  missing: number[];
  complete: boolean;
}

export function checkpointProgress(frames: readonly QrCheckpointExport[]): FrameProgress {
  return progress(
    frames.map((frame) => qrCheckpointExportSchema.parse(frame)),
    checkpointKey,
  );
}

export function rosterProgress(frames: readonly QrRosterExport[]): FrameProgress {
  return progress(
    frames.map((frame) => qrRosterExportSchema.parse(frame)),
    rosterKey,
  );
}

function toCompact(punch: Punch): QrCheckpointExport["punches"][number] {
  const parsed = punchSchema.parse(punch);
  return {
    uuid: parsed.uuid,
    riderNumber: parsed.riderNumber,
    timestamp: parsed.timestamp,
    createdAt: parsed.createdAt,
    voided: parsed.voided,
    ...(parsed.clockOffsetMs !== undefined
      ? { clockOffsetMs: parsed.clockOffsetMs }
      : {}),
    ...(parsed.unknownNumber !== undefined
      ? { unknownNumber: parsed.unknownNumber }
      : {}),
  };
}

function pack<T, Frame>(
  items: readonly T[],
  maxChars: number,
  build: (slice: T[], part: number, parts: number) => Frame,
): Frame[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error("QR frame size must be a positive number of characters.");
  }
  const chunks: T[][] = items.length === 0 ? [[]] : [];
  let cursor = 0;
  while (cursor < items.length) {
    let take = 1;
    while (cursor + take < items.length && fits(items.slice(cursor, cursor + take + 1))) {
      take += 1;
    }
    chunks.push(items.slice(cursor, cursor + take));
    cursor += take;
  }

  let guard = 0;
  while (guard < items.length + 2) {
    guard += 1;
    const parts = chunks.length;
    const frames = chunks.map((slice, index) => build(slice, index + 1, parts));
    const overflow = frames.findIndex(
      (frame, index) =>
        JSON.stringify(frame).length > maxChars && (chunks[index]?.length ?? 0) > 1,
    );
    if (overflow === -1) return frames;
    const moving = chunks[overflow]?.pop();
    if (moving === undefined) break;
    chunks.splice(overflow + 1, 0, [moving]);
  }
  throw new Error("Could not split the QR payload.");

  function fits(slice: T[]): boolean {
    return JSON.stringify(build(slice, 99, 99)).length <= maxChars;
  }
}

interface PartFrame {
  part: number;
  parts: number;
}

function requireComplete<T extends PartFrame>(
  frames: readonly T[],
  keyOf: (frame: T) => string,
): T[] {
  if (frames.length === 0) throw new Error("No QR frames.");
  const first = frames[0];
  if (!first) throw new Error("No QR frames.");
  const key = keyOf(first);
  if (frames.some((frame) => keyOf(frame) !== key || frame.parts !== first.parts)) {
    throw new Error("These QR codes are not from the same export.");
  }
  const seen = new Map<number, T>();
  for (const frame of frames) {
    if (seen.has(frame.part))
      throw new Error(`QR part ${frame.part} was included twice.`);
    seen.set(frame.part, frame);
  }
  const missing: number[] = [];
  for (let part = 1; part <= first.parts; part += 1) {
    if (!seen.has(part)) missing.push(part);
  }
  if (missing.length > 0) {
    throw new Error(`QR part ${missing.join(", ")} of ${first.parts} is still missing.`);
  }
  const ordered: T[] = [];
  for (let part = 1; part <= first.parts; part += 1) {
    const frame = seen.get(part);
    if (!frame) throw new Error(`QR part ${part} of ${first.parts} is still missing.`);
    ordered.push(frame);
  }
  return ordered;
}

function progress<T extends PartFrame>(
  frames: readonly T[],
  keyOf: (frame: T) => string,
): FrameProgress {
  if (frames.length === 0) {
    return { parts: 0, have: [], missing: [], complete: false };
  }
  const first = frames[0];
  if (!first) return { parts: 0, have: [], missing: [], complete: false };
  const key = keyOf(first);
  if (frames.some((frame) => keyOf(frame) !== key || frame.parts !== first.parts)) {
    throw new Error("These QR codes are not from the same export.");
  }
  const have = [...new Set(frames.map((frame) => frame.part))].sort((a, b) => a - b);
  const missing: number[] = [];
  for (let part = 1; part <= first.parts; part += 1) {
    if (!have.includes(part)) missing.push(part);
  }
  return {
    parts: first.parts,
    have,
    missing,
    complete: missing.length === 0 && have.length === first.parts,
  };
}

function checkpointKey(frame: QrCheckpointExport): string {
  return [
    frame.eventId,
    frame.raceId ?? "",
    frame.checkId,
    frame.deviceId,
    frame.exportedAt,
  ].join("|");
}

function rosterKey(frame: QrRosterExport): string {
  return [frame.eventId, frame.exportedAt].join("|");
}

function tryJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
