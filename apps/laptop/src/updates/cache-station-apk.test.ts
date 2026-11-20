import { describe, expect, it } from "vitest";

import { cacheMatchingStationApk } from "./cache-station-apk";

const SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("cacheMatchingStationApk", () => {
  it("saves the APK only when the checksum matches this laptop's version", async () => {
    const saved: string[] = [];
    const ok = await cacheMatchingStationApk({
      version: "0.4.0",
      fetchImpl: async (url) => {
        const address = String(url);
        if (address.endsWith("station-update.json")) {
          return new Response(
            JSON.stringify({
              version: "0.4.0",
              url: "https://example.test/mwhe-station-0.4.0.apk",
              sha256: SHA,
            }),
          );
        }
        return new Response(new TextEncoder().encode("abc"));
      },
      save: async (manifest) => {
        saved.push(manifest.version);
      },
    });
    expect(ok).toBe(true);
    expect(saved).toEqual(["0.4.0"]);
  });

  it("stays quiet when GitHub has no manifest", async () => {
    const ok = await cacheMatchingStationApk({
      version: "0.4.0",
      fetchImpl: async () => new Response("missing", { status: 404 }),
      save: async () => {
        throw new Error("should not save");
      },
    });
    expect(ok).toBe(false);
  });
});
