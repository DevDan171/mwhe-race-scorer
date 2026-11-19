import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { planWindowsBuild } from "./windows-build-config";

const here = dirname(fileURLToPath(import.meta.url));
const tauriConfPath = resolve(here, "../../src-tauri/tauri.conf.json");
const overlayPath = resolve(here, "../../src-tauri/ci.windows.json");

const conf = JSON.parse(readFileSync(tauriConfPath, "utf8")) as {
  plugins?: { updater?: { pubkey?: string } };
};
const plan = planWindowsBuild(process.env, conf.plugins?.updater?.pubkey ?? "");

writeFileSync(overlayPath, `${JSON.stringify(plan.overlay, null, 2)}\n`);
for (const line of plan.log) console.log(line);
console.log(`Wrote ${overlayPath}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `signing=${plan.signing ? "true" : "false"}\nupdater=${plan.updater ? "true" : "false"}\n`,
  );
}

if (plan.error) {
  console.error(plan.error);
  process.exit(1);
}
