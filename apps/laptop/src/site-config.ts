import { LIVE_APP_ID, MOCK_APP_ID } from "@mwhe/core";

/** Packaged app id, or the mock id when the dev preview points at localhost. */
export function appIdForSite(origin: string): string {
  try {
    const host = new URL(origin).hostname;
    if (host === "127.0.0.1" || host === "localhost") return MOCK_APP_ID;
  } catch {
    return LIVE_APP_ID;
  }
  return LIVE_APP_ID;
}
