import { describe, expect, it } from "vitest";

import { makePunch } from "../test-support.js";
import { SCHEMA_VERSION } from "../version.js";
import {
  clockOffsetMs,
  clockOffsetWarning,
  findDoubleTap,
  formatClockOffset,
  isUnknownRiderNumber,
  mergePunches,
  versionsMatch,
} from "./punches.js";

describe("clock offset", () => {
  it("subtracts the laptop clock from the phone clock", () => {
    expect(clockOffsetMs("2026-06-14T14:00:02.000Z", "2026-06-14T14:00:00.000Z")).toBe(
      2_000,
    );
    expect(clockOffsetMs("2026-06-14T13:59:59.500Z", "2026-06-14T14:00:00.000Z")).toBe(
      -500,
    );
  });

  it("warns once the offset reaches the threshold", () => {
    expect(clockOffsetWarning(1_999, 2_000)).toBeNull();
    expect(clockOffsetWarning(2_000, 2_000)).toMatch(/ahead/);
    expect(clockOffsetWarning(-2_500, 2_000)).toMatch(/behind/);
    expect(clockOffsetWarning(null, 2_000)).toBeNull();
    expect(formatClockOffset(-400)).toBe("-0.4 s");
    expect(formatClockOffset(2_000)).toBe("+2.0 s");
  });
});

describe("version gate", () => {
  it("matches the release version and ignores a leading v", () => {
    expect(versionsMatch("0.3.0", "v0.3.0")).toBe(true);
    expect(versionsMatch("0.3.0", "0.3.1")).toBe(false);
    expect(versionsMatch("0.3.0", "0.3.0-rc.1")).toBe(false);
  });
});

describe("mergePunches", () => {
  const original = makePunch({ n: 1, riderNumber: 7, checkId: "cp1", offsetSeconds: 10 });

  it("keeps one punch when the same uuid arrives twice", () => {
    const merged = mergePunches([original], [original]);
    expect(merged.punches).toHaveLength(1);
    expect(merged.duplicates).toBe(1);
    expect(merged.accepted).toBe(0);
  });

  it("lets a later void win, and a void that arrives first stays voided", () => {
    const lateVoid = { ...original, voided: true };
    const voided = mergePunches([original], [lateVoid]);
    expect(voided.voidsApplied).toBe(1);
    expect(voided.punches[0]?.voided).toBe(true);

    const early = mergePunches([], [lateVoid]);
    const afterOriginal = mergePunches(early.punches, [original]);
    expect(afterOriginal.punches[0]?.voided).toBe(true);
    expect(afterOriginal.duplicates).toBe(1);
  });

  it("keeps an unknown number", () => {
    const punch = makePunch({
      n: 2,
      riderNumber: 999,
      checkId: "cp1",
      offsetSeconds: 12,
    });
    const merged = mergePunches(
      [],
      [{ ...punch, unknownNumber: true, schemaVersion: SCHEMA_VERSION }],
    );
    expect(merged.punches[0]?.riderNumber).toBe(999);
    expect(merged.punches[0]?.unknownNumber).toBe(true);
    expect(isUnknownRiderNumber([1, 7], 999)).toBe(true);
    expect(isUnknownRiderNumber([999], 999)).toBe(false);
  });
});

describe("findDoubleTap", () => {
  const punch = makePunch({ n: 3, riderNumber: 42, checkId: "cp2", offsetSeconds: 0 });
  const at = Date.parse(punch.timestamp);

  it("warns on the same number at the same check inside the window", () => {
    expect(
      findDoubleTap([punch], {
        riderNumber: 42,
        checkId: "cp2",
        atMs: at + 60_000,
        windowMs: 60_000,
      })?.uuid,
    ).toBe(punch.uuid);
    expect(
      findDoubleTap([punch], {
        riderNumber: 42,
        checkId: "cp2",
        atMs: at + 60_001,
        windowMs: 60_000,
      }),
    ).toBeNull();
  });

  it("ignores a voided punch, a different check, and a window of zero", () => {
    expect(
      findDoubleTap([{ ...punch, voided: true }], {
        riderNumber: 42,
        checkId: "cp2",
        atMs: at + 1_000,
        windowMs: 60_000,
      }),
    ).toBeNull();
    expect(
      findDoubleTap([punch], {
        riderNumber: 42,
        checkId: "cp3",
        atMs: at + 1_000,
        windowMs: 60_000,
      }),
    ).toBeNull();
    expect(
      findDoubleTap([punch], {
        riderNumber: 42,
        checkId: "cp2",
        atMs: at,
        windowMs: 0,
      }),
    ).toBeNull();
  });
});
