import {
  assembleCheckpointFrames,
  createPairing,
  emptySyncHub,
  readCheckpointFrames,
  rosterDeltaMessageSchema,
  type RosterDeltaMessage,
  type StationPairing,
} from "@mwhe/core";
import { describe, expect, it } from "vitest";

import { memoryStorage } from "./storage";
import {
  acceptRosterDeltas,
  decidePunch,
  exportPunchQr,
  freshStation,
  goLive,
  importRosterQr,
  loadStation,
  lockSetup,
  persistStation,
  recordRiderStart,
  recordRowGo,
  setDoubleTapWindow,
  voidLatestPunch,
  voidLatestStart,
  type StationState,
} from "./station-state";
const DEVICE = "00000000-0000-4000-8000-0000000000d1";
const NOW = "2026-06-14T15:00:00.000Z";
const LATER = "2026-06-14T15:00:30.000Z";

function pairing(version = "0.3.0"): StationPairing {
  return createPairing(emptySyncHub(version), {
    hubUrl: "http://127.0.0.1:8788",
    eventId: "evt-1",
    eventName: "Gnaw Bone",
    raceId: "race-1",
    raceName: "Championship",
    checkId: "cp2",
    checkName: "CP2 Ridge",
    now: "2026-06-14T14:59:58.000Z",
    secret: "ab".repeat(32),
    pairingId: "00000000-0000-4000-8000-0000000000a1",
  }).payload;
}

function delta(version: number): RosterDeltaMessage {
  return rosterDeltaMessageSchema.parse({
    schemaVersion: 1,
    type: "roster_delta",
    eventId: "evt-1",
    version,
    baseVersion: version - 1,
    upserts:
      version === 1
        ? [{ name: "Alex Hargrove", number: 1, class: "Pro" }]
        : [{ name: "Riley Cole", number: 510, class: "C" }],
    removals: version === 2 ? [] : [],
  });
}

function liveState(): StationState {
  const locked = lockSetup(freshStation(DEVICE), pairing(), NOW, "0.3.0");
  const withRoster = acceptRosterDeltas(locked, [delta(1)]);
  return goLive(withRoster, "0.3.0");
}

describe("station punch store", () => {
  it("saves a punch and still has it after the file is reopened", async () => {
    const storage = memoryStorage();
    const saved = decidePunch(liveState(), "1", NOW, false);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    await persistStation(storage, saved.state);
    const reopened = await loadStation(storage, () => "should-not-be-used");
    expect(reopened.punches).toEqual(saved.state.punches);
    expect(reopened.deviceId).toBe(DEVICE);
  });

  it("falls back to the backup file when the latest write is unreadable", async () => {
    const storage = memoryStorage();
    const first = decidePunch(liveState(), "1", NOW, false);
    if (!first.ok) throw new Error("expected a punch");
    await persistStation(storage, first.state);
    const second = decidePunch(first.state, "510", LATER, false);
    if (!second.ok) throw new Error("expected a second punch");
    await persistStation(storage, second.state);
    await storage.set("station-state", "{not json");
    const reopened = await loadStation(storage);
    expect(reopened.punches.map((punch) => punch.riderNumber)).toEqual([1]);
  });

  it("voids the latest punch and leaves the earlier one", () => {
    const first = decidePunch(liveState(), "1", NOW, false);
    if (!first.ok) throw new Error("expected a punch");
    const second = decidePunch(first.state, "510", LATER, false);
    if (!second.ok) throw new Error("expected a second punch");
    const undone = voidLatestPunch(second.state);
    expect(undone?.punch.riderNumber).toBe(510);
    expect(undone?.punch.voided).toBe(true);
    expect(undone?.state.punches[0]?.voided).toBe(false);
    const again = undone ? voidLatestPunch(undone.state) : null;
    expect(again?.punch.riderNumber).toBe(1);
  });

  it("warns on a double tap and still saves when the checker confirms", () => {
    const first = decidePunch(liveState(), "42", NOW, false);
    if (!first.ok) throw new Error("expected a punch");
    const warned = decidePunch(first.state, "42", LATER, false);
    expect(warned.ok).toBe(false);
    if (warned.ok || warned.reason !== "double_tap")
      throw new Error("expected a warning");
    expect(first.state.punches).toHaveLength(1);
    const confirmed = decidePunch(first.state, "42", LATER, true);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.state.punches).toHaveLength(2);
  });

  it("turns the double-tap warning off when the window is zero", () => {
    const first = decidePunch(liveState(), "42", NOW, false);
    if (!first.ok) throw new Error("expected a punch");
    const quiet = setDoubleTapWindow(first.state, 0);
    const second = decidePunch(quiet, "42", LATER, false);
    expect(second.ok).toBe(true);
  });

  it("saves a number that is not on the roster and marks it unknown", () => {
    const saved = decidePunch(liveState(), "999", NOW, false);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.unknown).toBe(true);
    expect(saved.punch.unknownNumber).toBe(true);
    expect(saved.punch.riderNumber).toBe(999);
    const known = decidePunch(saved.state, "1", LATER, false);
    expect(known.ok && known.unknown).toBe(false);
  });

  it("applies roster deltas in order and keeps a number that was updated", () => {
    const locked = lockSetup(freshStation(DEVICE), pairing(), NOW, "0.3.0");
    const next = acceptRosterDeltas(locked, [delta(1), delta(2)]);
    expect(next.roster?.version).toBe(2);
    expect(next.roster?.riders.find((rider) => rider.number === 510)?.name).toBe(
      "Riley Cole",
    );
    expect(next.roster?.riders.find((rider) => rider.number === 1)?.class).toBe("Pro");
  });

  it("refuses to go live when the laptop version does not match", () => {
    const locked = lockSetup(freshStation(DEVICE), pairing("0.2.1"), NOW, "0.3.0");
    expect(locked.setup?.goLiveAllowed).toBe(false);
    expect(() => goLive(locked, "0.3.0")).toThrow(/cannot go live|version/i);
  });

  it("round-trips chunked punch QR codes", () => {
    const first = decidePunch(liveState(), "1", NOW, false);
    if (!first.ok) throw new Error("expected a punch");
    const second = decidePunch(
      { ...first.state, settings: { ...first.state.settings, doubleTapWindowMs: 0 } },
      "999",
      LATER,
      false,
    );
    if (!second.ok) throw new Error("expected a second punch");
    const texts = exportPunchQr(second.state, "2026-06-14T16:00:00.000Z", 1);
    expect(texts.length).toBe(2);
    const imported = assembleCheckpointFrames(readCheckpointFrames(texts.join("\n\n")));
    expect(imported.map((punch) => punch.uuid)).toEqual(
      second.state.punches.map((punch) => punch.uuid),
    );
    expect(imported[1]?.unknownNumber).toBe(true);
    expect(imported[0]?.checkId).toBe("cp2");
    expect(imported[0]?.deviceId).toBe(DEVICE);
  });

  it("applies a roster QR without dropping riders already on the phone", () => {
    const locked = lockSetup(freshStation(DEVICE), pairing(), NOW, "0.3.0");
    const first = acceptRosterDeltas(locked, [delta(1)]);
    const texts = [
      JSON.stringify({
        schemaVersion: 1,
        type: "qr_roster_export",
        eventId: "evt-1",
        exportedAt: "2026-06-14T16:00:00.000Z",
        part: 1,
        parts: 1,
        deltas: [delta(2)],
      }),
    ];
    const next = importRosterQr(
      first,
      texts.map((text) => JSON.parse(text)),
    );
    expect(next.roster?.riders.map((rider) => rider.number)).toEqual([1, 510]);
  });
});

function startPairing(): StationPairing {
  return createPairing(emptySyncHub("0.4.0"), {
    hubUrl: "http://127.0.0.1:8788",
    eventId: "evt-1",
    eventName: "Gnaw Bone",
    raceId: "race-1",
    raceName: "Championship",
    checkId: "start",
    checkName: "Start",
    role: "start",
    startRows: [
      { order: 1, label: "Row 1", classes: ["Pro"] },
      { order: 2, label: "Row 2", classes: ["A"] },
    ],
    now: "2026-06-14T14:59:58.000Z",
    secret: "cd".repeat(32),
    pairingId: "00000000-0000-4000-8000-0000000000a2",
  }).payload;
}

describe("start and finish stations", () => {
  it("records a row go, warns on a second tap, and voids the latest start", () => {
    const locked = lockSetup(freshStation(DEVICE), startPairing(), NOW, "0.4.0");
    const live = goLive(locked, "0.4.0");
    expect(live.setup?.role).toBe("start");
    const first = recordRowGo(live, 1, NOW, false);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const warned = recordRowGo(first.state, 1, LATER, false);
    expect(warned.ok).toBe(false);
    if (warned.ok || warned.reason !== "already") throw new Error("expected a warning");
    const confirmed = recordRowGo(first.state, 1, LATER, true);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const late = recordRiderStart(
      confirmed.state,
      "42",
      "2026-06-14T15:01:00.000Z",
      false,
    );
    expect(late.ok).toBe(true);
    if (!late.ok) return;
    const undone = voidLatestStart(late.state);
    expect(undone?.label).toBe("#42");
    expect(undone?.state.riderStarts[0]?.voided).toBe(true);
    expect(undone?.state.rowStarts.every((entry) => !entry.voided)).toBe(true);
  });

  it("locks a finish phone to the finish check and saves a finish punch", () => {
    const payload = createPairing(emptySyncHub("0.4.0"), {
      hubUrl: "http://127.0.0.1:8788",
      eventId: "evt-1",
      eventName: "Gnaw Bone",
      raceId: "race-1",
      raceName: "Championship",
      checkId: "finish",
      checkName: "Finish",
      role: "finish",
      now: "2026-06-14T14:59:58.000Z",
      secret: "ef".repeat(32),
      pairingId: "00000000-0000-4000-8000-0000000000a3",
    }).payload;
    const live = goLive(lockSetup(freshStation(DEVICE), payload, NOW, "0.4.0"), "0.4.0");
    const saved = decidePunch(live, "7", NOW, false);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.punch.checkId).toBe("finish");
    expect(live.setup?.role).toBe("finish");
  });
});
