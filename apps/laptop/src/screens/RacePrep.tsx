import { packageCounts } from "@mwhe/core";
import { useState } from "react";

import { useHub } from "../use-hub";
import { messageOf } from "../message";
import { Banner, Field } from "../ui";

export function RacePrep() {
  const hub = useHub();
  const [name, setName] = useState(hub.operatorName ?? "");
  const [baseUrl, setBaseUrl] = useState(hub.baseUrl);
  const [token, setToken] = useState("");
  const [eventId, setEventId] = useState("");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      setToken("");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const downloaded = hub.state ? packageCounts(hub.state.snapshot) : null;
  const current = hub.state ? packageCounts(hub.state.race) : null;

  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Before the race</p>
        <h1>Race Prep</h1>
        <p className="lede">
          Sign in, download the race once, then registration works with the Wi-Fi off.
        </p>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {hub.notice && !error ? <Banner tone="ok">{hub.notice}</Banner> : null}

      <section className="panel">
        <h2>Sign in</h2>
        <p className="hint">
          {hub.credentialStore === "windows"
            ? "The token is stored in Windows Credential Manager, not in a file."
            : "This browser preview keeps the token in memory until you close the tab. The Windows app uses Credential Manager."}
        </p>
        <div className="form-grid">
          <Field label="Your name" hint="Written on every changelog entry.">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field label="Site address">
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              inputMode="url"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Bearer token"
            hint={
              hub.hasToken
                ? "A token is saved. Paste a new one only to replace it."
                : "Paste the token from your race director or admin sign-in. There is no shared key."
            }
          >
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(() => hub.signIn({ operatorName: name, baseUrl, token }))
            }
          >
            Save sign-in
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !hub.hasToken}
            onClick={() => void run(() => hub.signOut())}
          >
            Sign out
          </button>
        </div>
        <p className="hint">
          Base44 has not documented a device-code exchange. Token paste is the sign-in
          path until that exists.
        </p>
      </section>

      <section className="panel">
        <h2>Download race package</h2>
        <Field label="Event id" hint="The mock site serves gnaw-bone-2026.">
          <input
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            spellCheck={false}
          />
        </Field>
        {hub.state ? (
          <label className="check">
            <input
              type="checkbox"
              checked={replace}
              onChange={(event) => setReplace(event.target.checked)}
            />
            <span>
              Replace the race stored on this laptop. Day-of registrations and the
              changelog for the current download will be replaced.
            </span>
          </label>
        ) : null}
        <button
          type="button"
          className="primary"
          disabled={busy || (hub.state !== null && !replace)}
          onClick={() =>
            void run(async () => {
              const id = eventId.trim();
              if (!id) {
                throw new Error("Enter an event id. The mock site uses gnaw-bone-2026.");
              }
              await hub.download(id);
            })
          }
        >
          Download race package
        </button>
        <details className="dev-note">
          <summary>Try this without the live site</summary>
          <p>
            Run <code>pnpm mock:site</code>, set the site address to{" "}
            <code>http://127.0.0.1:8787</code>, paste any token other than{" "}
            <code>forbidden</code>, and download <code>gnaw-bone-2026</code>.
          </p>
        </details>
      </section>

      {downloaded && current && hub.state ? (
        <section className="panel">
          <h2>On this laptop</h2>
          <p className="hint">
            Downloaded {new Date(hub.state.downloadedAt).toLocaleString()} · roster
            version {hub.state.rosterVersion}
            {current.eventRegistrations === downloaded.eventRegistrations
              ? ""
              : ` · event roster is now ${current.eventRegistrations}`}
          </p>
          <div className="counts">
            <Count label="Series riders" value={downloaded.seriesRiders} />
            <Count label="Event registrations" value={downloaded.eventRegistrations} />
            <Count label="Races" value={downloaded.races} />
            <Count label="Checks" value={downloaded.checks} />
          </div>
          <p className="offline">Registration works offline from this snapshot.</p>
        </section>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="count">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
