import { describe, expect, it } from "vitest";

import { createVaultKey, sealJson } from "./seal";
import { lockedContactMessage, readSavedVault } from "./locked-contacts";

describe("lost emergency-contact key", () => {
  it("does not throw when the saved file was encrypted with a key that is gone", async () => {
    const oldKey = await createVaultKey();
    const newKey = await createVaultKey();
    const sealed = await sealJson(oldKey, {
      events: {
        "gnaw-bone-2026": [
          {
            seriesId: "s-dana",
            riderNumber: 55,
            name: "Dana Brooks",
            phone: "(555) 013-0210",
          },
        ],
      },
      uploads: [],
    });

    const lost = await readSavedVault(newKey, sealed);
    expect(lost.locked).toBe(true);
    expect(lost.vault).toEqual({ events: {}, uploads: [] });

    const opened = await readSavedVault(oldKey, sealed);
    expect(opened.locked).toBe(false);
    expect(opened.vault.events["gnaw-bone-2026"]?.[0]?.phone).toBe("(555) 013-0210");
  });

  it("tells the user to re-import, and names laptop-added riders only when they exist", () => {
    const events = {
      "gnaw-bone-2026": { dayOfRegistrations: [] },
    };
    expect(lockedContactMessage({ lockedEventIds: ["gnaw-bone-2026"], events })).toBe(
      "Emergency contacts saved on this laptop could not be unlocked. Re-import each event to restore emergency contacts from the site. The app saves them with the new key.",
    );
    expect(
      lockedContactMessage({
        lockedEventIds: ["gnaw-bone-2026"],
        events: {
          "gnaw-bone-2026": {
            dayOfRegistrations: [
              {
                seriesId: "dayof-sam",
                name: "Sam Ellis",
                number: 501,
                class: "C",
                registeredAt: "2026-09-12T08:00:00.000Z",
              },
            ],
          },
        },
      }),
    ).toContain("riders added on this laptop cannot be restored");
    expect(lockedContactMessage({ lockedEventIds: [], events })).toBeNull();
  });
});
