import { describe, expect, it } from "vitest";

import { PRIVATE_RIDER_FIELDS } from "../schemas/race-package.js";
import { rosterDeltaMessageSchema, type RosterDeltaMessage } from "../schemas/sync.js";
import { createSampleRacePackage } from "../fixtures/sample-race-package.js";
import { importRacePackage } from "../registration/service.js";
import { makePunch } from "../test-support.js";
import { SCHEMA_VERSION } from "../version.js";
import {
  applyHello,
  applyPunchPush,
  createPairing,
  emptySyncHub,
  handleSyncRequest,
  newPairingSecret,
  setRoster,
  type SyncHub,
} from "./hub.js";

const NOW = "2026-06-14T15:00:00.000Z";
const SECRET = "ab".repeat(32);
const PAIRING_ID = "00000000-0000-4000-8000-0000000000a1";
const DEVICE = "00000000-0000-4000-8000-0000000000d1";

function delta(version: number): RosterDeltaMessage {
  return rosterDeltaMessageSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "roster_delta",
    eventId: "evt-1",
    version,
    baseVersion: version - 1,
    upserts:
      version === 1
        ? [{ name: "Alex Hargrove", number: 1, class: "Pro" }]
        : [{ name: "Riley Cole", number: 510, class: "C" }],
    removals: [],
  });
}

function pairedHub(): SyncHub {
  const created = createPairing(setRoster(emptySyncHub("0.3.0"), [delta(1), delta(2)]), {
    hubUrl: "http://192.168.4.20:8788/",
    eventId: "evt-1",
    eventName: "Gnaw Bone",
    raceId: "race-1",
    raceName: "Championship",
    checkId: "cp2",
    checkName: "CP2 Ridge",
    now: NOW,
    secret: SECRET,
    pairingId: PAIRING_ID,
  });
  return created.hub;
}

function hello(version = "0.3.0", rosterVersion = 0) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: "station_hello",
    deviceId: DEVICE,
    eventId: "evt-1",
    raceId: "race-1",
    checkId: "cp2",
    appVersion: version,
    deviceNow: "2026-06-14T15:00:02.500Z",
    batteryPercent: 81,
    rosterVersion,
  };
}

describe("sync hub", () => {
  it("rejects a phone that does not have this station's secret", () => {
    const result = handleSyncRequest(pairedHub(), {
      method: "POST",
      path: "/sync/pair",
      headers: { authorization: "Bearer " + "cd".repeat(32) },
      body: hello(),
      laptopNow: NOW,
    });
    expect(result.response.status).toBe(401);
    expect(JSON.stringify(result.response.body)).not.toContain(SECRET);
  });

  it("blocks go-live on a different app version and still returns the roster", () => {
    const result = applyHello(pairedHub(), SECRET, hello("0.2.1"), NOW);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      goLiveAllowed: false,
      reason: "app_version_mismatch",
      hubVersion: "0.3.0",
      clockOffsetMs: 2_500,
    });
    expect(result.hub.stations[0]?.goLiveAllowed).toBe(false);
    expect(result.hub.stations[0]?.appVersion).toBe("0.2.1");
  });

  it("checks a matching phone in and sends roster deltas newer than its version", () => {
    const result = applyHello(pairedHub(), SECRET, hello("0.3.0", 1), NOW);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      goLiveAllowed: true,
      reason: null,
      clockOffsetMs: 2_500,
    });
    const deltas = (result.body as { rosterDeltas: RosterDeltaMessage[] }).rosterDeltas;
    expect(deltas.map((entry) => entry.version)).toEqual([2]);
    expect(result.hub.stations[0]?.deviceId).toBe(DEVICE);
    expect(result.hub.stations[0]?.batteryPercent).toBe(81);
  });

  it("refuses a second phone that reuses the code", () => {
    const first = applyHello(pairedHub(), SECRET, hello(), NOW).hub;
    const second = applyHello(
      first,
      SECRET,
      { ...hello(), deviceId: "00000000-0000-4000-8000-0000000000d2" },
      NOW,
    );
    expect(second.status).toBe(409);
    expect(second.hub.stations[0]?.deviceId).toBe(DEVICE);
  });

  it("stores a new punch, ignores a duplicate, and applies a later void", () => {
    const hub = applyHello(pairedHub(), SECRET, hello("0.3.0", 2), NOW).hub;
    const punch = {
      ...makePunch({ n: 9, riderNumber: 999, checkId: "cp2", offsetSeconds: 30 }),
      deviceId: DEVICE,
      eventId: "evt-1",
      raceId: "race-1",
      clockOffsetMs: 2_500,
      unknownNumber: true,
    };
    const push = {
      schemaVersion: SCHEMA_VERSION,
      type: "push_punches",
      deviceId: DEVICE,
      eventId: "evt-1",
      raceId: "race-1",
      checkId: "cp2",
      sentAt: NOW,
      deviceNow: "2026-06-14T15:00:02.500Z",
      appVersion: "0.3.0",
      rosterVersion: 2,
      batteryPercent: 80,
      punches: [punch],
    };
    const first = applyPunchPush(hub, SECRET, push, NOW);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ accepted: 1, duplicates: 0, goLiveAllowed: true });
    expect(first.hub.punches).toHaveLength(1);
    expect(first.hub.punches[0]?.unknownNumber).toBe(true);

    const again = applyPunchPush(first.hub, SECRET, push, NOW);
    expect(again.body).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(again.hub.punches).toHaveLength(1);

    const voided = applyPunchPush(
      again.hub,
      SECRET,
      { ...push, punches: [{ ...punch, voided: true }] },
      NOW,
    );
    expect(voided.body).toMatchObject({ voidsApplied: 1 });
    expect(voided.hub.punches[0]?.voided).toBe(true);
  });

  it("keeps punches from a mismatched phone so a late sync is not dropped", () => {
    const hub = applyHello(pairedHub(), SECRET, hello("0.2.1", 0), NOW).hub;
    const punch = {
      ...makePunch({ n: 4, riderNumber: 1, checkId: "cp2" }),
      deviceId: DEVICE,
      eventId: "evt-1",
    };
    const result = applyPunchPush(
      hub,
      SECRET,
      {
        schemaVersion: SCHEMA_VERSION,
        type: "push_punches",
        deviceId: DEVICE,
        eventId: "evt-1",
        sentAt: NOW,
        appVersion: "0.2.1",
        punches: [punch],
      },
      NOW,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      accepted: 1,
      goLiveAllowed: false,
      reason: "app_version_mismatch",
    });
    expect(result.hub.punches).toHaveLength(1);
  });

  it("does not store a punch that belongs to another check", () => {
    const hub = applyHello(pairedHub(), SECRET, hello(), NOW).hub;
    const punch = {
      ...makePunch({ n: 5, riderNumber: 1, checkId: "cp9" }),
      deviceId: DEVICE,
    };
    const result = applyPunchPush(
      hub,
      SECRET,
      {
        schemaVersion: SCHEMA_VERSION,
        type: "push_punches",
        deviceId: DEVICE,
        eventId: "evt-1",
        checkId: "cp2",
        sentAt: NOW,
        punches: [punch],
      },
      NOW,
    );
    expect(result.status).toBe(400);
    expect(result.hub.punches).toHaveLength(0);
  });

  it("rejects a body that carries a contact field", () => {
    const result = handleSyncRequest(pairedHub(), {
      method: "POST",
      path: "/sync/punches",
      headers: { Authorization: `Bearer ${SECRET}` },
      body: {
        schemaVersion: SCHEMA_VERSION,
        type: "push_punches",
        deviceId: DEVICE,
        eventId: "evt-1",
        sentAt: NOW,
        email: "rider@example.com",
        punches: [],
      },
      laptopNow: NOW,
    });
    expect(result.response.status).toBe(400);
    expect(JSON.stringify(result.response.body)).not.toContain("rider@example.com");
    expect(JSON.stringify(result.response.body)).not.toContain("email");
  });

  it("serves roster deltas since the phone's version and nothing private", () => {
    const race = createSampleRacePackage();
    race.registrations[0] = {
      ...race.registrations[0]!,
      phone: "555-0100",
      emergencyContactName: "Pat",
      emergencyContactPhone: "555-0199",
    };
    const state = importRacePackage({
      racePackage: race,
      downloadedAt: NOW,
    });
    const hub = setRoster(emptySyncHub("0.3.0"), state.rosterDeltas);
    const created = createPairing(hub, {
      hubUrl: "http://127.0.0.1:8788",
      eventId: state.race.event.id,
      eventName: state.race.event.name,
      raceId: state.race.races[0]!.id,
      raceName: state.race.races[0]!.name,
      checkId: state.race.event.checks[0]!.id,
      checkName: state.race.event.checks[0]!.name,
      now: NOW,
      secret: newPairingSecret(),
      pairingId: "00000000-0000-4000-8000-0000000000a2",
    });
    const response = handleSyncRequest(created.hub, {
      method: "GET",
      path: "/sync/roster?since=0",
      headers: { authorization: `Bearer ${created.payload.pairingSecret}` },
      body: null,
      laptopNow: NOW,
    });
    expect(response.response.status).toBe(200);
    const encoded = JSON.stringify(response.response.body);
    for (const field of PRIVATE_RIDER_FIELDS) {
      expect(encoded).not.toContain(`"${field}"`);
    }
    expect(encoded).not.toContain("555-0100");
    expect(encoded).toContain("Alex Hargrove");
  });
});
