import {
  createSampleRacePackage,
  getRacePackage,
  importRacePackage,
  createSignInState,
  MOCK_APP_ID,
  MOCK_DIRECTOR,
  MOCK_GOOGLE_DIRECTOR,
  MOCK_RIDER,
  registerNewRider,
  SAMPLE_EVENT_ID,
  signInWithPassword,
} from "@mwhe/core";
import { startMockSite } from "@mwhe/core/mock";
import { describe, expect, it } from "vitest";

import { createMemoryCredentialStore } from "../auth/credentials";
import {
  completeGoogleSignIn,
  completeSignIn,
  confirmSession,
  downloadRacePackage,
  dropRejectedSession,
  SignInError,
} from "../auth/sign-in";
import { toNumberedPlaceholders } from "./sql";
import { createSqlJsExecutor } from "./sqljs";
import { createHubStore, defaultSiteOrigin, LIVE_SITE_ORIGIN } from "./store";

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
      appId: MOCK_APP_ID,
      account: {
        userId: MOCK_DIRECTOR.id,
        email: MOCK_DIRECTOR.email,
        name: MOCK_DIRECTOR.name,
        role: "race_director",
      },
      state: next,
    });

    const reopened = createHubStore(
      await createSqlJsExecutor({ bytes: db.exportBytes() }),
    );
    const loaded = await reopened.load();
    expect(loaded.operatorName).toBe("Dana Director");
    expect(loaded.appId).toBe(MOCK_APP_ID);
    expect(loaded.account?.email).toBe(MOCK_DIRECTOR.email);
    expect(loaded.account?.role).toBe("race_director");
    expect(loaded.state?.rosterVersion).toBe(2);
    expect(loaded.state?.dayOfRegistrations[0]?.name).toBe("Sam Ellis");
    expect(loaded.state?.snapshot.registrations).toHaveLength(10);

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

describe("site origin", () => {
  it("uses the mock site in dev and the live site in a packaged build", () => {
    expect(defaultSiteOrigin(true)).toBe("http://127.0.0.1:8787");
    expect(defaultSiteOrigin(false)).toBe(LIVE_SITE_ORIGIN);
  });

  it("starts a new database on the default site with nobody signed in", async () => {
    const loaded = await createHubStore(await createSqlJsExecutor()).load();
    expect(loaded.baseUrl).toBe(defaultSiteOrigin());
    expect(loaded.appId).toBe("");
    expect(loaded.account).toBeNull();
    expect(loaded.state).toBeNull();
  });
});

describe("package download", () => {
  it("stores a package from the mock site and does not store the token or password", async () => {
    const site = await startMockSite();
    const credentials = createMemoryCredentialStore();
    try {
      const account = await completeSignIn(credentials, {
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_DIRECTOR.email,
        password: MOCK_DIRECTOR.password,
      });
      const savedToken = await credentials.readToken();
      expect(savedToken).toBeTruthy();
      expect(account.role).toBe("race_director");

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
        appId: MOCK_APP_ID,
        account,
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
      expect(dumped.includes(savedToken ?? "missing-token")).toBe(false);
      expect(dumped.includes(MOCK_DIRECTOR.password)).toBe(false);

      await expect(
        completeSignIn(credentials, {
          baseUrl: site.url,
          appId: MOCK_APP_ID,
          email: MOCK_RIDER.email,
          password: MOCK_RIDER.password,
        }),
      ).rejects.toBeInstanceOf(SignInError);
      expect(await credentials.readToken()).toBe(savedToken);

      await credentials.clearToken();
      expect(await credentials.readToken()).toBeNull();
    } finally {
      await site.close();
    }
  });

  it("signs a Google account in with a one-time code", async () => {
    const site = await startMockSite();
    const credentials = createMemoryCredentialStore();
    try {
      await expect(
        completeSignIn(credentials, {
          baseUrl: site.url,
          appId: MOCK_APP_ID,
          email: MOCK_GOOGLE_DIRECTOR.email,
          password: "attempted-password",
        }),
      ).rejects.toMatchObject({ status: 400, code: "no_password" });
      expect(await credentials.readToken()).toBeNull();

      const state = createSignInState();
      const chosen = await fetch(`${site.url}/laptop-signin/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: MOCK_GOOGLE_DIRECTOR.email,
          state,
          callback: "https://evil.test/callback",
        }),
      });
      const html = await chosen.text();
      const code = /id="code">([^<]+)</.exec(html)?.[1] ?? "";
      expect(html).not.toContain("evil.test");
      const account = await completeGoogleSignIn(credentials, {
        baseUrl: site.url,
        code,
        state,
      });
      expect(account).toMatchObject({
        email: MOCK_GOOGLE_DIRECTOR.email,
        role: "race_director",
      });
      const token = await credentials.readToken();
      expect(token).toBeTruthy();
      expect(html).not.toContain(token ?? "missing-token");
      const racePackage = await downloadRacePackage(credentials, {
        baseUrl: site.url,
        eventId: SAMPLE_EVENT_ID,
      });
      expect(racePackage.event.id).toBe(SAMPLE_EVENT_ID);
    } finally {
      await site.close();
    }
  });

  it("drops an expired token and keeps a downloaded race usable offline", async () => {
    const site = await startMockSite();
    const credentials = createMemoryCredentialStore();
    try {
      await completeSignIn(credentials, {
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_DIRECTOR.email,
        password: MOCK_DIRECTOR.password,
      });
      const racePackage = await downloadRacePackage(credentials, {
        baseUrl: site.url,
        eventId: SAMPLE_EVENT_ID,
      });
      expect(racePackage.event.id).toBe(SAMPLE_EVENT_ID);

      await credentials.writeToken("revoked-session");
      await expect(
        downloadRacePackage(credentials, {
          baseUrl: site.url,
          eventId: SAMPLE_EVENT_ID,
        }),
      ).rejects.toMatchObject({ code: "session_expired" });
      expect(await credentials.readToken()).toBeNull();

      const rider = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_RIDER.email,
        password: MOCK_RIDER.password,
      });
      await credentials.writeToken(rider.token);
      await expect(
        downloadRacePackage(credentials, {
          baseUrl: site.url,
          eventId: SAMPLE_EVENT_ID,
        }),
      ).rejects.toMatchObject({ code: "forbidden_role" });
      expect(await credentials.readToken()).toBeNull();

      const offline = await confirmSession({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        token: "still-saved-while-offline",
        fetch: async () => {
          throw new Error("offline");
        },
      });
      expect(offline.kind).toBe("keep");
      await dropRejectedSession(credentials, offline);
      await credentials.writeToken("still-saved-while-offline");
      expect(await credentials.readToken()).toBe("still-saved-while-offline");

      const expired = await confirmSession({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        token: "still-saved-while-offline",
      });
      expect(expired.kind).toBe("reject");
      if (expired.kind === "reject") {
        await dropRejectedSession(credentials, expired);
      }
      expect(await credentials.readToken()).toBeNull();
    } finally {
      await site.close();
    }
  });

  it("reads a phase 1 database that has no sign-in columns yet", async () => {
    const db = await createSqlJsExecutor();
    await db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00.000Z');
      CREATE TABLE hub (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        operator_name TEXT,
        base_url TEXT NOT NULL,
        state_json TEXT
      );
      INSERT INTO hub (id, operator_name, base_url, state_json)
      VALUES (1, 'Dana Director', 'https://midwesthardenduro.com', NULL);
    `);
    const loaded = await createHubStore(db).load();
    expect(loaded.operatorName).toBe("Dana Director");
    expect(loaded.baseUrl).toBe(LIVE_SITE_ORIGIN);
    expect(loaded.appId).toBe("");
    expect(loaded.account).toBeNull();
    expect(loaded.state).toBeNull();
  });
});
