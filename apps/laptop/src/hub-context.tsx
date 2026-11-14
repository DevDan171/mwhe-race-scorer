import {
  getRacePackage,
  importRacePackage,
  type ChangeAudit,
  type RaceDayState,
} from "@mwhe/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { completeSignIn } from "./auth/sign-in";
import { openLaptopBackend, type LaptopBackend } from "./db/open";
import { DEFAULT_SITE_ORIGIN } from "./db/store";
import { isTauri } from "./platform";
import { siteFetch } from "./site-fetch";
import { HubContext, type HubApi, type ScreenId } from "./use-hub";

export function HubProvider({ children }: { children: ReactNode }) {
  const backend = useRef<LaptopBackend | null>(null);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>("prep");
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_SITE_ORIGIN);
  const [hasToken, setHasToken] = useState(false);
  const [state, setState] = useState<RaceDayState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const record = useRef({ operatorName, baseUrl, state });
  record.current = { operatorName, baseUrl, state };

  useEffect(() => {
    let cancelled = false;
    openLaptopBackend()
      .then(async (opened) => {
        const saved = await opened.store.load();
        const token = await opened.credentials.readToken();
        if (cancelled) return;
        backend.current = opened;
        setOperatorName(saved.operatorName);
        setBaseUrl(saved.baseUrl);
        setState(saved.state);
        setHasToken(token !== null);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBootError(
          error instanceof Error ? error.message : "Could not open the race database",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (
      next: RaceDayState | null,
      patch?: { operatorName?: string | null; baseUrl?: string },
    ) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const operator =
        patch && "operatorName" in patch
          ? (patch.operatorName ?? null)
          : record.current.operatorName;
      const url = patch?.baseUrl ?? record.current.baseUrl;
      await opened.store.save({
        operatorName: operator,
        baseUrl: url,
        state: next,
      });
      setOperatorName(operator);
      setBaseUrl(url);
      setState(next);
      setNotice("Saved on this laptop.");
    },
    [],
  );

  const signIn = useCallback(
    async (input: { operatorName: string; baseUrl: string; token: string }) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const name = input.operatorName.trim();
      if (!name)
        throw new Error("Enter your name. It is written on every changelog entry.");
      let origin: string;
      try {
        const url = new URL(input.baseUrl.trim());
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw new Error("bad protocol");
        }
        origin = url.origin;
      } catch {
        throw new Error(
          "Site address must be a full URL, like https://midwesthardenduro.com",
        );
      }
      const token = input.token.trim();
      if (token) {
        await completeSignIn(opened.credentials, { kind: "pasted_token", token });
        setHasToken(true);
      } else if (!(await opened.credentials.readToken())) {
        throw new Error("Paste a bearer token from your race director or admin sign-in.");
      }
      await persist(record.current.state, { operatorName: name, baseUrl: origin });
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    const opened = backend.current;
    if (!opened) throw new Error("The race database is not open");
    await opened.credentials.clearToken();
    setHasToken(false);
    await persist(record.current.state, { operatorName: null });
    setNotice("Signed out. The race is still on this laptop.");
  }, [persist]);

  const download = useCallback(
    async (eventId: string) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const token = await opened.credentials.readToken();
      if (!token) throw new Error("Sign in before downloading.");
      const racePackage = await getRacePackage({
        baseUrl: record.current.baseUrl,
        eventId,
        token,
        fetch: siteFetch,
      });
      const next = importRacePackage({
        racePackage,
        downloadedAt: new Date().toISOString(),
      });
      await persist(next);
    },
    [persist],
  );

  const change = useCallback(
    async (
      why: string,
      update: (current: RaceDayState, audit: ChangeAudit) => RaceDayState,
    ) => {
      const current = record.current.state;
      const who = record.current.operatorName?.trim() ?? "";
      if (!current) throw new Error("Download a race package first.");
      if (!who) throw new Error("Enter your name on Race Prep before changing the race.");
      const next = update(current, {
        who,
        why,
        when: new Date().toISOString(),
        entryId: crypto.randomUUID(),
      });
      await persist(next);
    },
    [persist],
  );

  const api = useMemo<HubApi>(
    () => ({
      ready,
      bootError,
      screen,
      setScreen,
      operatorName,
      baseUrl,
      hasToken,
      credentialStore: isTauri() ? "windows" : "memory",
      state,
      notice,
      signIn,
      signOut,
      download,
      change,
    }),
    [
      ready,
      bootError,
      screen,
      operatorName,
      baseUrl,
      hasToken,
      state,
      notice,
      signIn,
      signOut,
      download,
      change,
    ],
  );

  return <HubContext.Provider value={api}>{children}</HubContext.Provider>;
}
