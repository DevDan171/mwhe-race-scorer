import type { PhoneRoster } from "../schemas/rider.js";
import { phoneRosterSchema } from "../schemas/rider.js";
import type { RosterDeltaMessage } from "../schemas/sync.js";
import { rosterDeltaMessageSchema } from "../schemas/sync.js";

/**
 * Apply one roster delta. Deltas are sequential: baseVersion must match the
 * roster, and version must be exactly one higher. A full resync is a later
 * laptop feature; this function does not skip versions.
 */
export function applyRosterDelta(
  roster: PhoneRoster,
  delta: RosterDeltaMessage,
): PhoneRoster {
  const current = phoneRosterSchema.parse(roster);
  const change = rosterDeltaMessageSchema.parse(delta);
  if (change.eventId !== current.eventId) {
    throw new Error(
      `Roster delta event ${change.eventId} does not match roster event ${current.eventId}`,
    );
  }
  if (change.baseVersion !== current.version) {
    throw new Error(
      `Roster delta baseVersion ${change.baseVersion} does not match roster version ${current.version}`,
    );
  }
  if (change.version !== current.version + 1) {
    throw new Error(
      `Roster delta version ${change.version} must be ${current.version + 1}`,
    );
  }

  const riders = new Map(current.riders.map((rider) => [rider.number, rider]));
  for (const riderNumber of change.removals) {
    riders.delete(riderNumber);
  }
  for (const rider of change.upserts) {
    riders.set(rider.number, rider);
  }

  return phoneRosterSchema.parse({
    schemaVersion: current.schemaVersion,
    eventId: current.eventId,
    version: change.version,
    riders: [...riders.values()].sort((a, b) => a.number - b.number),
  });
}
