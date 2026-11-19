import { readFileSync } from "node:fs";

import { MIN_ANDROID_API } from "@mwhe/core";
import { describe, expect, it } from "vitest";

import { APP_VERSION } from "./version";

describe("android floor", () => {
  it("builds for Android 8 / API 26", () => {
    const gradle = readFileSync(
      new URL("../android/variables.gradle", import.meta.url),
      "utf8",
    );
    expect(MIN_ANDROID_API).toBe(26);
    expect(gradle).toContain("minSdkVersion = 26");
    const manifest = readFileSync(
      new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8",
    );
    expect(manifest).toContain("usesCleartextTraffic");
    expect(manifest).toContain("FOREGROUND_SERVICE");
    const app = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(app.version).toBe(APP_VERSION);
  });
});
