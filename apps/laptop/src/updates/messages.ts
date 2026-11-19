export const UPDATE_OFFLINE =
  "This laptop is offline. Connect, then check for an update again.";

export const UPDATE_UNREACHABLE =
  "The update check could not reach GitHub. Your races are unchanged.";

export const UPDATE_UNVERIFIED =
  "This update could not be verified, so it was not installed.";

export const UPDATE_FAILED =
  "The update did not finish. Your races are still on this laptop.";

export const UPDATE_PAUSED = "A race is underway. Updates wait until it is finished.";

/** Turn an updater or network failure into a sentence for the screen. */
export function updateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const text = raw.toLowerCase();
  if (
    text.includes("offline") ||
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("connection") ||
    text.includes("dns") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("sending request") ||
    text.includes("unreachable")
  ) {
    return UPDATE_UNREACHABLE;
  }
  if (
    text.includes("signature") ||
    text.includes("verify") ||
    text.includes("pubkey") ||
    text.includes("public key")
  ) {
    return UPDATE_UNVERIFIED;
  }
  return UPDATE_FAILED;
}

export function releaseNotesUrl(version: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/DevDan171/mwhe-race-scorer/releases/tag/${tag}`;
}
