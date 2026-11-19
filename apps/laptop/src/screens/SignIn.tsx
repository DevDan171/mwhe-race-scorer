import {
  buildLaptopSignInPageUrl,
  createSignInState,
  LIVE_SITE_ORIGIN,
  MOCK_DIRECTOR,
  MOCK_SITE_ORIGIN,
  normalizeSignInCode,
} from "@mwhe/core";
import { useEffect, useRef, useState } from "react";

import {
  isAbortError,
  manualSignInCode,
  openSignInPage,
  startLoopbackSignIn,
  takeSignInCode,
  watchSignInMessage,
  type ManualSignInCode,
} from "../auth/google";
import { messageOf } from "../message";
import { isTauri } from "../platform";
import { useAppVersion } from "../use-app-version";
import { useHub } from "../use-hub";
import { Banner, Field, Logo, OfflinePill } from "../ui";
import { SignInLink } from "./SignInLink";
import { UpdatePrompt } from "./UpdatePrompt";

const dev = import.meta.env.DEV;

export function SignIn() {
  const hub = useHub();
  const version = useAppVersion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [signedInName, setSignedInName] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [typed, setTyped] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const googleAbort = useRef<AbortController | null>(null);
  const typedCode = useRef<ManualSignInCode | null>(null);

  useEffect(() => () => googleAbort.current?.abort(), []);

  async function emailSignIn() {
    setError(null);
    setBusy(true);
    try {
      await hub.signIn({ email, password });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function startGoogle() {
    setError(null);
    setShowCode(false);
    setSignedInName(null);
    setPageUrl(null);
    googleAbort.current?.abort();
    const abort = new AbortController();
    googleAbort.current = abort;
    const manual = manualSignInCode();
    typedCode.current = manual;
    setGoogleBusy(true);
    try {
      const state = createSignInState();
      let callbackUrl: string | null = null;
      let waitForCode: (() => Promise<string>) | null = null;
      if (isTauri()) {
        const listener = await startLoopbackSignIn(state);
        if (abort.signal.aborted) {
          listener.cancel();
          return;
        }
        callbackUrl = listener.callbackUrl;
        waitForCode = listener.waitForCode;
        abort.signal.addEventListener("abort", () => listener.cancel());
      }
      const page = buildLaptopSignInPageUrl({
        siteOrigin: hub.baseUrl,
        state,
        callbackUrl,
      });
      setPageUrl(page);
      const message = watchSignInMessage({
        siteOrigin: new URL(page).origin,
        state,
        signal: abort.signal,
      });
      try {
        await openSignInPage(page);
      } catch (caught) {
        if (!abort.signal.aborted) setError(messageOf(caught));
      }
      const code = await Promise.race([
        message,
        takeSignInCode(
          [waitForCode ? waitForCode() : null, manual.promise],
          abort.signal,
        ),
      ]);
      await hub.signInWithGoogle({ code, state });
      setSignedInName(hub.account?.name ?? "your account");
    } catch (caught) {
      if (!isAbortError(caught) && !abort.signal.aborted) setError(messageOf(caught));
    } finally {
      abort.abort();
      if (googleAbort.current === abort) setGoogleBusy(false);
    }
  }

  function cancelGoogle() {
    googleAbort.current?.abort();
    setGoogleBusy(false);
    setShowCode(false);
    setPageUrl(null);
  }

  return (
    <div className="signin-shell">
      <header className="signin-top">
        <Logo />
        <OfflinePill />
      </header>
      <div className="signin-stage">
        <div className="signin-stack">
          <UpdatePrompt />
          <section className="signin-card">
            <Logo />
            {googleBusy ? (
              <GoogleWait
                error={error}
                pageUrl={pageUrl}
                onOpenError={setError}
                signedInName={signedInName}
                showCode={showCode}
                typed={typed}
                onTyped={setTyped}
                onShowCode={() => setShowCode(true)}
                onSubmitCode={() => {
                  const code = normalizeSignInCode(typed);
                  if (!code) {
                    setError("That code is not valid. Sign in with Google again.");
                    return;
                  }
                  typedCode.current?.submit(code);
                }}
                onCancel={cancelGoogle}
              />
            ) : (
              <>
                <p className="lede">
                  Sign in with the account you use on midwesthardenduro.com. Race
                  directors and admins only.
                </p>
                {error ? <Banner tone="error">{error}</Banner> : null}
                <button
                  type="button"
                  className="btn google"
                  onClick={() => void startGoogle()}
                >
                  <GoogleMark /> Sign in with Google
                </button>
                <div className="divider">or use email</div>
                <Field label="Email">
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void emailSignIn()}
                >
                  Sign in with email
                </button>
                <p className="hint">
                  Site: {dev ? hub.baseUrl : LIVE_SITE_ORIGIN} (built in — nothing to
                  type). Your sign-in is stored in{" "}
                  {isTauri() ? "Windows Credential Manager" : "this tab only"}.
                </p>
              </>
            )}
            {dev ? (
              <details className="dev-note">
                <summary>Developer: mock site</summary>
                <p>
                  Point this preview at the mock. The packaged app always uses{" "}
                  {LIVE_SITE_ORIGIN}.
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
                    Use the mock site
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => void hub.setDevSite(LIVE_SITE_ORIGIN)}
                  >
                    Use the live site
                  </button>
                </div>
              </details>
            ) : null}
            <p className="hint">{version ? `Version ${version}` : "Version …"}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function GoogleWait({
  error,
  pageUrl,
  onOpenError,
  signedInName,
  showCode,
  typed,
  onTyped,
  onShowCode,
  onSubmitCode,
  onCancel,
}: {
  error: string | null;
  pageUrl: string | null;
  onOpenError: (message: string) => void;
  signedInName: string | null;
  showCode: boolean;
  typed: string;
  onTyped: (value: string) => void;
  onShowCode: () => void;
  onSubmitCode: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h2>Finish signing in in your browser</h2>
      <p className="lede">
        Choose your Google account on the sign-in page. This screen continues when that
        finishes. You can also type the code below.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {pageUrl ? <SignInLink url={pageUrl} onError={onOpenError} /> : null}
      <div className="wait-box">
        <i className="spinner" aria-hidden="true" />
        <div>
          <strong>Waiting for Google…</strong>
          <p className="hint">This screen continues by itself.</p>
        </div>
      </div>
      <p className="hint">You can close the browser tab when it says you’re signed in.</p>
      {signedInName ? (
        <Banner tone="ok">
          Signed in as {signedInName} — race director access confirmed
        </Banner>
      ) : null}
      <div className="progress" aria-hidden="true">
        <span />
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        {showCode ? (
          <div className="inline" style={{ flex: 1 }}>
            <input
              aria-label="One-time code"
              value={typed}
              onChange={(event) => onTyped(event.target.value)}
              placeholder="ABCD-EFGH"
            />
            <button type="button" className="btn small" onClick={onSubmitCode}>
              Use code
            </button>
          </div>
        ) : (
          <button type="button" className="linkish" onClick={onShowCode}>
            Trouble signing in? Enter a code instead
          </button>
        )}
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.6 7.5l6.3 5.3C37.4 38.4 44 33 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
