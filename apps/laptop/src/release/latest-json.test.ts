import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildLatestJson,
  installerDownloadUrls,
  publishedInstallerName,
  releaseDownloadUrl,
  renameReleaseInstallers,
} from "./latest-json";

describe("publishedInstallerName", () => {
  it("replaces spaces so GitHub keeps the name it was given", () => {
    expect(publishedInstallerName("MWHE Race Scorer_0.2.1_x64-setup.exe")).toBe(
      "MWHE-Race-Scorer_0.2.1_x64-setup.exe",
    );
    expect(publishedInstallerName("MWHE Race Scorer_0.2.1_x64-setup.exe.sig")).toBe(
      "MWHE-Race-Scorer_0.2.1_x64-setup.exe.sig",
    );
  });

  it("renames the built files before the manifest is written", () => {
    const dir = mkdtempSync(join(tmpdir(), "mwhe-release-"));
    writeFileSync(join(dir, "MWHE Race Scorer_0.2.1_x64-setup.exe"), "exe");
    writeFileSync(join(dir, "MWHE Race Scorer_0.2.1_x64-setup.exe.sig"), "sig");
    expect(renameReleaseInstallers(dir).sort()).toEqual([
      "MWHE-Race-Scorer_0.2.1_x64-setup.exe",
      "MWHE-Race-Scorer_0.2.1_x64-setup.exe.sig",
    ]);
  });
});

describe("buildLatestJson", () => {
  it("points the Windows updater at the published asset name", () => {
    const fileName = publishedInstallerName("MWHE Race Scorer_0.2.1_x64-setup.exe");
    const manifest = buildLatestJson({
      version: "0.2.1",
      notes: "MWHE Race Scorer 0.2.1",
      pubDate: "2026-11-19T12:00:00.000Z",
      signature: "untrusted comment: signature\nRWR\n",
      repo: "DevDan171/mwhe-race-scorer",
      tag: "v0.2.1",
      installerFileName: fileName,
    });

    const url = releaseDownloadUrl("DevDan171/mwhe-race-scorer", "v0.2.1", fileName);
    expect(url).toBe(
      "https://github.com/DevDan171/mwhe-race-scorer/releases/download/v0.2.1/MWHE-Race-Scorer_0.2.1_x64-setup.exe",
    );
    expect(url.includes("%20")).toBe(false);
    expect(manifest.version).toBe("0.2.1");
    expect(installerDownloadUrls(manifest)).toEqual([url]);
    expect(manifest.platforms["windows-x86_64-nsis"].signature).toBe(
      "untrusted comment: signature\nRWR",
    );
  });
});
