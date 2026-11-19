import {
  createPairing,
  emptySyncHub,
  handleSyncRequest,
  rosterDeltaMessageSchema,
  setRoster,
  type SyncHub,
} from "@mwhe/core";
import { describe, expect, it } from "vitest";

import { decidePunch, freshStation, goLive, lockSetup } from "./station-state";
import { syncWithHub } from "./sync";

const DEVICE = "00000000-0000-4000-8000-0000000000d1";
const NOW = "2026-06-14T15:00:02.000Z";

function harness(version = "0.3.0") {
  const delta = rosterDeltaMessageSchema.parse({
    schemaVersion: 1,
    type: "roster_delta",
    eventId: "evt-1",
    version: 1,
    baseVersion: 0,
    upserts: [{ name: "Alex Hargrove", number: 1, class: "Pro" }],
    removals: [],
  });
  const created = createPairing(setRoster(emptySyncHub(version), [delta]), {
    hubUrl: "http://127.0.0.1:8788",
    eventId: "evt-1",
    eventName: "Gnaw Bone",
    raceId: "race-1",
    raceName: "Championship",
    checkId: "cp2",
    checkName: "CP2 Ridge",
    now: "2026-06-14T15:00:00.000Z",
    secret: "cd".repeat(32),
    pairingId: "00000000-0000-4000-8000-0000000000a1",
  });
  const box: { hub: SyncHub } = { hub: created.hub };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const header = new Headers(init?.headers);
    const result = handleSyncRequest(box.hub, {
      method: init?.method ?? "GET",
      path: new URL(url).pathname,
      headers: { authorization: header.get("authorization") ?? undefined },
      body: init?.body ? JSON.parse(String(init.body)) : null,
      laptopNow: "2026-06-14T15:00:00.000Z",
    });
    box.hub = result.hub;
    return new Response(JSON.stringify(result.response.body), {
      status: result.response.status,
      headers: { "content-type": "application/json" },
    });
  };
  const locked = lockSetup(freshStation(DEVICE), created.payload, NOW, "0.3.0");
  return { fetchImpl, locked, box };
}

describe("station sync client", () => {
  it("pushes punches and applies the roster the laptop sends back", async () => {
    const { fetchImpl, locked } = harness();
    const live = goLive(locked, "0.3.0");
    const punched = decidePunch(live, "999", NOW, false);
    if (!punched.ok) throw new Error("expected a punch");
    const outcome = await syncWithHub(punched.state, {
      deviceNow: NOW,
      batteryPercent: 77,
      fetchImpl,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.state.roster?.riders[0]?.name).toBe("Alex Hargrove");
    expect(outcome.state.setup?.offsetConfirmed).toBe(true);
    expect(outcome.state.setup?.clockOffsetMs).toBe(2_000);
    expect(outcome.state.punches).toHaveLength(1);
    const again = await syncWithHub(outcome.state, {
      deviceNow: NOW,
      batteryPercent: 76,
      fetchImpl,
    });
    expect(again.ok).toBe(true);
    expect(again.message).toContain("0 new");
  });

  it("does not go live when the hub is a different version, and still uploads", async () => {
    const { fetchImpl, locked } = harness("0.2.1");
    expect(locked.setup?.goLiveAllowed).toBe(false);
    const forced = { ...locked, live: true };
    const punched = decidePunch(forced, "1", NOW, false);
    if (!punched.ok) throw new Error("expected a punch");
    const outcome = await syncWithHub(punched.state, {
      deviceNow: NOW,
      batteryPercent: null,
      fetchImpl,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.state.live).toBe(false);
    expect(outcome.state.setup?.goLiveAllowed).toBe(false);
    expect(outcome.state.punches).toHaveLength(1);
    expect(outcome.message).toMatch(/cannot go live/i);
  });
});
