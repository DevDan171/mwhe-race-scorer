import { describe, expect, it } from "vitest";

import { buildLatestJson, releaseDownloadUrl } from "./latest-json";

describe("buildLatestJson", () => {
  it("points the Windows updater at the GitHub release asset", () => {
    const fileName = "MWHE Race Scorer_0.2.0_x64-setup.exe";
    const manifest = buildLatestJson({
      version: "0.2.0",
      notes: "MWHE Race Scorer 0.2.0",
      pubDate: "2026-11-19T12:00:00.000Z",
      signature: "untrusted comment: signature\nRWR\n",
      repo: "DevDan171/mwhe-race-scorer",
      tag: "v0.2.0",
      installerFileName: fileName,
    });

    const url = releaseDownloadUrl("DevDan171/mwhe-race-scorer", "v0.2.0", fileName);
    expect(url).toBe(
      "https://github.com/DevDan171/mwhe-race-scorer/releases/download/v0.2.0/MWHE%20Race%20Scorer_0.2.0_x64-setup.exe",
    );
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.platforms["windows-x86_64"].url).toBe(url);
    expect(manifest.platforms["windows-x86_64-nsis"].signature).toBe(
      "untrusted comment: signature\nRWR",
    );
  });
});
