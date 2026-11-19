import {
  applyRosterDelta,
  assembleRosterFrames,
  clockOffsetMs,
  DEFAULT_CLOCK_OFFSET_WARN_MS,
  DEFAULT_DOUBLE_TAP_WINDOW_MS,
  encodeCheckpointQr,
  findDoubleTap,
  isUnknownRiderNumber,
  phoneRosterSchema,
  punchSchema,
  QR_CHUNK_MAX_CHARS,
  readRosterFrames,
  stationPairingSchema,
  versionsMatch,
  type PhoneRoster,
  type Punch,
  type QrRosterExport,
  type RosterDeltaMessage,
  type StationHelloAck,
  type StationPairing,
  type SyncResult,
} from "@mwhe/core";
import { z } from "zod";

import type { KvStorage } from "./storage";

const PRIMARY = "station-state";
const BACKUP = "station-state-bak";

export const stationSetupSchema = z.strictObject({
  hubUrl: z.string().min(1),
  eventId: z.string().min(1),
  eventName: z.string().min(1),
  raceId: z.string().min(1),
  raceName: z.string().min(1),
  checkId: z.string().min(1),
  checkName: z.string().min(1),
  pairingSecret: z.string().min(1),
  hubVersion: z.string().min(1),
  clockOffsetWarnMs: z.number().int().nonnegative(),
  clockOffsetMs: z.number().int(),
  offsetConfirmed: z.boolean(),
  goLiveAllowed: z.boolean(),
  pairedAt: z.string().min(1),
});

export type StationSetup = z.infer<typeof stationSetupSchema>;

export const stationStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  deviceId: z.uuid(),
  setup: stationSetupSchema.nullable(),
  roster: phoneRosterSchema.nullable(),
  punches: z.array(punchSchema),
  settings: z.strictObject({
    doubleTapWindowMs: z.number().int().nonnegative(),
  }),
  live: z.boolean(),
  lastSyncAt: z.string().nullable(),
});

export type StationState = z.infer<typeof stationStateSchema>;

export function freshStation(deviceId: string): StationState {
  return stationStateSchema.parse({
    schemaVersion: 1,
    deviceId,
    setup: null,
    roster: null,
    punches: [],
    settings: { doubleTapWindowMs: DEFAULT_DOUBLE_TAP_WINDOW_MS },
    live: false,
    lastSyncAt: null,
  });
}

export async function loadStation(
  storage: KvStorage,
  deviceId: () => string = () => crypto.randomUUID(),
): Promise<StationState> {
  const primary = await storage.get(PRIMARY);
  const backup = await storage.get(BACKUP);
  const parsed = tryParse(primary) ?? tryParse(backup);
  if (parsed) return parsed;
  if (primary || backup) {
    throw new Error("The saved punches could not be read. Do not reset this phone.");
  }
  return freshStation(deviceId());
}

export async function persistStation(
  storage: KvStorage,
  state: StationState,
): Promise<StationState> {
  const parsed = stationStateSchema.parse(state);
  const json = JSON.stringify(parsed);
  const current = await storage.get(PRIMARY);
  if (current && current !== json) await storage.set(BACKUP, current);
  await storage.set(PRIMARY, json);
  const read = await storage.get(PRIMARY);
  if (read !== json) throw new Error("The punch file did not save.");
  return parsed;
}

export function lockSetup(
  state: StationState,
  payload: StationPairing,
  deviceNow: string,
  stationVersion: string,
): StationState {
  if (state.setup && state.punches.length > 0) {
    throw new Error("This phone is already locked to a check.");
  }
  const pairing = stationPairingSchema.parse(payload);
  const allowed = versionsMatch(stationVersion, pairing.hubVersion);
  return stationStateSchema.parse({
    ...state,
    live: false,
    setup: {
      hubUrl: pairing.hubUrl.replace(/\/+$/, ""),
      eventId: pairing.eventId,
      eventName: pairing.eventName,
      raceId: pairing.raceId,
      raceName: pairing.raceName,
      checkId: pairing.checkId,
      checkName: pairing.checkName,
      pairingSecret: pairing.pairingSecret,
      hubVersion: pairing.hubVersion,
      clockOffsetWarnMs: pairing.clockOffsetWarnMs,
      clockOffsetMs: clockOffsetMs(deviceNow, pairing.laptopNow),
      offsetConfirmed: false,
      goLiveAllowed: allowed,
      pairedAt: deviceNow,
    },
  });
}

export function goLive(state: StationState, stationVersion: string): StationState {
  const block = goLiveBlock(state, stationVersion);
  if (block) throw new Error(block);
  return { ...state, live: true };
}

export function goLiveBlock(state: StationState, stationVersion: string): string | null {
  if (!state.setup) return "Scan the laptop code before going live.";
  if (state.setup.goLiveAllowed) return null;
  return `This phone is version ${stationVersion}. The laptop is ${state.setup.hubVersion}. Update the phone before going live. Punches already on the phone can still sync.`;
}

export function endLive(state: StationState): StationState {
  return { ...state, live: false };
}

export function clearSetup(state: StationState): StationState {
  if (state.punches.length > 0) {
    throw new Error("Punches are already saved. This phone stays on this check.");
  }
  return { ...state, setup: null, roster: null, live: false };
}

export function setDoubleTapWindow(state: StationState, windowMs: number): StationState {
  if (!Number.isInteger(windowMs) || windowMs < 0) {
    throw new Error("The double-tap window must be zero or more milliseconds.");
  }
  return {
    ...state,
    settings: { doubleTapWindowMs: windowMs },
  };
}

export type PunchDecision =
  | { ok: true; state: StationState; punch: Punch; unknown: boolean }
  | { ok: false; reason: "not_live" | "bad_number" }
  | { ok: false; reason: "double_tap"; previous: Punch };

/**
 * Saves immediately, including a number that is not on the roster.
 * A recent duplicate is not saved until `confirmDoubleTap` is set.
 */
export function decidePunch(
  state: StationState,
  riderNumberText: string,
  now: string,
  confirmDoubleTap: boolean,
): PunchDecision {
  if (!state.live || !state.setup) return { ok: false, reason: "not_live" };
  const riderNumber = parseRiderNumber(riderNumberText);
  if (riderNumber === null) return { ok: false, reason: "bad_number" };
  const previous = findDoubleTap(state.punches, {
    riderNumber,
    checkId: state.setup.checkId,
    atMs: Date.parse(now),
    windowMs: state.settings.doubleTapWindowMs,
  });
  if (previous && !confirmDoubleTap) return { ok: false, reason: "double_tap", previous };
  const rosterReady = state.roster !== null && state.roster.version > 0;
  const numbers = state.roster?.riders.map((rider) => rider.number) ?? [];
  const unknown = rosterReady && isUnknownRiderNumber(numbers, riderNumber);
  const punch = punchSchema.parse({
    schemaVersion: 1,
    uuid: crypto.randomUUID(),
    eventId: state.setup.eventId,
    raceId: state.setup.raceId,
    checkId: state.setup.checkId,
    deviceId: state.deviceId,
    riderNumber,
    timestamp: now,
    createdAt: now,
    voided: false,
    clockOffsetMs: state.setup.clockOffsetMs,
    ...(unknown ? { unknownNumber: true } : {}),
  });
  return {
    ok: true,
    punch,
    unknown,
    state: { ...state, punches: [...state.punches, punch] },
  };
}

export function voidLatestPunch(
  state: StationState,
): { state: StationState; punch: Punch } | null {
  if (!state.setup) return null;
  for (let index = state.punches.length - 1; index >= 0; index -= 1) {
    const punch = state.punches[index];
    if (!punch || punch.voided || punch.checkId !== state.setup.checkId) continue;
    const next = { ...punch, voided: true };
    const punches = state.punches.slice();
    punches[index] = next;
    return { state: { ...state, punches }, punch: next };
  }
  return null;
}

export function acceptRosterDeltas(
  state: StationState,
  deltas: readonly RosterDeltaMessage[],
): StationState {
  if (!state.setup) throw new Error("Scan the laptop code before loading a roster.");
  let roster: PhoneRoster = state.roster ?? {
    schemaVersion: 1,
    eventId: state.setup.eventId,
    version: 0,
    riders: [],
  };
  for (const delta of deltas) {
    roster = applyRosterDelta(roster, delta);
  }
  return { ...state, roster };
}

export function applyHelloAck(state: StationState, ack: StationHelloAck): StationState {
  if (!state.setup) throw new Error("Scan the laptop code before syncing.");
  const withRoster = acceptRosterDeltas(state, ack.rosterDeltas);
  const allowed = ack.goLiveAllowed;
  return stationStateSchema.parse({
    ...withRoster,
    live: allowed ? withRoster.live : false,
    lastSyncAt: ack.laptopNow,
    setup: {
      ...state.setup,
      clockOffsetMs: ack.clockOffsetMs,
      clockOffsetWarnMs: ack.clockOffsetWarnMs,
      offsetConfirmed: true,
      goLiveAllowed: allowed,
      hubVersion: ack.hubVersion,
    },
  });
}

export function applySyncResult(state: StationState, result: SyncResult): StationState {
  if (!state.setup) throw new Error("Scan the laptop code before syncing.");
  const withRoster = acceptRosterDeltas(state, result.rosterDeltas);
  return stationStateSchema.parse({
    ...withRoster,
    live: result.goLiveAllowed ? withRoster.live : false,
    lastSyncAt: result.laptopNow,
    setup: {
      ...withRoster.setup,
      clockOffsetMs: result.clockOffsetMs,
      clockOffsetWarnMs: result.clockOffsetWarnMs,
      offsetConfirmed: true,
      goLiveAllowed: result.goLiveAllowed,
      hubVersion: result.hubVersion,
    },
  });
}

export function exportPunchQr(
  state: StationState,
  exportedAt: string,
  maxChars = QR_CHUNK_MAX_CHARS,
): string[] {
  if (!state.setup) throw new Error("Scan the laptop code before exporting punches.");
  return encodeCheckpointQr({
    eventId: state.setup.eventId,
    raceId: state.setup.raceId,
    checkId: state.setup.checkId,
    deviceId: state.deviceId,
    exportedAt,
    punches: state.punches,
    maxChars,
  });
}

export function importRosterQr(
  state: StationState,
  frames: readonly QrRosterExport[],
): StationState {
  return acceptRosterDeltas(state, assembleRosterFrames(frames));
}

export function riderLabel(state: StationState, riderNumber: number): string {
  const rider = state.roster?.riders.find((entry) => entry.number === riderNumber);
  return rider ? `${rider.name} · ${rider.class}` : "Not on the roster";
}

export function parseRiderNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const number = Number(trimmed);
  if (!Number.isSafeInteger(number)) return null;
  return number;
}

function tryParse(json: string | null): StationState | null {
  if (!json) return null;
  try {
    const parsed = stationStateSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function emptyRosterVersion(state: StationState): number {
  return state.roster?.version ?? 0;
}

export { readRosterFrames, DEFAULT_CLOCK_OFFSET_WARN_MS };
