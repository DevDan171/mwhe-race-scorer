import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readMinisignPublicKey } from "./minisign-key";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("updater public key", () => {
  it("is the minisign key Dan generated", () => {
    const conf = JSON.parse(
      readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"),
    ) as {
      plugins: { updater: { pubkey: string; endpoints: string[] } };
    };
    const key = readMinisignPublicKey(conf.plugins.updater.pubkey);
    expect(key.keyId).toBe("E92861B175B03B52");
    expect(key.rawLength).toBe(42);
    expect(conf.plugins.updater.endpoints).toEqual([
      "https://github.com/DevDan171/mwhe-race-scorer/releases/latest/download/latest.json",
    ]);
  });
});
