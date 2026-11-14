import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createSampleRacePackage,
  SAMPLE_EVENT_ID,
} from "../fixtures/sample-race-package.js";
import { packageCounts } from "../registration/service.js";
import { getRacePackage, getRacePackageResponseSchema, SiteApiError } from "./client.js";
import { startMockSite } from "./mock-server.js";

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
  it("downloads the sample package from the mock site with a bearer token", async () => {
    const site = await startMockSite();
    const seen: { url: string; authorization: string | null }[] = [];
    try {
      const racePackage = await getRacePackage({
        baseUrl: site.url,
        eventId: SAMPLE_EVENT_ID,
        token: "director-session-for-test",
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
        seriesRiders: 12,
        eventRegistrations: 9,
        races: 2,
        checks: 6,
      });
      expect(seen).toEqual([
        {
          url: `${site.url}/functions/getRacePackage?eventId=${SAMPLE_EVENT_ID}`,
          authorization: "Bearer director-session-for-test",
        },
      ]);
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

      await expect(
        getRacePackage({
          baseUrl: site.url,
          eventId: SAMPLE_EVENT_ID,
          token: "forbidden",
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: "forbidden",
      });

      await expect(
        getRacePackage({
          baseUrl: site.url,
          eventId: "missing-event",
          token: "director",
        }),
      ).rejects.toMatchObject({ status: 404, code: "event_not_found" });

      const response = await fetch(`${site.url}/functions/getRacePackage`);
      expect(response.status).toBe(401);
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
