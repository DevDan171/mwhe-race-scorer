import { describe, expect, it } from "vitest";

import {
  AZURE_SECRET_NAMES,
  planWindowsBuild,
  UPDATER_PUBKEY_PLACEHOLDER,
  versionFromGitRef,
} from "./windows-build-config";

const PUBKEY = "untrusted comment: minisign public key: ABC\nRWR" + "A".repeat(50);

const azureEnv = Object.fromEntries(
  AZURE_SECRET_NAMES.map((name) => [name, `${name}-value`]),
);

describe("versionFromGitRef", () => {
  it("reads a release tag and ignores branches", () => {
    expect(versionFromGitRef("refs/tags/v0.2.0", "v0.2.0")).toBe("0.2.0");
    expect(versionFromGitRef("refs/tags/v0.2.0-rc.1", "v0.2.0-rc.1")).toBe("0.2.0-rc.1");
    expect(versionFromGitRef("refs/heads/main", "main")).toBeNull();
    expect(versionFromGitRef("refs/tags/v1", "v1")).toBeNull();
  });
});

describe("planWindowsBuild", () => {
  it("builds an unsigned installer when secrets are absent", () => {
    const plan = planWindowsBuild(
      { GITHUB_REF: "refs/pull/8/merge", GITHUB_REF_NAME: "8/merge" },
      UPDATER_PUBKEY_PLACEHOLDER,
    );
    expect(plan.error).toBeNull();
    expect(plan.signing).toBe(false);
    expect(plan.updater).toBe(false);
    expect(plan.overlay).toEqual({ bundle: { createUpdaterArtifacts: false } });
    expect(plan.log.join("\n")).toContain("unsigned");
  });

  it("turns updater artifacts on only when the key and the public key are both set", () => {
    const ready = planWindowsBuild(
      { TAURI_SIGNING_PRIVATE_KEY: "private-key-body" },
      PUBKEY,
    );
    expect(ready.error).toBeNull();
    expect(ready.updater).toBe(true);
    expect(ready.overlay.bundle.createUpdaterArtifacts).toBe(true);

    const placeholder = planWindowsBuild(
      { TAURI_SIGNING_PRIVATE_KEY: "private-key-body" },
      UPDATER_PUBKEY_PLACEHOLDER,
    );
    expect(placeholder.error).toMatch(/placeholder/);
    expect(placeholder.updater).toBe(false);
    expect(placeholder.overlay.bundle.createUpdaterArtifacts).toBe(false);
  });

  it("adds Azure signing only when every secret is set", () => {
    const plan = planWindowsBuild(azureEnv, UPDATER_PUBKEY_PLACEHOLDER);
    expect(plan.error).toBeNull();
    expect(plan.signing).toBe(true);
    expect(plan.overlay.bundle.windows?.signCommand).toContain("artifact-signing-cli");
    expect(plan.overlay.bundle.windows?.signCommand).toContain("%1");
    expect(plan.overlay.bundle.windows?.signCommand).toContain("MWHE Race Scorer");

    const partial = planWindowsBuild(
      { AZURE_CLIENT_ID: "only-one" },
      UPDATER_PUBKEY_PLACEHOLDER,
    );
    expect(partial.error).toMatch(/partly configured/);
    expect(partial.signing).toBe(false);
    expect(partial.overlay.bundle.windows).toBeUndefined();
  });

  it("sets the installer version from a tag and refuses a bad tag", () => {
    const plan = planWindowsBuild(
      { GITHUB_REF: "refs/tags/v0.3.1", GITHUB_REF_NAME: "v0.3.1" },
      UPDATER_PUBKEY_PLACEHOLDER,
    );
    expect(plan.overlay.version).toBe("0.3.1");

    const bad = planWindowsBuild(
      { GITHUB_REF: "refs/tags/release", GITHUB_REF_NAME: "release" },
      UPDATER_PUBKEY_PLACEHOLDER,
    );
    expect(bad.error).toMatch(/v0\.2\.0/);
    expect(bad.overlay.version).toBeUndefined();
  });
});
