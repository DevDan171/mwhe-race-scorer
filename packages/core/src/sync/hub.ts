import { z } from "zod";

import { isoTimestampSchema, schemaVersionSchema } from "../schemas/common.js";
import type { Punch } from "../schemas/punch.js";
import { punchSchema } from "../schemas/punch.js";
import { startTimeSchema, type StartTime } from "../schemas/start-time.js";
import {
  riderStartSchema,
  rowStartSchema,
  startRowBriefSchema,
  stationRoleSchema,
  type RowStart,
  type StartRowBrief,
  type StationRole,
} from "../schemas/starts.js";
import type {
  PushPunchesMessage,
  RosterDeltaMessage,
  StationPairing,
  SyncError,
} from "../schemas/sync.js";
import {
  pushPunchesMessageSchema,
  rosterDeltaMessageSchema,
  rosterSyncSchema,
  stationHelloAckSchema,
  stationHelloSchema,
  stationPairingSchema,
  syncErrorSchema,
  syncResultSchema,
} from "../schemas/sync.js";
import { SCHEMA_VERSION } from "../version.js";
import { DEFAULT_CLOCK_OFFSET_WARN_MS, DEFAULT_MIN_PASS_GAP_MS } from "./defaults.js";
import { dedupeRiderStarts, dedupeRowStarts } from "../scoring/start-capture.js";
import { clockOffsetMs, mergePunches, versionsMatch } from "./punches.js";

export const stationRecordSchema = z.strictObject({
  pairingId: z.uuid(),
  pairingSecret: z.string().regex(/^[0-9a-f]{64}$/),
  hubUrl: z.string().min(1),
  eventId: z.string().min(1),
  eventName: z.string().min(1),
  raceId: z.string().min(1),
  raceName: z.string().min(1),
  checkId: z.string().min(1),
  checkName: z.string().min(1),
  deviceId: z.string().min(1).nullable(),
  appVersion: z.string().min(1).nullable(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  clockOffsetMs: z.number().int().nullable(),
  lastSyncAt: isoTimestampSchema.nullable(),
  pairedAt: isoTimestampSchema,
  goLiveAllowed: z.boolean(),
  rosterVersion: z.number().int().nonnegative(),
  role: stationRoleSchema.default("check"),
  startRows: z.array(startRowBriefSchema).default([]),
});

export type StationRecord = z.infer<typeof stationRecordSchema>;

export const syncSettingsSchema = z.strictObject({
  clockOffsetWarnMs: z.number().int().nonnegative(),
  minPassGapMs: z.number().int().nonnegative().default(DEFAULT_MIN_PASS_GAP_MS),
});

export type SyncSettings = z.infer<typeof syncSettingsSchema>;

export const syncHubSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  settings: syncSettingsSchema,
  stations: z.array(stationRecordSchema),
  punches: z.array(punchSchema),
  rowStarts: z.array(rowStartSchema).default([]),
  riderStarts: z.array(riderStartSchema).default([]),
  manualStarts: z.array(startTimeSchema).default([]),
  rosterDeltas: z.array(rosterDeltaMessageSchema),
  hubVersion: z.string().min(1),
});

export type SyncHub = z.infer<typeof syncHubSchema>;

/** What the laptop stores. The running app version is not part of the file. */
export const storedSyncStateSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  settings: syncSettingsSchema,
  stations: z.array(stationRecordSchema),
  punches: z.array(punchSchema),
  rowStarts: z.array(rowStartSchema).default([]),
  riderStarts: z.array(riderStartSchema).default([]),
  manualStarts: z.array(startTimeSchema).default([]),
});

export type StoredSyncState = z.infer<typeof storedSyncStateSchema>;

export interface SyncHttpRequest {
  method: string;
  /** Path plus query string, for example `/sync/roster?since=1`. */
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  body: unknown;
  laptopNow: string;
}

export interface SyncHttpResponse {
  status: number;
  body: unknown;
}

interface HubAnswer {
  hub: SyncHub;
  status: number;
  body: unknown;
}

export function emptySyncHub(
  hubVersion: string,
  clockOffsetWarnMs = DEFAULT_CLOCK_OFFSET_WARN_MS,
): SyncHub {
  return syncHubSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    settings: { clockOffsetWarnMs },
    stations: [],
    punches: [],
    rosterDeltas: [],
    hubVersion,
  });
}

export function storedFromHub(hub: SyncHub): StoredSyncState {
  return storedSyncStateSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    settings: hub.settings,
    stations: hub.stations,
    punches: hub.punches,
    rowStarts: hub.rowStarts,
    riderStarts: hub.riderStarts,
    manualStarts: hub.manualStarts,
  });
}

export function hubFromStored(
  stored: StoredSyncState,
  hubVersion: string,
  rosterDeltas: readonly RosterDeltaMessage[],
): SyncHub {
  return setRoster(
    syncHubSchema.parse({
      ...stored,
      rosterDeltas: [],
      hubVersion,
    }),
    rosterDeltas,
  );
}

export function newPairingSecret(
  random: Uint8Array = crypto.getRandomValues(new Uint8Array(32)),
): string {
  if (random.length !== 32) throw new Error("A pairing secret needs 32 random bytes.");
  return [...random].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function setRoster(hub: SyncHub, deltas: readonly RosterDeltaMessage[]): SyncHub {
  const parsed = deltas.map((delta) => rosterDeltaMessageSchema.parse(delta));
  parsed.forEach((delta, index) => {
    if (delta.version !== index + 1 || delta.baseVersion !== index) {
      throw new Error("Roster deltas must be a contiguous sequence from version 1.");
    }
  });
  const events = new Set(parsed.map((delta) => delta.eventId));
  if (events.size > 1) throw new Error("Roster deltas must belong to one event.");
  return { ...hub, rosterDeltas: parsed };
}

export function updateClockWarnMs(hub: SyncHub, clockOffsetWarnMs: number): SyncHub {
  if (!Number.isInteger(clockOffsetWarnMs) || clockOffsetWarnMs < 0) {
    throw new Error(
      "The clock warning must be a whole number of milliseconds, zero or more.",
    );
  }
  return { ...hub, settings: { ...hub.settings, clockOffsetWarnMs } };
}

export interface PairingInput {
  hubUrl: string;
  eventId: string;
  eventName: string;
  raceId: string;
  raceName: string;
  checkId: string;
  checkName: string;
  role?: StationRole;
  startRows?: StartRowBrief[];
  now: string;
  secret: string;
  pairingId: string;
}

export function createPairing(
  hub: SyncHub,
  input: PairingInput,
): { hub: SyncHub; payload: StationPairing } {
  if (hub.stations.some((station) => secretsMatch(station.pairingSecret, input.secret))) {
    throw new Error("That pairing secret is already in use.");
  }
  const payload = stationPairingSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "station_pairing",
    hubUrl: input.hubUrl.replace(/\/+$/, ""),
    eventId: input.eventId,
    eventName: input.eventName,
    raceId: input.raceId,
    raceName: input.raceName,
    checkId: input.checkId,
    checkName: input.checkName,
    pairingSecret: input.secret,
    laptopNow: input.now,
    hubVersion: hub.hubVersion,
    clockOffsetWarnMs: hub.settings.clockOffsetWarnMs,
    role: input.role ?? "check",
    startRows: input.startRows ?? [],
  });
  const station = stationRecordSchema.parse({
    pairingId: input.pairingId,
    pairingSecret: payload.pairingSecret,
    hubUrl: payload.hubUrl,
    eventId: payload.eventId,
    eventName: payload.eventName,
    raceId: payload.raceId,
    raceName: payload.raceName,
    checkId: payload.checkId,
    checkName: payload.checkName,
    deviceId: null,
    appVersion: null,
    batteryPercent: null,
    clockOffsetMs: null,
    lastSyncAt: null,
    pairedAt: input.now,
    goLiveAllowed: false,
    rosterVersion: 0,
    role: payload.role ?? "check",
    startRows: payload.startRows ?? [],
  });
  return { hub: { ...hub, stations: [...hub.stations, station] }, payload };
}

export function pairingFromStation(
  hub: SyncHub,
  pairingId: string,
  now: string,
  hubUrl?: string,
): StationPairing {
  const station = hub.stations.find((entry) => entry.pairingId === pairingId);
  if (!station) throw new Error("That station is not paired.");
  return stationPairingSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "station_pairing",
    hubUrl: (hubUrl ?? station.hubUrl).replace(/\/+$/, ""),
    eventId: station.eventId,
    eventName: station.eventName,
    raceId: station.raceId,
    raceName: station.raceName,
    checkId: station.checkId,
    checkName: station.checkName,
    pairingSecret: station.pairingSecret,
    laptopNow: now,
    hubVersion: hub.hubVersion,
    clockOffsetWarnMs: hub.settings.clockOffsetWarnMs,
    role: station.role,
    startRows: station.startRows,
  });
}

export function addPunches(
  hub: SyncHub,
  incoming: readonly Punch[],
): { hub: SyncHub; merge: ReturnType<typeof mergePunches> } {
  const merge = mergePunches(hub.punches, incoming);
  return { hub: { ...hub, punches: merge.punches }, merge };
}

export function setManualStart(hub: SyncHub, start: StartTime): SyncHub {
  const parsed = startTimeSchema.parse(start);
  const manualStarts = [
    ...hub.manualStarts.filter((entry) => entry.riderNumber !== parsed.riderNumber),
    parsed,
  ];
  return { ...hub, manualStarts };
}

export function setRowClock(hub: SyncHub, rowStart: RowStart): SyncHub {
  const parsed = rowStartSchema.parse(rowStart);
  return { ...hub, rowStarts: dedupeRowStarts([...hub.rowStarts, parsed]) };
}

export function voidRowStart(hub: SyncHub, uuid: string): SyncHub {
  return {
    ...hub,
    rowStarts: hub.rowStarts.map((entry) =>
      entry.uuid === uuid ? { ...entry, voided: true } : entry,
    ),
  };
}

export function voidRiderStart(hub: SyncHub, uuid: string): SyncHub {
  return {
    ...hub,
    riderStarts: hub.riderStarts.map((entry) =>
      entry.uuid === uuid ? { ...entry, voided: true } : entry,
    ),
  };
}

export function voidPunch(hub: SyncHub, uuid: string): SyncHub {
  let found = false;
  const punches = hub.punches.map((punch) => {
    if (punch.uuid !== uuid) return punch;
    found = true;
    return { ...punch, voided: true };
  });
  if (!found) throw new Error("That punch is not on this laptop.");
  return { ...hub, punches };
}

export function handleSyncRequest(
  hub: SyncHub,
  request: SyncHttpRequest,
): { hub: SyncHub; response: SyncHttpResponse } {
  const path = request.path.split("?")[0] ?? request.path;
  const method = request.method.toUpperCase();
  if (method === "GET" && path === "/health") {
    return {
      hub,
      response: {
        status: 200,
        body: { ok: true, app: "mwhe-laptop", version: hub.hubVersion },
      },
    };
  }

  const secret = bearer(header(request.headers, "authorization"));
  let answer: HubAnswer;
  if (method === "POST" && path === "/sync/pair") {
    answer = applyHello(hub, secret, request.body, request.laptopNow);
  } else if (method === "POST" && path === "/sync/punches") {
    answer = applyPunchPush(hub, secret, request.body, request.laptopNow);
  } else if (method === "GET" && path === "/sync/roster") {
    answer = applyRosterGet(hub, secret, request.path, request.laptopNow);
  } else {
    answer = {
      hub,
      status: 404,
      body: errorBody("bad_request", "That sync address does not exist."),
    };
  }
  return { hub: answer.hub, response: { status: answer.status, body: answer.body } };
}

export function applyHello(
  hub: SyncHub,
  secret: string | null,
  body: unknown,
  laptopNow: string,
): HubAnswer {
  const station = stationForSecret(hub, secret);
  if (!station) return unauthorized(hub);
  const parsed = stationHelloSchema.safeParse(body);
  if (!parsed.success) return badRequest(hub, "The phone's check-in was not understood.");
  const hello = parsed.data;
  if (
    hello.eventId !== station.eventId ||
    hello.raceId !== station.raceId ||
    hello.checkId !== station.checkId
  ) {
    return conflict(hub, "This code was made for a different check.");
  }
  if (station.deviceId && station.deviceId !== hello.deviceId) {
    return conflict(hub, "This pairing is already used by another phone.");
  }
  const offset = clockOffsetMs(hello.deviceNow, laptopNow);
  const allowed = versionsMatch(hub.hubVersion, hello.appVersion);
  const next = stationRecordSchema.parse({
    ...station,
    deviceId: hello.deviceId,
    appVersion: hello.appVersion,
    batteryPercent: hello.batteryPercent ?? station.batteryPercent,
    clockOffsetMs: offset,
    lastSyncAt: laptopNow,
    goLiveAllowed: allowed,
    rosterVersion: hello.rosterVersion,
  });
  const ack = stationHelloAckSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "station_hello_ack",
    laptopNow,
    clockOffsetMs: offset,
    goLiveAllowed: allowed,
    reason: allowed ? null : "app_version_mismatch",
    hubVersion: hub.hubVersion,
    rosterDeltas: deltasSince(hub, station.eventId, hello.rosterVersion),
    clockOffsetWarnMs: hub.settings.clockOffsetWarnMs,
  });
  return { hub: replaceStation(hub, next), status: 200, body: ack };
}

export function applyPunchPush(
  hub: SyncHub,
  secret: string | null,
  body: unknown,
  laptopNow: string,
): HubAnswer {
  const station = stationForSecret(hub, secret);
  if (!station) return unauthorized(hub);
  const parsed = pushPunchesMessageSchema.safeParse(body);
  if (!parsed.success) return badRequest(hub, "The punch upload was not understood.");
  const message = parsed.data;
  if (message.eventId !== station.eventId) {
    return conflict(hub, "These punches are for a different event.");
  }
  if (message.raceId && message.raceId !== station.raceId) {
    return conflict(hub, "These punches are for a different race.");
  }
  if (message.checkId && message.checkId !== station.checkId) {
    return conflict(hub, "These punches are for a different check.");
  }
  if (station.deviceId && station.deviceId !== message.deviceId) {
    return conflict(hub, "This pairing is already used by another phone.");
  }
  const identityError = punchesMatchStation(message, station.checkId);
  if (identityError) return badRequest(hub, identityError);

  const merged = mergePunches(hub.punches, message.punches);
  const rowStarts = dedupeRowStarts([
    ...(hub.rowStarts ?? []),
    ...(message.rowStarts ?? []),
  ]);
  const riderStarts = dedupeRiderStarts([
    ...(hub.riderStarts ?? []),
    ...(message.riderStarts ?? []),
  ]);
  const appVersion = message.appVersion ?? station.appVersion;
  const allowed = appVersion
    ? versionsMatch(hub.hubVersion, appVersion)
    : station.goLiveAllowed;
  const offset =
    message.deviceNow !== undefined
      ? clockOffsetMs(message.deviceNow, laptopNow)
      : (station.clockOffsetMs ?? 0);
  const next = stationRecordSchema.parse({
    ...station,
    deviceId: message.deviceId,
    appVersion,
    batteryPercent: message.batteryPercent ?? station.batteryPercent,
    clockOffsetMs: message.deviceNow !== undefined ? offset : station.clockOffsetMs,
    lastSyncAt: laptopNow,
    goLiveAllowed: allowed,
    rosterVersion: message.rosterVersion ?? station.rosterVersion,
  });
  const since = message.rosterVersion ?? station.rosterVersion;
  const result = syncResultSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "sync_result",
    laptopNow,
    clockOffsetMs: offset,
    accepted: merged.accepted,
    duplicates: merged.duplicates,
    voidsApplied: merged.voidsApplied,
    rosterDeltas: deltasSince(hub, station.eventId, since),
    goLiveAllowed: allowed,
    hubVersion: hub.hubVersion,
    reason: appVersion && !allowed ? "app_version_mismatch" : null,
    clockOffsetWarnMs: hub.settings.clockOffsetWarnMs,
  });
  return {
    hub: replaceStation(
      { ...hub, punches: merged.punches, rowStarts, riderStarts },
      next,
    ),
    status: 200,
    body: result,
  };
}

function applyRosterGet(
  hub: SyncHub,
  secret: string | null,
  path: string,
  laptopNow: string,
): HubAnswer {
  const station = stationForSecret(hub, secret);
  if (!station) return unauthorized(hub);
  const since = readSince(path);
  if (since === null) return badRequest(hub, "Roster sync needs a since version.");
  const body = rosterSyncSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "roster_sync",
    laptopNow,
    rosterDeltas: deltasSince(hub, station.eventId, since),
  });
  const next = stationRecordSchema.parse({
    ...station,
    rosterVersion: since,
    lastSyncAt: laptopNow,
  });
  return { hub: replaceStation(hub, next), status: 200, body };
}

function punchesMatchStation(
  message: PushPunchesMessage,
  checkId: string,
): string | null {
  for (const punch of message.punches) {
    if (punch.deviceId !== message.deviceId) {
      return "A punch in this upload is from a different phone.";
    }
    if (punch.checkId !== checkId) {
      return "A punch in this upload is for a different check.";
    }
    if (punch.eventId && punch.eventId !== message.eventId) {
      return "A punch in this upload is for a different event.";
    }
  }
  return null;
}

function deltasSince(hub: SyncHub, eventId: string, since: number): RosterDeltaMessage[] {
  return hub.rosterDeltas.filter(
    (delta) => delta.eventId === eventId && delta.version > since,
  );
}

function stationForSecret(hub: SyncHub, secret: string | null): StationRecord | null {
  if (!secret) return null;
  return (
    hub.stations.find((station) => secretsMatch(station.pairingSecret, secret)) ?? null
  );
}

function replaceStation(hub: SyncHub, next: StationRecord): SyncHub {
  return {
    ...hub,
    stations: hub.stations.map((station) =>
      station.pairingId === next.pairingId ? next : station,
    ),
  };
}

export function secretsMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function bearer(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = headers[name];
  if (direct) return direct;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}

function readSince(path: string): number | null {
  const query = path.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const raw = params.get("since");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function unauthorized(hub: SyncHub): HubAnswer {
  return {
    hub,
    status: 401,
    body: errorBody("unauthorized", "This pairing code is not on the laptop."),
  };
}

function badRequest(hub: SyncHub, message: string): HubAnswer {
  return { hub, status: 400, body: errorBody("bad_request", message) };
}

function conflict(hub: SyncHub, message: string): HubAnswer {
  return { hub, status: 409, body: errorBody("conflict", message) };
}

function errorBody(error: SyncError["error"], message: string): SyncError {
  return syncErrorSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "sync_error",
    error,
    message,
  });
}
