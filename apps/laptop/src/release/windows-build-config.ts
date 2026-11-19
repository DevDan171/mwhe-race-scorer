export const UPDATER_PUBKEY_PLACEHOLDER = "REPLACE_WITH_THE_MINISIGN_PUBLIC_KEY";

export const AZURE_SECRET_NAMES = [
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "AZURE_SIGNING_ENDPOINT",
  "AZURE_SIGNING_ACCOUNT",
  "AZURE_SIGNING_CERTIFICATE_PROFILE",
] as const;

export interface WindowsBuildOverlay {
  version?: string;
  bundle: {
    createUpdaterArtifacts: boolean;
    windows?: {
      signCommand: string;
    };
  };
}

export interface WindowsBuildPlan {
  overlay: WindowsBuildOverlay;
  signing: boolean;
  updater: boolean;
  log: string[];
  error: string | null;
}

type Env = Record<string, string | undefined>;

const VERSION_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)([-+][0-9A-Za-z.-]+)?$/;

export function isUpdaterPubkeyConfigured(pubkey: string): boolean {
  const trimmed = pubkey.trim();
  return trimmed.length >= 40 && !trimmed.includes(UPDATER_PUBKEY_PLACEHOLDER);
}

/** Strip the leading v from a version tag. Branch names and pull requests return null. */
export function versionFromGitRef(
  ref: string | undefined,
  refName: string | undefined,
): string | null {
  if (!ref?.startsWith("refs/tags/")) return null;
  if (!refName || !VERSION_TAG.test(refName)) return null;
  return refName.slice(1);
}

function value(env: Env, name: string): string {
  return env[name]?.trim() ?? "";
}

/**
 * Decide the Tauri config overlay for a Windows build.
 * Missing updater and Azure secrets produce an unsigned installer that still builds.
 * A half-set Azure group, or an updater key without a real public key, is an error.
 */
export function planWindowsBuild(env: Env, pubkey: string): WindowsBuildPlan {
  const log: string[] = [];
  const errors: string[] = [];

  const ref = env.GITHUB_REF;
  let version: string | null = null;
  if (ref?.startsWith("refs/tags/")) {
    version = versionFromGitRef(ref, env.GITHUB_REF_NAME);
    if (!version) {
      errors.push(
        `Tag ${env.GITHUB_REF_NAME ?? ref} is not a version like v0.2.0. Use vMAJOR.MINOR.PATCH.`,
      );
    }
  }

  const updaterKey = value(env, "TAURI_SIGNING_PRIVATE_KEY").length > 0;
  const pubkeyReady = isUpdaterPubkeyConfigured(pubkey);
  if (updaterKey && pubkeyReady) {
    log.push("Updater signatures: on (TAURI_SIGNING_PRIVATE_KEY is set).");
  } else if (updaterKey) {
    errors.push(
      "TAURI_SIGNING_PRIVATE_KEY is set, but plugins.updater.pubkey in apps/laptop/src-tauri/tauri.conf.json is still the placeholder. Generate a minisign key, paste the public key into that field, and commit it before signing updates.",
    );
  } else {
    log.push(
      "Updater signatures: skipped. The installer still builds. Set TAURI_SIGNING_PRIVATE_KEY (and the password secret, if the key has one) to publish latest.json.",
    );
  }

  const azure = AZURE_SECRET_NAMES.map((name) => [name, value(env, name)] as const);
  const filled = azure.filter(([, item]) => item.length > 0);
  let signCommand: string | null = null;
  if (filled.length === 0) {
    log.push(
      "Windows code signing: skipped. Azure Artifact Signing secrets are not set, so the installer is unsigned.",
    );
  } else if (filled.length !== AZURE_SECRET_NAMES.length) {
    const missing = azure.filter(([, item]) => item.length === 0).map(([name]) => name);
    errors.push(
      `Azure signing is only partly configured. Missing ${missing.join(", ")}. Set every Azure secret, or leave them all empty to build unsigned.`,
    );
  } else {
    const bad = azure.find(([, item]) => /["%\r\n]/.test(item));
    if (bad) {
      errors.push(
        `${bad[0]} contains a quote, percent sign, or newline. The signing command cannot quote that value.`,
      );
    } else {
      signCommand = `artifact-signing-cli -e ${value(env, "AZURE_SIGNING_ENDPOINT")} -a ${value(env, "AZURE_SIGNING_ACCOUNT")} -c ${value(env, "AZURE_SIGNING_CERTIFICATE_PROFILE")} -d "MWHE Race Scorer" %1`;
      log.push("Windows code signing: on (Azure Artifact Signing).");
    }
  }

  const error = errors.length > 0 ? errors.join("\n") : null;
  const overlay: WindowsBuildOverlay = {
    bundle: {
      createUpdaterArtifacts: updaterKey && pubkeyReady && error === null,
    },
  };
  if (version && error === null) overlay.version = version;
  if (signCommand && error === null) overlay.bundle.windows = { signCommand };

  return {
    overlay,
    signing: signCommand !== null && error === null,
    updater: updaterKey && pubkeyReady && error === null,
    log,
    error,
  };
}
