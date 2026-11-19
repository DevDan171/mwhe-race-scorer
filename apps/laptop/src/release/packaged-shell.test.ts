import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BASE44_AUTH_ORIGIN, LIVE_SITE_ORIGIN } from "@mwhe/core";
import { describe, expect, it } from "vitest";

import { APP_VERSION } from "../app-version";
import packageJson from "../../package.json";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

describe("packaged laptop shell", () => {
  it("installs per user with NSIS, WebView2, and the race-data uninstall hook", () => {
    const conf = readJson("src-tauri/tauri.conf.json") as {
      productName: string;
      version: string;
      identifier: string;
      build: { devUrl: string; frontendDist: string; beforeBuildCommand: string };
      app: { security: { csp: string } };
      bundle: {
        targets: string[];
        createUpdaterArtifacts: boolean;
        icon: string[];
        windows: {
          webviewInstallMode: { type: string; silent: boolean };
          nsis: { installMode: string; installerHooks: string };
        };
      };
      plugins: {
        updater: {
          pubkey: string;
          endpoints: string[];
          windows: { installMode: string };
        };
      };
    };

    expect(conf.productName).toBe("MWHE Race Scorer");
    expect(conf.version).toBe(APP_VERSION);
    expect(conf.version).toBe(packageJson.version);
    expect(conf.identifier).toBe("com.midwesthardenduro.scorer");
    expect(conf.build.frontendDist).toBe("../dist");
    expect(conf.build.devUrl).toBe("http://localhost:1420");
    expect(conf.build.beforeBuildCommand).toBe("pnpm build");
    expect(conf.bundle.targets).toEqual(["nsis"]);
    expect(conf.bundle.createUpdaterArtifacts).toBe(false);
    expect(conf.bundle.windows.nsis.installMode).toBe("currentUser");
    expect(conf.bundle.windows.nsis.installerHooks).toBe("./windows/hooks.nsh");
    expect(conf.bundle.windows.webviewInstallMode).toEqual({
      type: "embedBootstrapper",
      silent: true,
    });
    expect(conf.plugins.updater.endpoints).toEqual([
      "https://github.com/DevDan171/mwhe-race-scorer/releases/latest/download/latest.json",
    ]);
    expect(conf.plugins.updater.windows.installMode).toBe("passive");
    expect(conf.app.security.csp).toContain("default-src 'self'");
    expect(conf.app.security.csp).not.toContain("localhost:1420");
    expect(conf.app.security.csp).not.toContain("midwesthardenduro.com");

    for (const icon of conf.bundle.icon) {
      expect(readFileSync(resolve(root, "src-tauri", icon)).length).toBeGreaterThan(100);
    }

    const hooks = readFileSync(resolve(root, "src-tauri/windows/hooks.nsh"), "utf8");
    expect(hooks).toContain("$DeleteAppDataCheckboxState = 1");
    expect(hooks).toContain("$UpdateMode <> 1");
    expect(hooks).toContain("site-bearer-token.MWHE Race Scorer");
    expect(hooks).toContain("rider-private-key.MWHE Race Scorer");
  });

  it("allows the live site, the vault key, sign-in, and updates", () => {
    const caps = readJson("src-tauri/capabilities/default.json") as {
      permissions: Array<string | { identifier: string; allow: { url: string }[] }>;
    };
    const names = caps.permissions.map((permission) =>
      typeof permission === "string" ? permission : permission.identifier,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "allow-credential-commands",
        "allow-sign-in-commands",
        "opener:allow-open-url",
        "sql:allow-load",
        "sql:allow-execute",
        "updater:allow-check",
        "updater:allow-download-and-install",
        "process:allow-restart",
        "http:default",
      ]),
    );
    const opener = caps.permissions.find(
      (permission) =>
        typeof permission !== "string" &&
        permission.identifier === "opener:allow-open-url",
    );
    expect(
      opener && typeof opener !== "string" ? opener.allow.map((item) => item.url) : [],
    ).toEqual(expect.arrayContaining([`${LIVE_SITE_ORIGIN}/*`, "http://127.0.0.1:*/*"]));

    const http = caps.permissions.find(
      (permission) =>
        typeof permission !== "string" && permission.identifier === "http:default",
    );
    expect(
      http && typeof http !== "string" ? http.allow.map((item) => item.url) : [],
    ).toEqual(
      expect.arrayContaining([
        `${LIVE_SITE_ORIGIN}/*`,
        `${BASE44_AUTH_ORIGIN}/*`,
        "http://127.0.0.1:*/*",
      ]),
    );

    const credentials = readFileSync(
      resolve(root, "src-tauri/permissions/credentials.toml"),
      "utf8",
    );
    expect(credentials).toContain("credential_get_vault");
    expect(credentials).toContain("credential_set_vault");
    const signIn = readFileSync(
      resolve(root, "src-tauri/permissions/sign-in.toml"),
      "utf8",
    );
    expect(signIn).toContain("start_sign_in_callback");
    expect(signIn).toContain("open_sign_in_page");
  });
});
