import { useEffect, useState } from "react";

import { messageOf } from "../message";
import { isTauri } from "../platform";

interface Offer {
  version: string;
  notes: string;
  install: () => Promise<void>;
}

export function UpdatePrompt() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void loadUpdate()
      .then((next) => {
        if (!cancelled) setOffer(next);
      })
      .catch(() => {
        // No published release yet, or this build cannot verify updater signatures.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!offer || hidden) return null;

  return (
    <div className="update-banner" role="status">
      <div>
        <strong>Update available</strong>
        <p>
          Version {offer.version} is ready. Your races, riders, and sign-in stay on this
          laptop.
        </p>
        {offer.notes ? <p>{offer.notes}</p> : null}
        {error ? <p className="update-error">{error}</p> : null}
      </div>
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void offer
              .install()
              .then(async () => {
                const { relaunch } = await import("@tauri-apps/plugin-process");
                await relaunch();
              })
              .catch((caught: unknown) => {
                setError(messageOf(caught));
                setBusy(false);
              });
          }}
        >
          {busy ? "Installing…" : "Install update"}
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => setHidden(true)}
        >
          Later
        </button>
      </div>
    </div>
  );
}

async function loadUpdate(): Promise<Offer | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  const notes = (update.body ?? "").trim();
  return {
    version: update.version,
    notes: notes.length > 280 ? `${notes.slice(0, 277)}…` : notes,
    install: () => update.downloadAndInstall(),
  };
}
