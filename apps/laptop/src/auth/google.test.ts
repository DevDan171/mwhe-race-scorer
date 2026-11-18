import { describe, expect, it } from "vitest";

import { manualSignInCode, takeSignInCode } from "./google";

describe("Google sign-in codes", () => {
  it("uses the first code and stops when the attempt is cancelled", async () => {
    const typed = manualSignInCode();
    const pending = new Promise<string>(() => undefined);
    const abort = new AbortController();
    const winner = takeSignInCode([pending, typed.promise], abort.signal);
    typed.submit("ABCD-EFGH");
    await expect(winner).resolves.toBe("ABCD-EFGH");

    const cancelled = new AbortController();
    const hanging = takeSignInCode(
      [new Promise<string>(() => undefined)],
      cancelled.signal,
    );
    cancelled.abort();
    await expect(hanging).rejects.toMatchObject({ name: "AbortError" });
  });
});
