import { readFileSync } from "node:fs";

import { rosterDeltaMessageSchema } from "@mwhe/core";
import { describe, expect, it } from "vitest";

import { APP_VERSION } from "../app-version";
import { createSyncHost } from "./host";

describe("app versions", () => {
  it("keeps the laptop and the station on the same version", () => {
    const laptop = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      version: string;
    };
    const station = JSON.parse(
      readFileSync(new URL("../../../station/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const tauri = JSON.parse(
      readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(laptop.version).toBe(APP_VERSION);
    expect(station.version).toBe(APP_VERSION);
    expect(tauri.version).toBe(APP_VERSION);
    expect(APP_VERSION).toBe("0.4.0");
  });
});

describe("sync host", () => {
  it("pairs a phone, dedupes punches, and keeps a void", () => {
    const host = createSyncHost(
      ["http://127.0.0.1:1420"],
      () => "2026-06-14T15:00:00.000Z",
    );
    host.seed({
      stored: null,
      hubVersion: "0.3.0",
      rosterDeltas: [
        rosterDeltaMessageSchema.parse({
          schemaVersion: 1,
          type: "roster_delta",
          eventId: "evt-1",
          version: 1,
          baseVersion: 0,
          upserts: [{ name: "Alex Hargrove", number: 1, class: "Pro" }],
          removals: [],
        }),
      ],
    });
    const { payload } = host.createPairing({
      hubUrl: "http://127.0.0.1:1420",
      eventId: "evt-1",
      eventName: "Gnaw Bone",
      raceId: "race-1",
      raceName: "Championship",
      checkId: "cp1",
      checkName: "CP1",
    });
    const hello = host.handle({
      method: "POST",
      path: "/sync/pair",
      headers: { authorization: `Bearer ${payload.pairingSecret}` },
      body: {
        schemaVersion: 1,
        type: "station_hello",
        deviceId: "00000000-0000-4000-8000-0000000000d1",
        eventId: "evt-1",
        raceId: "race-1",
        checkId: "cp1",
        appVersion: "0.3.0",
        deviceNow: "2026-06-14T15:00:03.000Z",
        rosterVersion: 0,
        batteryPercent: 90,
      },
    });
    expect(hello.status).toBe(200);
    expect(hello.body).toMatchObject({ goLiveAllowed: true, clockOffsetMs: 3_000 });
    const punch = {
      schemaVersion: 1,
      uuid: "00000000-0000-4000-8000-000000000099",
      checkId: "cp1",
      deviceId: "00000000-0000-4000-8000-0000000000d1",
      eventId: "evt-1",
      riderNumber: 999,
      timestamp: "2026-06-14T15:10:00.000Z",
      createdAt: "2026-06-14T15:10:00.000Z",
      voided: false,
      unknownNumber: true,
    };
    const push = {
      schemaVersion: 1,
      type: "push_punches",
      deviceId: punch.deviceId,
      eventId: "evt-1",
      sentAt: "2026-06-14T15:10:00.000Z",
      appVersion: "0.3.0",
      punches: [punch],
    };
    expect(
      host.handle({
        method: "POST",
        path: "/sync/punches",
        headers: { authorization: `Bearer ${payload.pairingSecret}` },
        body: push,
      }).body,
    ).toMatchObject({ accepted: 1 });
    expect(
      host.handle({
        method: "POST",
        path: "/sync/punches",
        headers: { authorization: `Bearer ${payload.pairingSecret}` },
        body: { ...push, punches: [{ ...punch, voided: true }] },
      }).body,
    ).toMatchObject({ voidsApplied: 1 });
    expect(host.snapshot().punches[0]?.voided).toBe(true);
    expect(host.snapshot().stations[0]?.batteryPercent).toBe(90);
  });
});
