import { describe, expect, it } from "vitest";

import { findStationUpdate } from "./updates";

const SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("findStationUpdate", () => {
  it("stays quiet while live and when every check fails", async () => {
    const live = await findStationUpdate({
      live: true,
      currentVersion: "0.3.0",
      hubUrl: "http://laptop",
      online: true,
      fetchImpl: async () => {
        throw new Error("down");
      },
    });
    expect(live).toBeNull();
    const failed = await findStationUpdate({
      live: false,
      currentVersion: "0.3.0",
      hubUrl: "http://laptop",
      online: true,
      fetchImpl: async () => new Response("no", { status: 500 }),
    });
    expect(failed).toBeNull();
  });

  it("offers the laptop copy when this phone is not recording", async () => {
    const offer = await findStationUpdate({
      live: false,
      currentVersion: "0.3.0",
      hubUrl: "http://laptop",
      online: false,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            version: "0.4.0",
            url: "/sync/station-apk",
            sha256: SHA,
          }),
        ),
    });
    expect(offer?.version).toBe("0.4.0");
    expect(offer?.url).toBe("/sync/station-apk");
  });
});
