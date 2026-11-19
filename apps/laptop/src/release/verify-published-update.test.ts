import { describe, expect, it } from "vitest";

import { fetchPublished, verifyPublishedUpdate } from "./verify-published-update";

const manifest = {
  version: "0.2.1",
  platforms: {
    "windows-x86_64": {
      url: "https://github.com/DevDan171/mwhe-race-scorer/releases/download/v0.2.1/MWHE-Race-Scorer_0.2.1_x64-setup.exe",
    },
    "windows-x86_64-nsis": {
      url: "https://github.com/DevDan171/mwhe-race-scorer/releases/download/v0.2.1/MWHE-Race-Scorer_0.2.1_x64-setup.exe",
    },
  },
};

describe("verify published update", () => {
  it("returns the last real response when every attempt fails", async () => {
    const seen: RequestInit[] = [];
    const response = await fetchPublished(
      "https://github.com/DevDan171/mwhe-race-scorer/releases/download/v0.2.1/latest.json",
      false,
      {
        attempts: 3,
        delayMs: 0,
        fetch: async (_url, init) => {
          seen.push(init ?? {});
          return new Response("missing", { status: 503 });
        },
      },
    );
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(3);
    expect(seen[0]?.headers).toEqual({});
  });

  it("accepts the v0.2.1 manifest and a ranged installer response", async () => {
    const lines: string[] = [];
    const requests: { url: string; range: string | null }[] = [];
    const code = await verifyPublishedUpdate({
      repo: "DevDan171/mwhe-race-scorer",
      tag: "v0.2.1",
      attempts: 1,
      delayMs: 0,
      log: (line) => lines.push(line),
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        requests.push({ url: String(url), range: headers.get("Range") });
        if (String(url).endsWith("/latest.json")) {
          return new Response(JSON.stringify(manifest), { status: 200 });
        }
        return new Response(null, {
          status: 206,
          headers: { "content-range": "bytes 0-0/7500757" },
        });
      },
    });
    expect(code).toBe(0);
    expect(requests).toEqual([
      {
        url: "https://github.com/DevDan171/mwhe-race-scorer/releases/download/v0.2.1/latest.json",
        range: null,
      },
      {
        url: manifest.platforms["windows-x86_64"].url,
        range: "bytes=0-0",
      },
    ]);
    expect(lines).toEqual([`206 ${manifest.platforms["windows-x86_64"].url}`]);
  });

  it("skips the check when latest.json was not published", async () => {
    const lines: string[] = [];
    const code = await verifyPublishedUpdate({
      repo: "DevDan171/mwhe-race-scorer",
      tag: "v0.2.1",
      attempts: 1,
      delayMs: 0,
      log: (line) => lines.push(line),
      fetch: async () => new Response("missing", { status: 404 }),
    });
    expect(code).toBe(0);
    expect(lines[0]).toContain("was not published");
  });
});
