import { describe, expect, it } from "vitest";

import { makePunch } from "../test-support.js";
import { SCHEMA_VERSION } from "../version.js";
import {
  assembleCheckpointFrames,
  assembleRosterFrames,
  encodeCheckpointQr,
  encodeRosterQr,
  readCheckpointFrames,
} from "./qr.js";
import { rosterDeltaMessageSchema, type RosterDeltaMessage } from "../schemas/sync.js";

function punch(n: number) {
  return {
    ...makePunch({ n, riderNumber: n, checkId: "cp3", offsetSeconds: n }),
    eventId: "timber-ridge-2026",
    raceId: "race-1",
    clockOffsetMs: 250,
    unknownNumber: n === 4,
  };
}

describe("checkpoint QR frames", () => {
  it("round-trips one frame and a chunked capture", () => {
    const punches = [1, 2, 3, 4, 5, 6].map(punch).map((entry) => ({
      ...entry,
      deviceId: "phone-1",
    }));
    const one = encodeCheckpointQr({
      eventId: "timber-ridge-2026",
      raceId: "race-1",
      checkId: "cp3",
      deviceId: "phone-1",
      exportedAt: "2026-06-14T16:00:00.000Z",
      punches,
      maxChars: 20_000,
    });
    expect(one).toHaveLength(1);
    expect(assembleCheckpointFrames(readCheckpointFrames(one[0] ?? ""))).toEqual(punches);

    const chunked = encodeCheckpointQr({
      eventId: "timber-ridge-2026",
      raceId: "race-1",
      checkId: "cp3",
      deviceId: "phone-1",
      exportedAt: "2026-06-14T16:00:00.000Z",
      punches,
      maxChars: 1,
    });
    expect(chunked.length).toBe(punches.length);
    const pasted = chunked.join("\n\n");
    const frames = readCheckpointFrames(pasted);
    expect(frames.map((frame) => frame.part)).toEqual(
      punches.map((_, index) => index + 1),
    );
    expect(frames[0]?.parts).toBe(punches.length);
    expect(assembleCheckpointFrames(frames)).toEqual(punches);
  });

  it("refuses a set that is missing a part or repeats one", () => {
    const frames = readCheckpointFrames(
      encodeCheckpointQr({
        eventId: "timber-ridge-2026",
        checkId: "cp3",
        deviceId: "phone-1",
        exportedAt: "2026-06-14T16:00:00.000Z",
        punches: [punch(1), punch(2)],
        maxChars: 1,
      }).join("\n\n"),
    );
    expect(() => assembleCheckpointFrames(frames.slice(0, 1))).toThrow(/part 2 of 2/i);
    expect(() => assembleCheckpointFrames([frames[0]!, frames[0]!])).toThrow(/twice/i);
  });

  it("emits an empty frame when the phone has no punches", () => {
    const [text] = encodeCheckpointQr({
      eventId: "timber-ridge-2026",
      checkId: "cp1",
      deviceId: "phone-1",
      exportedAt: "2026-06-14T16:00:00.000Z",
      punches: [],
    });
    expect(assembleCheckpointFrames(readCheckpointFrames(text ?? ""))).toEqual([]);
  });
});

describe("roster QR frames", () => {
  function delta(version: number, number: number): RosterDeltaMessage {
    return rosterDeltaMessageSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      type: "roster_delta",
      eventId: "timber-ridge-2026",
      version,
      baseVersion: version - 1,
      upserts: [{ name: `Rider ${number}`, number, class: "A" }],
      removals: [],
    });
  }

  it("round-trips roster deltas across more than one code", () => {
    const deltas = [1, 2, 3].map((version) => delta(version, version));
    const texts = encodeRosterQr({
      eventId: "timber-ridge-2026",
      exportedAt: "2026-06-14T16:05:00.000Z",
      deltas,
      maxChars: 1,
    });
    expect(texts.length).toBe(3);
    expect(assembleRosterFrames(texts.map((text) => JSON.parse(text)))).toEqual(deltas);
  });
});
