import {
  buildLaptopSignInPageUrl,
  createSignInState,
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
import { useHub } from "../use-hub";

export function useGoogleSignIn() {
  const hub = useHub();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [typed, setTyped] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const manual = useRef<ManualSignInCode | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function start() {
    setError(null);
    setShowCode(false);
    setPageUrl(null);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const typedCode = manualSignInCode();
    manual.current = typedCode;
    setBusy(true);
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
          [waitForCode ? waitForCode() : null, typedCode.promise],
          abort.signal,
        ),
      ]);
      await hub.signInWithGoogle({ code, state });
    } catch (caught) {
      if (!isAbortError(caught) && !abort.signal.aborted) setError(messageOf(caught));
    } finally {
      abort.abort();
      if (abortRef.current === abort) setBusy(false);
    }
  }

  return {
    busy,
    error,
    pageUrl,
    showCode,
    typed,
    setTyped,
    setShowCode,
    start,
    reportError: (message: string) => setError(message),
    cancel: () => {
      abortRef.current?.abort();
      setBusy(false);
      setPageUrl(null);
    },
    submitCode: () => {
      const code = normalizeSignInCode(typed);
      if (!code) {
        setError("That code is not valid. Sign in with Google again.");
        return;
      }
      manual.current?.submit(code);
    },
  };
}
