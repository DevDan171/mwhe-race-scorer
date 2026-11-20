import { describe, expect, it } from "vitest";

import {
  checksumMatches,
  chooseStationUpdate,
  compareAppVersions,
  downloadVerifiedApk,
  hubStationManifest,
  isNewerRelease,
  parseStationUpdateManifest,
  sha256Hex,
  stationUpdateIsAllowed,
} from "./station-update.js";

const SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function manifest(version: string, extra: { debug?: boolean; url?: string } = {}) {
  return parseStationUpdateManifest({
    version,
    url: extra.url ?? `https://example.test/${version}.apk`,
    sha256: SHA,
    ...(extra.debug ? { debug: true } : {}),
  });
}

describe("station update versions", () => {
  it("compares numeric versions and ignores a leading v", () => {
    expect(compareAppVersions("0.3.0", "0.4.0")).toBe(-1);
    expect(compareAppVersions("v0.4.0", "0.4.0")).toBe(0);
    expect(compareAppVersions("0.4.1", "0.4.0")).toBe(1);
    expect(isNewerRelease("0.3.0", "0.4.0")).toBe(true);
    expect(isNewerRelease("0.4.0", "0.4.0")).toBe(false);
    expect(isNewerRelease("0.4.0", "0.4.0-rc.1")).toBe(false);
  });
});

describe("station update manifest", () => {
  it("parses a release manifest and lowercases the checksum", () => {
    const parsed = parseStationUpdateManifest({
      version: "0.4.0",
      url: "/sync/station-apk",
      sha256: SHA.toUpperCase(),
    });
    expect(parsed.sha256).toBe(SHA);
    expect(hubStationManifest(parsed).url).toBe("/sync/station-apk");
  });

  it("rejects a manifest that is missing a field or has a bad checksum", () => {
    expect(() => parseStationUpdateManifest({ version: "0.4.0", url: "x" })).toThrow();
    expect(() =>
      parseStationUpdateManifest({ version: "0.4.0", url: "x", sha256: "abcd" }),
    ).toThrow();
    expect(() =>
      parseStationUpdateManifest({ version: "0.4.0-rc.1", url: "x", sha256: SHA }),
    ).toThrow();
  });
});

describe("station update checksum", () => {
  it("matches sha256 of the bytes and rejects a different file", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe(SHA);
    expect(checksumMatches(await sha256Hex(bytes), SHA.toUpperCase())).toBe(true);
    const fetched = await downloadVerifiedApk(
      "https://example.test/app.apk",
      SHA,
      async () => new Response(bytes),
    );
    expect(fetched).toEqual(bytes);
    const rejected = await downloadVerifiedApk(
      "https://example.test/app.apk",
      "a".repeat(64),
      async () => new Response(bytes),
    );
    expect(rejected).toBeNull();
  });
});

describe("station update gate", () => {
  it("does not offer an update while the station is live", () => {
    expect(stationUpdateIsAllowed(true)).toBe(false);
    expect(stationUpdateIsAllowed(false)).toBe(true);
    const offer = manifest("0.4.0");
    expect(
      chooseStationUpdate({
        currentVersion: "0.3.0",
        live: true,
        hub: offer,
        github: offer,
      }),
    ).toBeNull();
  });

  it("uses the laptop copy when the phone is paired, and ignores a debug build", () => {
    const hub = manifest("0.4.0", { url: "/sync/station-apk" });
    const newer = manifest("0.5.0");
    expect(
      chooseStationUpdate({
        currentVersion: "0.3.0",
        live: false,
        hub,
        github: newer,
      }),
    ).toEqual(hub);
    expect(
      chooseStationUpdate({
        currentVersion: "0.4.0",
        live: false,
        hub: null,
        github: newer,
      })?.version,
    ).toBe("0.5.0");
    expect(
      chooseStationUpdate({
        currentVersion: "0.3.0",
        live: false,
        hub: manifest("0.4.0", { debug: true }),
        github: null,
      }),
    ).toBeNull();
  });
});
