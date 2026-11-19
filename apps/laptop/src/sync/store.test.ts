import { describe, expect, it } from "vitest";

import { createSqlJsExecutor } from "../db/sqljs";
import { createSyncStore } from "./store";

describe("sync sqlite", () => {
  it("keeps stations and punches across a reopen", async () => {
    const db = await createSqlJsExecutor();
    const store = createSyncStore(db);
    await store.save({
      schemaVersion: 1,
      settings: { clockOffsetWarnMs: 2_000 },
      stations: [
        {
          pairingId: "00000000-0000-4000-8000-0000000000a1",
          pairingSecret: "ab".repeat(32),
          hubUrl: "http://127.0.0.1:8788",
          eventId: "evt-1",
          eventName: "Gnaw Bone",
          raceId: "race-1",
          raceName: "Championship",
          checkId: "cp1",
          checkName: "CP1",
          deviceId: "00000000-0000-4000-8000-0000000000d1",
          appVersion: "0.3.0",
          batteryPercent: 70,
          clockOffsetMs: 2_500,
          lastSyncAt: "2026-06-14T15:00:00.000Z",
          pairedAt: "2026-06-14T14:00:00.000Z",
          goLiveAllowed: true,
          rosterVersion: 1,
        },
      ],
      punches: [
        {
          schemaVersion: 1,
          uuid: "00000000-0000-4000-8000-000000000099",
          checkId: "cp1",
          deviceId: "00000000-0000-4000-8000-0000000000d1",
          riderNumber: 1,
          timestamp: "2026-06-14T15:10:00.000Z",
          createdAt: "2026-06-14T15:10:00.000Z",
          voided: false,
        },
      ],
    });
    const reopened = createSyncStore(
      await createSqlJsExecutor({ bytes: db.exportBytes() }),
    );
    const loaded = await reopened.load();
    expect(loaded?.stations[0]?.checkName).toBe("CP1");
    expect(loaded?.punches).toHaveLength(1);
    expect(loaded?.settings.clockOffsetWarnMs).toBe(2_000);
  });
});
