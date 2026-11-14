import { describe, expect, it } from "vitest";

import { parseIsoMs } from "./time.js";

describe("parseIsoMs", () => {
  it("rejects a timestamp that is not a date", () => {
    expect(() => parseIsoMs("not-a-date")).toThrow(/Invalid timestamp/);
  });
});
