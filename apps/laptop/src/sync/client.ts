import type {
  Punch,
  RosterDeltaMessage,
  RowStart,
  StartTime,
  StationPairing,
  StationUpdateManifest,
} from "@mwhe/core";

import { isTauri } from "../platform";
import { createSyncHost, type SeedInput, type SyncHost, type SyncView } from "./host";

export interface SyncClient {
  seed(input: SeedInput): Promise<SyncView>;
  setRoster(deltas: readonly RosterDeltaMessage[]): Promise<SyncView>;
  snapshot(): Promise<SyncView>;
  createPairing(
    input: Omit<Parameters<SyncHost["createPairing"]>[0], never>,
  ): Promise<{ view: SyncView; payload: StationPairing }>;
  showPairing(
    pairingId: string,
    hubUrl?: string,
  ): Promise<{ view: SyncView; payload: StationPairing }>;
  importPunchText(text: string): Promise<SyncView>;
  rosterQr(eventId: string, since: number): Promise<string[]>;
  setClockWarnMs(ms: number): Promise<SyncView>;
  setManualStart(start: StartTime): Promise<SyncView>;
  setRowClock(start: RowStart): Promise<SyncView>;
  setStationUpdate(manifest: StationUpdateManifest, apkBase64: string): Promise<void>;
  addPaperPunch(punch: Punch): Promise<SyncView>;
  voidPunch(uuid: string): Promise<SyncView>;
}

export function wrapHost(host: SyncHost): SyncClient {
  return {
    seed: async (input) => host.seed(input),
    setRoster: async (deltas) => host.setRoster(deltas),
    snapshot: async () => host.snapshot(),
    createPairing: async (input) => host.createPairing(input),
    showPairing: async (pairingId, hubUrl) => host.showPairing(pairingId, hubUrl),
    importPunchText: async (text) => host.importPunchText(text),
    rosterQr: async (eventId, since) => host.rosterQr(eventId, since),
    setClockWarnMs: async (ms) => host.setClockWarnMs(ms),
    setManualStart: async (start) => host.setManualStart(start),
    setRowClock: async (start) => host.setRowClock(start),
    setStationUpdate: async (manifest, apkBase64) => {
      host.setStationUpdate(manifest, base64ToBytes(apkBase64));
    },
    addPaperPunch: async (punch) => host.addPaperPunch(punch),
    voidPunch: async (uuid) => host.voidPunch(uuid),
  };
}

export function createHttpSyncClient(): SyncClient {
  return {
    seed: (input) => post("/__mwhe/seed", input),
    setRoster: (deltas) => post("/__mwhe/roster", { deltas }),
    snapshot: () => get("/__mwhe/snapshot"),
    createPairing: (input) => post("/__mwhe/pairing", input),
    showPairing: (pairingId, hubUrl) =>
      post("/__mwhe/pairing/show", { pairingId, hubUrl }),
    importPunchText: (text) => post("/__mwhe/import", { text }),
    rosterQr: (eventId, since) => post("/__mwhe/roster-qr", { eventId, since }),
    setClockWarnMs: (ms) => post("/__mwhe/settings", { clockOffsetWarnMs: ms }),
    setManualStart: (start) => post("/__mwhe/manual-start", { start }),
    setRowClock: (start) => post("/__mwhe/row-clock", { start }),
    setStationUpdate: (manifest, apkBase64) =>
      post<void>("/__mwhe/station-apk", { manifest, apkBase64 }),
    addPaperPunch: (punch) => post("/__mwhe/paper", { punch }),
    voidPunch: (uuid) => post("/__mwhe/void", { uuid }),
  };
}

export async function createTauriSyncClient(): Promise<SyncClient> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    seed: (input) => invoke("sync_seed", { input }),
    setRoster: (deltas) => invoke("sync_set_roster", { deltas }),
    snapshot: () => invoke("sync_snapshot"),
    createPairing: (input) => invoke("sync_create_pairing", { input }),
    showPairing: (pairingId, hubUrl) =>
      invoke("sync_show_pairing", { pairingId, hubUrl }),
    importPunchText: (text) => invoke("sync_import_punches", { text }),
    rosterQr: (eventId, since) => invoke("sync_roster_qr", { eventId, since }),
    setClockWarnMs: (ms) => invoke("sync_set_clock_warn_ms", { clockOffsetWarnMs: ms }),
    setManualStart: (start) => invoke("sync_set_manual_start", { start }),
    setRowClock: (start) => invoke("sync_set_row_clock", { start }),
    setStationUpdate: (manifest, apkBase64) =>
      invoke("sync_set_station_apk", { manifest, apkBase64 }),
    addPaperPunch: (punch) => invoke("sync_add_punch", { punch }),
    voidPunch: (uuid) => invoke("sync_void_punch", { uuid }),
  };
}

export async function openSyncClient(): Promise<SyncClient> {
  if (isTauri()) return createTauriSyncClient();
  if (import.meta.env.DEV) {
    try {
      const response = await fetch("/__mwhe/snapshot");
      if (response.ok) return createHttpSyncClient();
    } catch {
      // The dev listener is not up. The screen still opens.
    }
  }
  return wrapHost(createSyncHost([]));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "The station listener did not accept that.");
  return JSON.parse(text) as T;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const text = await response.text();
  if (!response.ok) throw new Error(text || "The station listener did not answer.");
  return JSON.parse(text) as T;
}
