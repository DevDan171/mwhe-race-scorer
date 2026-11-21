import {
  addPunches,
  assembleCheckpointFrames,
  assembleStartFrames,
  createPairing,
  dedupeRiderStarts,
  dedupeRowStarts,
  emptySyncHub,
  encodeRosterQr,
  handleSyncRequest,
  hubFromStored,
  mergePunches,
  newPairingSecret,
  pairingFromStation,
  punchSchema,
  readCheckpointFrames,
  readStartFrames,
  setManualStart,
  setRoster,
  setRowClock,
  storedFromHub,
  updateClockWarnMs,
  voidPunch,
  voidRiderStart,
  voidRowStart,
  type Punch,
  type RiderStart,
  type RosterDeltaMessage,
  type RowStart,
  type StartTime,
  type StationPairing,
  type StationRecord,
  type StoredSyncState,
  type SyncHttpRequest,
  hubStationManifest,
  parseStationUpdateManifest,
  type StationUpdateManifest,
  type SyncHub,
  type SyncSettings,
} from "@mwhe/core";

export interface SyncView {
  settings: SyncSettings;
  stations: StationRecord[];
  punches: Punch[];
  rowStarts: RowStart[];
  riderStarts: RiderStart[];
  manualStarts: StartTime[];
  listeningUrls: string[];
  hubVersion: string;
}

export interface SeedInput {
  stored: StoredSyncState | null;
  rosterDeltas: readonly RosterDeltaMessage[];
  hubVersion: string;
}

export interface SyncHost {
  seed(input: SeedInput): SyncView;
  setRoster(deltas: readonly RosterDeltaMessage[]): SyncView;
  snapshot(): SyncView;
  createPairing(
    input: Omit<Parameters<typeof createPairing>[1], "now" | "secret" | "pairingId">,
  ): { view: SyncView; payload: StationPairing };
  showPairing(
    pairingId: string,
    hubUrl?: string,
  ): { view: SyncView; payload: StationPairing };
  importPunchText(text: string): SyncView;
  rosterQr(eventId: string, since: number): string[];
  setClockWarnMs(ms: number): SyncView;
  setManualStart(start: StartTime): SyncView;
  setRowClock(start: RowStart): SyncView;
  voidRowStart(uuid: string): SyncView;
  voidRiderStart(uuid: string): SyncView;
  setStationUpdate(manifest: StationUpdateManifest, apk: Uint8Array): void;
  addPaperPunch(punch: Punch): SyncView;
  voidPunch(uuid: string): SyncView;
  handle(request: Omit<SyncHttpRequest, "laptopNow"> & { laptopNow?: string }): {
    status: number;
    body: unknown;
  };
}

/**
 * In-memory hub used by the dev server and by tests. The Windows app runs the
 * same rules in the Rust listener. Punches already in memory are merged, not
 * replaced, when the screen seeds from SQLite.
 */
export function createSyncHost(
  urls: string[],
  now: () => string = () => new Date().toISOString(),
): SyncHost {
  let hub: SyncHub = emptySyncHub("0.0.0");
  let stationApk: { manifest: StationUpdateManifest; bytes: Uint8Array } | null = null;

  function view(): SyncView {
    return {
      settings: hub.settings,
      stations: hub.stations,
      punches: hub.punches,
      rowStarts: hub.rowStarts,
      riderStarts: hub.riderStarts,
      manualStarts: hub.manualStarts,
      listeningUrls: urls,
      hubVersion: hub.hubVersion,
    };
  }

  return {
    seed(input) {
      const base = input.stored
        ? hubFromStored(input.stored, input.hubVersion, input.rosterDeltas)
        : setRoster(
            emptySyncHub(input.hubVersion, hub.settings.clockOffsetWarnMs),
            input.rosterDeltas,
          );
      const punches = mergePunches(base.punches, hub.punches).punches;
      const stations = new Map(
        base.stations.map((station) => [station.pairingId, station]),
      );
      for (const station of hub.stations) {
        const previous = stations.get(station.pairingId);
        const newer =
          !previous ||
          (station.lastSyncAt !== null &&
            (previous.lastSyncAt === null || station.lastSyncAt > previous.lastSyncAt));
        if (newer) stations.set(station.pairingId, station);
      }
      hub = {
        ...base,
        punches,
        stations: [...stations.values()],
        settings: input.stored?.settings ?? base.settings,
        rowStarts: dedupeRowStarts([...base.rowStarts, ...hub.rowStarts]),
        riderStarts: dedupeRiderStarts([...base.riderStarts, ...hub.riderStarts]),
        manualStarts: base.manualStarts,
      };
      return view();
    },
    setRoster(deltas) {
      hub = setRoster({ ...hub, hubVersion: hub.hubVersion }, deltas);
      return view();
    },
    snapshot() {
      return view();
    },
    createPairing(input) {
      const created = createPairing(hub, {
        ...input,
        now: now(),
        secret: newPairingSecret(),
        pairingId: crypto.randomUUID(),
      });
      hub = created.hub;
      return { view: view(), payload: created.payload };
    },
    showPairing(pairingId, hubUrl) {
      const payload = pairingFromStation(hub, pairingId, now(), hubUrl);
      if (hubUrl) {
        hub = {
          ...hub,
          stations: hub.stations.map((station) =>
            station.pairingId === pairingId
              ? { ...station, hubUrl: payload.hubUrl }
              : station,
          ),
        };
      }
      return { view: view(), payload };
    },
    importPunchText(text) {
      if (text.includes("qr_start_export")) {
        const starts = assembleStartFrames(readStartFrames(text));
        hub = {
          ...hub,
          rowStarts: dedupeRowStarts([...hub.rowStarts, ...starts.rowStarts]),
          riderStarts: dedupeRiderStarts([...hub.riderStarts, ...starts.riderStarts]),
        };
        return view();
      }
      const punches = assembleCheckpointFrames(readCheckpointFrames(text));
      hub = addPunches(hub, punches).hub;
      return view();
    },
    rosterQr(eventId, since) {
      const deltas = hub.rosterDeltas.filter(
        (delta) => delta.eventId === eventId && delta.version > since,
      );
      return encodeRosterQr({ eventId, exportedAt: now(), deltas });
    },
    setClockWarnMs(ms) {
      hub = updateClockWarnMs(hub, ms);
      return view();
    },
    setManualStart(start) {
      hub = setManualStart(hub, start);
      return view();
    },
    setRowClock(start) {
      hub = setRowClock(hub, start);
      return view();
    },
    voidRowStart(uuid) {
      hub = voidRowStart(hub, uuid);
      return view();
    },
    voidRiderStart(uuid) {
      hub = voidRiderStart(hub, uuid);
      return view();
    },
    setStationUpdate(manifest, apk) {
      const parsed = parseStationUpdateManifest(manifest);
      if (parsed.debug)
        throw new Error("A debug station build is not offered to phones.");
      stationApk = { manifest: parsed, bytes: apk };
    },
    addPaperPunch(punch) {
      hub = addPunches(hub, [punchSchema.parse(punch)]).hub;
      return view();
    },
    voidPunch(uuid) {
      hub = voidPunch(hub, uuid);
      return view();
    },
    handle(request) {
      const path = request.path.split("?")[0] ?? request.path;
      if (request.method.toUpperCase() === "GET" && path === "/sync/station-update") {
        if (
          !stationApk ||
          !stationApkMatches(stationApk.manifest.version, hub.hubVersion)
        ) {
          return { status: 404, body: { message: "No station update is cached." } };
        }
        return { status: 200, body: hubStationManifest(stationApk.manifest) };
      }
      if (request.method.toUpperCase() === "GET" && path === "/sync/station-apk") {
        if (
          !stationApk ||
          !stationApkMatches(stationApk.manifest.version, hub.hubVersion)
        ) {
          return { status: 404, body: { message: "No station update is cached." } };
        }
        return { status: 200, body: stationApk.bytes };
      }
      const result = handleSyncRequest(hub, {
        ...request,
        laptopNow: request.laptopNow ?? now(),
      });
      hub = result.hub;
      return result.response;
    },
  };
}

function stationApkMatches(apkVersion: string, hubVersion: string): boolean {
  return apkVersion === hubVersion.replace(/^v(?=\d)/, "");
}

export function storedOf(view: SyncView): StoredSyncState {
  return storedFromHub({
    schemaVersion: 1,
    settings: view.settings,
    stations: view.stations,
    punches: view.punches,
    rowStarts: view.rowStarts,
    riderStarts: view.riderStarts,
    manualStarts: view.manualStarts,
    rosterDeltas: [],
    hubVersion: view.hubVersion,
  });
}
