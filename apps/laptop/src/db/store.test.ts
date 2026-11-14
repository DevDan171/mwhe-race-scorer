import {
  createSampleRacePackage,
  getRacePackage,
  importRacePackage,
  registerNewRider,
  SAMPLE_EVENT_ID,
} from "@mwhe/core";
import { startMockSite } from "@mwhe/core/mock";
import { describe, expect, it } from "vitest";

import { createMemoryCredentialStore } from "../auth/credentials";
import { completeSignIn, SignInError } from "../auth/sign-in";
import { toNumberedPlaceholders } from "./sql";
import { createSqlJsExecutor } from "./sqljs";
import { createHubStore } from "./store";

describe("sqlite placeholders", () => {
  it("numbers question marks for the Tauri SQL plugin", () => {
    expect(
      toNumberedPlaceholders("SELECT * FROM hub WHERE id = ? AND base_url = ?"),
    ).toBe("SELECT * FROM hub WHERE id = $1 AND base_url = $2");
  });
});

describe("hub sqlite", () => {
  it("keeps the race and the changelog across a reopen", async () => {
    const db = await createSqlJsExecutor();
    const store = createHubStore(db);
    const imported = importRacePackage({
      racePackage: createSampleRacePackage(),
      downloadedAt: "2026-09-11T18:00:00.000Z",
    });
    const next = registerNewRider(imported, {
      seriesId: "dayof-sam",
      name: "Sam Ellis",
      number: 501,
      class: "C",
      audit: {
        who: "Dana Director",
        when: "2026-09-12T08:00:00.000Z",
        why: "New rider at the trailer",
        entryId: "00000000-0000-4000-8000-000000000501",
      },
    });
    await store.save({
      operatorName: "Dana Director",
      baseUrl: "http://127.0.0.1:8787",
      state: next,
    });

    const reopened = createHubStore(
      await createSqlJsExecutor({ bytes: db.exportBytes() }),
    );
    const loaded = await reopened.load();
    expect(loaded.operatorName).toBe("Dana Director");
    expect(loaded.state?.rosterVersion).toBe(2);
    expect(loaded.state?.dayOfRegistrations[0]?.name).toBe("Sam Ellis");
    expect(loaded.state?.snapshot.registrations).toHaveLength(9);

    const rows = await (
      await createSqlJsExecutor({ bytes: db.exportBytes() })
    ).all(
      "SELECT who, reason, entity_type, action, before_json, after_json FROM changelog_entry ORDER BY seq",
    );
    expect(rows).toEqual([
      {
        who: "Dana Director",
        reason: "New rider at the trailer",
        entity_type: "registration",
        action: "add",
        before_json: null,
        after_json: JSON.stringify({
          number: 501,
          name: "Sam Ellis",
          class: "C",
          seriesId: "dayof-sam",
          dayOf: true,
        }),
      },
    ]);
  });
});

describe("package download", () => {
  it("stores a package from the mock site and does not store the token", async () => {
    const site = await startMockSite();
    const token = "director-session-for-download-test";
    const credentials = createMemoryCredentialStore();
    try {
      await completeSignIn(credentials, { kind: "pasted_token", token });
      const savedToken = await credentials.readToken();
      const racePackage = await getRacePackage({
        baseUrl: site.url,
        eventId: SAMPLE_EVENT_ID,
        token: savedToken ?? "",
      });
      const db = await createSqlJsExecutor();
      const store = createHubStore(db);
      await store.save({
        operatorName: "Dana Director",
        baseUrl: site.url,
        state: importRacePackage({
          racePackage,
          downloadedAt: "2026-09-11T18:30:00.000Z",
        }),
      });
      const loaded = await store.load();
      expect(loaded.state?.downloadedAt).toBe("2026-09-11T18:30:00.000Z");
      expect(loaded.state?.rosterVersion).toBe(1);
      expect(loaded.state?.race.event.name).toBe("Round 4 — Gnaw Bone");
      expect(loaded.state?.race.races).toHaveLength(2);
      const dumped = new TextDecoder().decode(db.exportBytes());
      expect(dumped.includes(token)).toBe(false);

      await credentials.clearToken();
      expect(await credentials.readToken()).toBeNull();
      await expect(
        completeSignIn(credentials, { kind: "device_code", deviceCode: "ABCD" }),
      ).rejects.toBeInstanceOf(SignInError);
      expect(await credentials.readToken()).toBeNull();
    } finally {
      await site.close();
    }
  });
});
