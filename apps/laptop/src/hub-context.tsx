import {
  importRacePackage,
  type ChangeAudit,
  type RaceDayState,
  type SiteAccount,
} from "@mwhe/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  completeSignIn,
  confirmSession,
  downloadRacePackage,
  dropRejectedSession,
  SignInError,
} from "./auth/sign-in";
import { openLaptopBackend, type LaptopBackend } from "./db/open";
import { defaultSiteOrigin } from "./db/store";
import { isTauri } from "./platform";
import { siteFetch } from "./site-fetch";
import { HubContext, type HubApi, type ScreenId } from "./use-hub";

export function HubProvider({ children }: { children: ReactNode }) {
  const backend = useRef<LaptopBackend | null>(null);
  const epoch = useRef(0);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>("prep");
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(defaultSiteOrigin());
  const [appId, setAppId] = useState("");
  const [account, setAccount] = useState<SiteAccount | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [state, setState] = useState<RaceDayState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const record = useRef({ operatorName, baseUrl, appId, account, state });
  record.current = { operatorName, baseUrl, appId, account, state };

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
        setAppId(saved.appId);
        setAccount(saved.account);
        setState(saved.state);
        setHasToken(token !== null);
        setReady(true);
        if (!token || !saved.appId) return;
        const generation = epoch.current;
        const check = await confirmSession({
          baseUrl: saved.baseUrl,
          appId: saved.appId,
          token,
          fetch: siteFetch,
        });
        if (cancelled || epoch.current !== generation) return;
        if (check.kind === "keep") return;
        if (check.kind === "ok") {
          if (
            saved.account?.userId === check.account.userId &&
            saved.account.role === check.account.role &&
            saved.account.name === check.account.name
          ) {
            return;
          }
          await opened.store.save({
            operatorName: saved.operatorName,
            baseUrl: saved.baseUrl,
            appId: saved.appId,
            account: check.account,
            state: saved.state,
          });
          if (cancelled || epoch.current !== generation) return;
          setAccount(check.account);
          return;
        }
        await dropRejectedSession(opened.credentials, check);
        await opened.store.save({
          operatorName: saved.operatorName,
          baseUrl: saved.baseUrl,
          appId: saved.appId,
          account: null,
          state: saved.state,
        });
        if (cancelled || epoch.current !== generation) return;
        setHasToken(false);
        setAccount(null);
        setNotice(check.message);
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
      patch?: {
        operatorName?: string | null;
        baseUrl?: string;
        appId?: string;
        account?: SiteAccount | null;
      },
    ) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const operator =
        patch && "operatorName" in patch
          ? (patch.operatorName ?? null)
          : record.current.operatorName;
      const url = patch?.baseUrl ?? record.current.baseUrl;
      const nextAppId = patch?.appId ?? record.current.appId;
      const nextAccount =
        patch && "account" in patch ? (patch.account ?? null) : record.current.account;
      await opened.store.save({
        operatorName: operator,
        baseUrl: url,
        appId: nextAppId,
        account: nextAccount,
        state: next,
      });
      setOperatorName(operator);
      setBaseUrl(url);
      setAppId(nextAppId);
      setAccount(nextAccount);
      setState(next);
      setNotice("Saved on this laptop.");
    },
    [],
  );

  const signIn = useCallback(
    async (input: {
      operatorName: string;
      baseUrl: string;
      appId: string;
      email: string;
      password: string;
    }) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const generation = ++epoch.current;
      const name = input.operatorName.trim();
      if (!name) {
        throw new Error("Enter your name. It is written on every changelog entry.");
      }
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
      const signedIn = await completeSignIn(opened.credentials, {
        baseUrl: origin,
        appId: input.appId,
        email: input.email,
        password: input.password,
        fetch: siteFetch,
      });
      if (epoch.current !== generation) return;
      setHasToken(true);
      await persist(record.current.state, {
        operatorName: name,
        baseUrl: origin,
        appId: input.appId.trim(),
        account: signedIn,
      });
      setNotice(`Signed in as ${signedIn.name}.`);
    },
    [persist],
  );

  const saveName = useCallback(
    async (operatorName: string) => {
      const name = operatorName.trim();
      if (!name) {
        throw new Error("Enter your name. It is written on every changelog entry.");
      }
      await persist(record.current.state, { operatorName: name });
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    const opened = backend.current;
    if (!opened) throw new Error("The race database is not open");
    epoch.current += 1;
    await opened.credentials.clearToken();
    setHasToken(false);
    await persist(record.current.state, { operatorName: null, account: null });
    setNotice("Signed out. The race is still on this laptop.");
  }, [persist]);

  const download = useCallback(
    async (eventId: string) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      try {
        const racePackage = await downloadRacePackage(opened.credentials, {
          baseUrl: record.current.baseUrl,
          eventId,
          fetch: siteFetch,
        });
        const next = importRacePackage({
          racePackage,
          downloadedAt: new Date().toISOString(),
        });
        await persist(next);
      } catch (error) {
        if (
          error instanceof SignInError &&
          (error.code === "session_expired" || error.code === "forbidden_role")
        ) {
          setHasToken(false);
          await persist(record.current.state, { account: null });
          setNotice(error.message);
        }
        throw error;
      }
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
      appId,
      account,
      hasToken,
      credentialStore: isTauri() ? "windows" : "memory",
      state,
      notice,
      signIn,
      saveName,
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
      appId,
      account,
      hasToken,
      state,
      notice,
      signIn,
      saveName,
      signOut,
      download,
      change,
    ],
  );

  return <HubContext.Provider value={api}>{children}</HubContext.Provider>;
}
