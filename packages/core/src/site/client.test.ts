import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createSampleRacePackage,
  SAMPLE_EVENT_ID,
} from "../fixtures/sample-race-package.js";
import { packageCounts } from "../registration/service.js";
import {
  assertHubAccess,
  getRacePackage,
  getRacePackageResponseSchema,
  getSignedInUser,
  signInWithPassword,
  SiteApiError,
} from "./client.js";
import {
  BASE44_AUTH_ORIGIN,
  MOCK_ADMIN,
  MOCK_APP_ID,
  MOCK_DIRECTOR,
  MOCK_RIDER,
} from "./mock-accounts.js";
import { startMockSite } from "./mock-server.js";

async function directorToken(baseUrl: string): Promise<string> {
  const session = await signInWithPassword({
    baseUrl,
    appId: MOCK_APP_ID,
    email: MOCK_DIRECTOR.email,
    password: MOCK_DIRECTOR.password,
  });
  return session.token;
}

describe("documented example", () => {
  it("is a race package the laptop accepts", () => {
    const path = new URL(
      "../../../../docs/examples/getRacePackage.response.json",
      import.meta.url,
    );
    const body: unknown = JSON.parse(readFileSync(path, "utf8"));
    expect(getRacePackageResponseSchema.parse(body).racePackage).toEqual(
      createSampleRacePackage(),
    );
  });
});

describe("getRacePackage", () => {
  it("downloads the sample package from the mock site with a signed-in director", async () => {
    const site = await startMockSite();
    const seen: { url: string; authorization: string | null }[] = [];
    try {
      const token = await directorToken(site.url);
      const racePackage = await getRacePackage({
        baseUrl: site.url,
        eventId: SAMPLE_EVENT_ID,
        token,
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const headers = new Headers(init?.headers);
          seen.push({ url: url.toString(), authorization: headers.get("Authorization") });
          expect(url.searchParams.get("eventId")).toBe(SAMPLE_EVENT_ID);
          expect(url.searchParams.has("key")).toBe(false);
          expect(url.searchParams.has("apiKey")).toBe(false);
          return fetch(input, init);
        },
      });
      expect(racePackage.event.id).toBe(SAMPLE_EVENT_ID);
      expect(packageCounts(racePackage)).toEqual({
        seriesRiders: 13,
        eventRegistrations: 10,
        races: 2,
        checks: 6,
      });
      expect(seen).toEqual([
        {
          url: `${site.url}/functions/getRacePackage?eventId=${SAMPLE_EVENT_ID}`,
          authorization: `Bearer ${token}`,
        },
      ]);
      expect(token).not.toBe(MOCK_DIRECTOR.password);
    } finally {
      await site.close();
    }
  });

  it("reports auth and missing-event errors from the mock site", async () => {
    const site = await startMockSite();
    try {
      await expect(
        getRacePackage({ baseUrl: site.url, eventId: SAMPLE_EVENT_ID, token: "   " }),
      ).rejects.toMatchObject({ status: 401, code: "unauthorized" });

      const rider = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_RIDER.email,
        password: MOCK_RIDER.password,
      });
      expect(rider.account.role).toBe("user");
      expect(() => assertHubAccess(rider.account)).toThrow(SiteApiError);
      await expect(
        getRacePackage({
          baseUrl: site.url,
          eventId: SAMPLE_EVENT_ID,
          token: rider.token,
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: "forbidden",
      });

      const token = await directorToken(site.url);
      await expect(
        getRacePackage({
          baseUrl: site.url,
          eventId: "missing-event",
          token,
        }),
      ).rejects.toMatchObject({ status: 404, code: "event_not_found" });

      const response = await fetch(`${site.url}/functions/getRacePackage`);
      expect(response.status).toBe(401);

      await expect(
        getRacePackage({
          baseUrl: site.url,
          eventId: SAMPLE_EVENT_ID,
          token: "not-a-real-session",
        }),
      ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    } finally {
      await site.close();
    }
  });

  it("rejects a package that does not match the schema", async () => {
    await expect(
      getRacePackage({
        baseUrl: "https://midwesthardenduro.com",
        eventId: SAMPLE_EVENT_ID,
        token: "director",
        fetch: async () =>
          new Response(JSON.stringify({ ok: true, racePackage: { schemaVersion: 1 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      }),
    ).rejects.toBeInstanceOf(SiteApiError);
  });
});

describe("signInWithPassword", () => {
  it("signs a race director and an admin in against the mock site", async () => {
    const site = await startMockSite();
    try {
      const seen: {
        url: string;
        authorization: string | null;
        appId: string | null;
        body: string;
      }[] = [];
      const director = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: `  ${MOCK_DIRECTOR.email.toUpperCase()}  `,
        password: MOCK_DIRECTOR.password,
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          seen.push({
            url: String(input),
            authorization: headers.get("Authorization"),
            appId: headers.get("X-App-Id"),
            body: String(init?.body),
          });
          return fetch(input, init);
        },
      });
      expect(director.account).toMatchObject({
        userId: MOCK_DIRECTOR.id,
        email: MOCK_DIRECTOR.email,
        name: MOCK_DIRECTOR.name,
        role: "race_director",
      });
      expect(director.token).not.toContain(MOCK_DIRECTOR.password);
      expect(seen[0]).toMatchObject({
        url: `${site.url}/api/apps/${MOCK_APP_ID}/auth/login`,
        authorization: null,
        appId: MOCK_APP_ID,
      });
      expect(seen[0]?.body).toContain(MOCK_DIRECTOR.password);
      expect(seen[0]?.body).toContain(MOCK_DIRECTOR.email);

      const me = await getSignedInUser({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        token: director.token,
      });
      expect(me).toEqual(director.account);

      const admin = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_ADMIN.email,
        password: MOCK_ADMIN.password,
      });
      expect(admin.account.role).toBe("admin");
      expect(() => assertHubAccess(admin.account)).not.toThrow();

      const options = await fetch(`${site.url}/api/apps/${MOCK_APP_ID}/auth/login`, {
        method: "OPTIONS",
      });
      expect(options.status).toBe(204);
      expect(options.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(options.headers.get("Access-Control-Allow-Headers")).toContain("X-App-Id");
    } finally {
      await site.close();
    }
  });

  it("rejects a wrong password without echoing it", async () => {
    const site = await startMockSite();
    try {
      await expect(
        signInWithPassword({
          baseUrl: site.url,
          appId: MOCK_APP_ID,
          email: MOCK_DIRECTOR.email,
          password: "not-the-password",
        }),
      ).rejects.toMatchObject({ status: 401, code: "unauthorized" });

      const response = await fetch(`${site.url}/api/apps/${MOCK_APP_ID}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: MOCK_DIRECTOR.email,
          password: "not-the-password",
        }),
      });
      const text = await response.text();
      expect(response.status).toBe(401);
      expect(text).not.toContain("not-the-password");
      expect(text).not.toContain(MOCK_DIRECTOR.password);
    } finally {
      await site.close();
    }
  });

  it("posts a live sign-in to Base44 and keeps the password out of the URL", async () => {
    let seen = "";
    let init: RequestInit | undefined;
    const session = await signInWithPassword({
      baseUrl: "https://midwesthardenduro.com/race-prep",
      appId: "app-123",
      email: "rd@example.com",
      password: "a-real-password",
      fetch: async (input, next) => {
        seen = String(input);
        init = next;
        return new Response(
          JSON.stringify({
            access_token: "jwt-from-base44",
            user: {
              id: "user-1",
              email: "rd@example.com",
              full_name: "Dana Director",
              role: "Admin",
              extra: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    expect(seen).toBe(`${BASE44_AUTH_ORIGIN}/api/apps/app-123/auth/login`);
    expect(seen).not.toContain("a-real-password");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-App-Id")).toBe("app-123");
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(session.account.role).toBe("admin");
    expect(() => assertHubAccess(session.account)).not.toThrow();

    let meUrl = "";
    await expect(
      getSignedInUser({
        baseUrl: "https://midwesthardenduro.com",
        appId: "app-123",
        token: "jwt-from-base44",
        fetch: async (input, next) => {
          meUrl = String(input);
          expect(new Headers(next?.headers).get("Authorization")).toBe(
            "Bearer jwt-from-base44",
          );
          return new Response(JSON.stringify({ message: "nope" }), { status: 401 });
        },
      }),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(meUrl).toBe(`${BASE44_AUTH_ORIGIN}/api/apps/app-123/entities/User/me`);
  });

  it("maps unverified email, a missing app, and a dead network", async () => {
    const fetchStatus = (status: number) => async () =>
      new Response(JSON.stringify({ message: "nope" }), { status });

    await expect(
      signInWithPassword({
        baseUrl: "https://midwesthardenduro.com",
        appId: "app-123",
        email: "rd@example.com",
        password: "password12",
        fetch: fetchStatus(403),
      }),
    ).rejects.toMatchObject({ status: 403, code: "email_unverified" });

    await expect(
      signInWithPassword({
        baseUrl: "https://midwesthardenduro.com",
        appId: "app-123",
        email: "rd@example.com",
        password: "password12",
        fetch: fetchStatus(404),
      }),
    ).rejects.toMatchObject({ status: 404, code: "sign_in_unavailable" });

    await expect(
      signInWithPassword({
        baseUrl: "https://midwesthardenduro.com",
        appId: "   ",
        email: "rd@example.com",
        password: "password12",
        fetch: fetchStatus(200),
      }),
    ).rejects.toMatchObject({ status: 400, code: "missing_app_id" });

    await expect(
      signInWithPassword({
        baseUrl: "https://midwesthardenduro.com",
        appId: "app-123",
        email: "rd@example.com",
        password: "password12",
        fetch: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
