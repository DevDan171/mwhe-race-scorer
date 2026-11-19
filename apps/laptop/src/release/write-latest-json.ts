import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLatestJson } from "./latest-json";
import { versionFromGitRef } from "./windows-build-config";

const here = dirname(fileURLToPath(import.meta.url));
const bundleDir = resolve(
  process.argv[2] ?? join(here, "../../src-tauri/target/release/bundle/nsis"),
);

if (!process.env.GITHUB_REF?.startsWith("refs/tags/")) {
  console.log("latest.json: skipped (this build is not a version tag).");
  process.exit(0);
}

const version = versionFromGitRef(process.env.GITHUB_REF, process.env.GITHUB_REF_NAME);
if (!version || !process.env.GITHUB_REF_NAME || !process.env.GITHUB_REPOSITORY) {
  console.error("latest.json: the tag or repository name is missing.");
  process.exit(1);
}

let names: string[];
try {
  names = readdirSync(bundleDir);
} catch {
  console.error(`latest.json: installer directory not found: ${bundleDir}`);
  process.exit(1);
}

const installers = names.filter((name) => name.endsWith("-setup.exe"));
const signatures = names.filter((name) => name.endsWith("-setup.exe.sig"));
if (signatures.length === 0) {
  console.log(
    "latest.json: skipped. No updater signature was produced, so this release will not advertise an update.",
  );
  process.exit(0);
}
if (installers.length !== 1 || signatures.length !== 1) {
  console.error(
    `latest.json: expected one setup exe and one signature, found ${installers.length} exe and ${signatures.length} sig.`,
  );
  process.exit(1);
}

const installerFileName = installers[0];
const signatureName = signatures[0];
if (
  !installerFileName ||
  !signatureName ||
  signatureName !== `${installerFileName}.sig`
) {
  console.error("latest.json: the signature file does not match the installer.");
  process.exit(1);
}

const manifest = buildLatestJson({
  version,
  notes: `MWHE Race Scorer ${version}`,
  pubDate: new Date().toISOString(),
  signature: readFileSync(join(bundleDir, signatureName), "utf8"),
  repo: process.env.GITHUB_REPOSITORY,
  tag: process.env.GITHUB_REF_NAME,
  installerFileName,
});
const out = join(bundleDir, "latest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${out}`);
