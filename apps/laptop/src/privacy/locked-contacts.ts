import type { RaceDayState, RiderPrivateRecord, SeriesRiderUpload } from "@mwhe/core";

import { openJson } from "./seal";

export interface SavedVault {
  events: Record<string, RiderPrivateRecord[]>;
  uploads: SeriesRiderUpload[];
}

const EMPTY_VAULT: SavedVault = { events: {}, uploads: [] };

/**
 * Open the sealed emergency-contact file. A key that does not match, including
 * a key created after the old one was lost, returns an empty vault instead of
 * throwing. The race itself stays usable.
 */
export async function readSavedVault(
  key: CryptoKey,
  privateCipher: string | null,
): Promise<{ vault: SavedVault; locked: boolean }> {
  if (!privateCipher) return { vault: EMPTY_VAULT, locked: false };
  try {
    return { vault: parseVault(await openJson(key, privateCipher)), locked: false };
  } catch {
    return { vault: EMPTY_VAULT, locked: true };
  }
}

export function lockedContactMessage(input: {
  lockedEventIds: readonly string[];
  events: Record<string, Pick<RaceDayState, "dayOfRegistrations">>;
}): string | null {
  if (input.lockedEventIds.length === 0) return null;
  const addedHere = input.lockedEventIds.some(
    (id) => (input.events[id]?.dayOfRegistrations.length ?? 0) > 0,
  );
  const base =
    "Emergency contacts saved on this laptop could not be unlocked. Re-import each event to restore emergency contacts from the site. The app saves them with the new key.";
  if (!addedHere) return base;
  return `${base} Emergency contacts for riders added on this laptop cannot be restored. Enter those again.`;
}

function parseVault(value: unknown): SavedVault {
  if (!value || typeof value !== "object") return EMPTY_VAULT;
  const record = value as Partial<SavedVault>;
  return {
    events: record.events && typeof record.events === "object" ? record.events : {},
    uploads: Array.isArray(record.uploads) ? record.uploads : [],
  };
}
