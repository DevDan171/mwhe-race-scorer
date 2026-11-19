import {
  LIVE_SITE_ORIGIN,
  MOCK_DIRECTOR,
  MOCK_SITE_ORIGIN,
  SCORING_TEST_EVENT_ID,
} from "@mwhe/core";
import { useState } from "react";

import { messageOf } from "../message";
import { isTauri } from "../platform";
import { useHub } from "../use-hub";
import { Banner, Field } from "../ui";
import { useGoogleSignIn } from "./use-google-sign-in";

const dev = import.meta.env.DEV;

export function Settings() {
  const hub = useHub();
  const google = useGoogleSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <h1>Settings</h1>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {google.error ? <Banner tone="error">{google.error}</Banner> : null}
      <section className="card" style={{ padding: 16 }}>
        <h2>Account</h2>
        {hub.account ? (
          <>
            <p>
              {hub.account.name} · {hub.account.email} · {hub.account.role}
            </p>
            <p className="hint">
              Sign-in is stored in{" "}
              {isTauri() ? "Windows Credential Manager" : "this browser tab"}. The token
              is not written into the race file.
            </p>
            <button type="button" className="btn" onClick={() => void hub.signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <div className="stack">
            <p className="hint">Race directors and admins only. Riders are refused.</p>
            <button
              type="button"
              className="btn google"
              disabled={google.busy}
              onClick={() => void google.start()}
            >
              Sign in with Google
            </button>
            {google.busy ? (
              <p className="hint">
                Finish in the browser. The app continues by itself.{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => google.setShowCode(true)}
                >
                  Trouble signing in? Enter a code instead
                </button>
              </p>
            ) : null}
            {google.showCode ? (
              <div className="inline">
                <input
                  aria-label="One-time code"
                  value={google.typed}
                  onChange={(event) => google.setTyped(event.target.value)}
                  placeholder="ABCD-EFGH"
                />
                <button type="button" className="btn small" onClick={google.submitCode}>
                  Use code
                </button>
                <button type="button" className="btn small" onClick={google.cancel}>
                  Cancel
                </button>
              </div>
            ) : null}
            <Field label="Email">
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void hub
                  .signIn({ email, password })
                  .catch((caught: unknown) => setError(messageOf(caught)))
                  .finally(() => setBusy(false));
              }}
            >
              Sign in with email
            </button>
          </div>
        )}
      </section>
      <section className="card" style={{ padding: 16 }}>
        <h2>Site</h2>
        <p>
          {dev ? hub.baseUrl : LIVE_SITE_ORIGIN} is built in. There is no app id to type.
        </p>
        <p className="hint">
          Contact fields (birth date, phone, email, emergency contact, safety
          acknowledgement) are encrypted on this laptop with AES-256-GCM. The key lives in{" "}
          {isTauri()
            ? "Windows Credential Manager, separate from the sign-in token"
            : "this browser’s storage, because the preview has no Credential Manager"}
          . They are left out of results, the phone roster, exports, and the changelog.
        </p>
        {hub.pendingUploads > 0 ? (
          <p>
            {hub.pendingUploads} new series rider{hub.pendingUploads === 1 ? "" : "s"}{" "}
            waiting to upload.{" "}
            <button
              type="button"
              className="linkish"
              onClick={() => void hub.flushUploads()}
            >
              Try now
            </button>
          </p>
        ) : (
          <p className="hint">No series riders are waiting to upload.</p>
        )}
      </section>
      {dev ? (
        <section className="card" style={{ padding: 16 }}>
          <h2>Developer</h2>
          <p className="dev-note">
            This block is not in the packaged app. It points the preview at the mock site.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                void hub.setDevSite(MOCK_SITE_ORIGIN);
                setEmail(MOCK_DIRECTOR.email);
                setPassword(MOCK_DIRECTOR.password);
              }}
            >
              Use mock site
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => void hub.setDevSite(LIVE_SITE_ORIGIN)}
            >
              Use live site
            </button>
            <button
              type="button"
              className="btn small"
              disabled={!hub.hasToken}
              onClick={() =>
                void hub
                  .touchEvent(hub.activeEventId ?? SCORING_TEST_EVENT_ID)
                  .catch((caught: unknown) => setError(messageOf(caught)))
              }
            >
              Simulate a site change
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
