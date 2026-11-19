import { describe, expect, it } from "vitest";

import {
  releaseNotesUrl,
  updateErrorMessage,
  UPDATE_FAILED,
  UPDATE_UNVERIFIED,
} from "./messages";

describe("updateErrorMessage", () => {
  it("uses plain sentences and does not repeat the raw error", () => {
    expect(updateErrorMessage(new Error("signature mismatch for pubkey"))).toBe(
      UPDATE_UNVERIFIED,
    );
    expect(updateErrorMessage(new Error("error sending request"))).toBe(
      "The update check could not reach GitHub. Your races are unchanged.",
    );
    expect(updateErrorMessage(new Error("install exited 1"))).toBe(UPDATE_FAILED);
    expect(releaseNotesUrl("0.2.1")).toBe(
      "https://github.com/DevDan171/mwhe-race-scorer/releases/tag/v0.2.1",
    );
  });
});
