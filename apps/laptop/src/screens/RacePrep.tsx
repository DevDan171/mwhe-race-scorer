import {
  buildLaptopSignInPageUrl,
  createSignInState,
  MOCK_APP_ID,
  MOCK_DIRECTOR,
  MOCK_GOOGLE_DIRECTOR,
  MOCK_RIDER,
  MOCK_SITE_ORIGIN,
  normalizeSignInCode,
  packageCounts,
  SAMPLE_EVENT_ID,
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
import { LIVE_SITE_ORIGIN } from "../db/store";
import { useHub } from "../use-hub";
import { messageOf } from "../message";
import { isTauri } from "../platform";
import { Banner, Field } from "../ui";

const dev = import.meta.env.DEV;

export function RacePrep() {
  const hub = useHub();
  const [name, setName] = useState(hub.operatorName ?? "");
  const [baseUrl, setBaseUrl] = useState(
    dev && hub.baseUrl === LIVE_SITE_ORIGIN ? MOCK_SITE_ORIGIN : hub.baseUrl,
  );
  const [appId, setAppId] = useState(hub.appId || (dev ? MOCK_APP_ID : ""));
  const [email, setEmail] = useState(hub.account?.email ?? "");
  const [password, setPassword] = useState("");
  const [eventId, setEventId] = useState(dev ? SAMPLE_EVENT_ID : "");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleCode, setGoogleCode] = useState("");
  const [googlePage, setGooglePage] = useState<string | null>(null);
  const googleAbort = useRef<AbortController | null>(null);
  const typedCode = useRef<ManualSignInCode | null>(null);

  useEffect(() => () => googleAbort.current?.abort(), []);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function startGoogle() {
    setError(null);
    if (!name.trim()) {
      setError("Enter your name. It is written on every changelog entry.");
      return;
    }
    if (!appId.trim()) {
      setError(
        "An app id is required. It is in the Base44 editor URL, between /apps/ and /editor/.",
      );
      return;
    }
    googleAbort.current?.abort();
    const abort = new AbortController();
    googleAbort.current = abort;
    const typed = manualSignInCode();
    typedCode.current = typed;
    setGoogleBusy(true);
    setGoogleCode("");
    try {
      const state = createSignInState();
      let callbackUrl: string | null = null;
      let loopback: Promise<string> | null = null;
      if (isTauri()) {
        const listener = await startLoopbackSignIn(state);
        if (abort.signal.aborted) {
          listener.cancel();
          return;
        }
        callbackUrl = listener.callbackUrl;
        loopback = listener.code;
        abort.signal.addEventListener("abort", () => listener.cancel());
      }
      const pageUrl = buildLaptopSignInPageUrl({
        siteOrigin: baseUrl,
        state,
        callbackUrl,
      });
      setGooglePage(pageUrl);
      const message = watchSignInMessage({
        siteOrigin: new URL(pageUrl).origin,
        state,
        signal: abort.signal,
      });
      void openSignInPage(pageUrl).catch((caught: unknown) => {
        if (!abort.signal.aborted) setError(messageOf(caught));
      });
      const code = await Promise.race([
        message,
        takeSignInCode([loopback, typed.promise], abort.signal),
      ]);
      await hub.signInWithGoogle({
        operatorName: name,
        baseUrl,
        appId,
        code,
        state,
      });
      if (googleAbort.current === abort) {
        setGooglePage(null);
        setGoogleCode("");
      }
    } catch (caught) {
      if (!isAbortError(caught) && !abort.signal.aborted) {
        setError(messageOf(caught));
        setGooglePage(null);
      }
    } finally {
      abort.abort();
      if (googleAbort.current === abort) setGoogleBusy(false);
    }
  }

  function fillMock() {
    setBaseUrl(MOCK_SITE_ORIGIN);
    setAppId(MOCK_APP_ID);
    setEmail(MOCK_DIRECTOR.email);
    setPassword(MOCK_DIRECTOR.password);
    setEventId(SAMPLE_EVENT_ID);
    if (!name.trim()) setName(MOCK_DIRECTOR.name);
  }

  const downloaded = hub.state ? packageCounts(hub.state.snapshot) : null;
  const current = hub.state ? packageCounts(hub.state.race) : null;
  const updatingName = hub.hasToken && password.length === 0;

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
          Use the email and password for your MidwestHardEnduro.com account, or Sign in
          with Google. An account that was created with Google has no password.{" "}
          {hub.credentialStore === "windows"
            ? "The sign-in is stored in Windows Credential Manager, not in a file."
            : "This browser preview keeps the sign-in in memory until you close the tab. The Windows app uses Credential Manager."}
        </p>
        {hub.account ? (
          <Banner tone="ok">
            Signed in as {hub.account.name} ({hub.account.email}),{" "}
            {roleLabel(hub.account.role)}.
          </Banner>
        ) : hub.hasToken ? (
          <Banner tone="info">
            A sign-in is saved, but this laptop does not know which account it is. Sign in
            again.
          </Banner>
        ) : null}
        <div className="form-grid">
          <Field label="Your name" hint="Written on every changelog entry.">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field label="Email">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Password"
            hint={
              hub.hasToken
                ? "Leave this blank to update your name only."
                : "The password for your MidwestHardEnduro.com account."
            }
          >
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </Field>
          <Field label="Site address" hint={`Downloads use ${hub.baseUrl}.`}>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              inputMode="url"
              spellCheck={false}
            />
          </Field>
          <Field
            label="App id"
            hint="From the Base44 editor URL, between /apps/ and /editor/. Dan sets this once. It is not a password."
          >
            <input
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy || googleBusy}
            onClick={() =>
              void run(async () => {
                if (updatingName) {
                  await hub.saveName(name);
                  return;
                }
                await hub.signIn({
                  operatorName: name,
                  baseUrl,
                  appId,
                  email,
                  password,
                });
                setPassword("");
              })
            }
          >
            {updatingName ? "Save name" : "Sign in"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || googleBusy}
            onClick={() => void startGoogle()}
          >
            Sign in with Google
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || googleBusy || !hub.hasToken}
            onClick={() => void run(() => hub.signOut())}
          >
            Sign out
          </button>
        </div>
        {googlePage ? (
          <div className="stack tight">
            <p className="hint">
              Finish in the browser. If it shows a code, type it here.
              {isTauri()
                ? " The Windows app also catches the browser when it returns on its own."
                : ""}
            </p>
            <p>
              <a href={googlePage} target="_blank" rel="noopener noreferrer">
                Open the Google sign-in page
              </a>
            </p>
            <Field label="Code from the browser">
              <input
                value={googleCode}
                onChange={(event) => setGoogleCode(event.target.value)}
                autoComplete="one-time-code"
                spellCheck={false}
                autoCapitalize="characters"
              />
            </Field>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (!normalizeSignInCode(googleCode)) {
                    setError("That code is not valid. Sign in with Google again.");
                    return;
                  }
                  setError(null);
                  typedCode.current?.submit(googleCode);
                }}
              >
                Use this code
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  googleAbort.current?.abort();
                  setGooglePage(null);
                  setGoogleCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
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
          disabled={busy || googleBusy || (hub.state !== null && !replace)}
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
        <p className="offline">
          After the download, registration keeps working with the Wi-Fi off.
        </p>
        <details className="dev-note" open={dev}>
          <summary>Try this without the live site</summary>
          <p>
            Run <code>pnpm mock:site</code>, then fill in the local test account. Sign in
            as <code>{MOCK_DIRECTOR.email}</code> / <code>{MOCK_DIRECTOR.password}</code>{" "}
            (race director). <code>{MOCK_RIDER.email}</code> uses the same password and is
            rejected. <code>{MOCK_GOOGLE_DIRECTOR.email}</code> has no password; email
            sign-in returns an error, and Sign in with Google accepts it. Download{" "}
            <code>{SAMPLE_EVENT_ID}</code>.
          </p>
          <button type="button" className="ghost" disabled={busy} onClick={fillMock}>
            Fill in the mock site
          </button>
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

function roleLabel(role: string): string {
  if (role === "race_director") return "race director";
  if (role === "admin") return "admin";
  return role;
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="count">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
