import {
  collectPrivateRecords,
  importRacePackage,
  listEvents as fetchEventList,
  previewReimport,
  raceDayStateSchema,
  racePackageSchema,
  restorePrivateRecords,
  uploadSeriesRiders,
  type ChangeAudit,
  type RaceDayState,
  type RacePackage,
  type RiderPrivateRecord,
  type SeriesRiderUpload,
  type SiteAccount,
  applyReimport,
  SiteApiError,
} from "@mwhe/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  completeGoogleSignIn,
  completeSignIn,
  confirmSession,
  downloadRacePackage,
  dropRejectedSession,
  SignInError,
} from "./auth/sign-in";
import { openLaptopBackend, type LaptopBackend } from "./db/open";
import { defaultSiteOrigin } from "./db/store";
import { isTauri } from "./platform";
import {
  lockedContactMessage,
  readSavedVault,
  type SavedVault,
} from "./privacy/locked-contacts";
import { createVaultKey, exportVaultKey, importVaultKey, sealJson } from "./privacy/seal";
import { appIdForSite } from "./site-config";
import { siteFetch } from "./site-fetch";
import { HubContext, type HubApi, type ScreenId } from "./use-hub";

interface Session {
  operatorName: string | null;
  baseUrl: string;
  appId: string;
  account: SiteAccount | null;
  events: Record<string, RaceDayState>;
  activeEventId: string | null;
  uploads: SeriesRiderUpload[];
  lockedContactEventIds: string[];
}

const dev = import.meta.env.DEV;

export function HubProvider({ children }: { children: ReactNode }) {
  const backend = useRef<LaptopBackend | null>(null);
  const vaultKey = useRef<CryptoKey | null>(null);
  const epoch = useRef(0);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>("events");
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(defaultSiteOrigin());
  const [appId, setAppId] = useState(appIdForSite(defaultSiteOrigin()));
  const [account, setAccount] = useState<SiteAccount | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [vaultReady, setVaultReady] = useState(false);
  const [events, setEvents] = useState<Record<string, RaceDayState>>({});
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<SeriesRiderUpload[]>([]);
  const [lockedContactEventIds, setLockedContactEventIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const record = useRef<Session>({
    operatorName,
    baseUrl,
    appId,
    account,
    events,
    activeEventId,
    uploads,
    lockedContactEventIds,
  });
  record.current = {
    operatorName,
    baseUrl,
    appId,
    account,
    events,
    activeEventId,
    uploads,
    lockedContactEventIds,
  };

  const persist = useCallback(async (next: Session) => {
    const opened = backend.current;
    const key = vaultKey.current;
    if (!opened) throw new Error("The race database is not open");
    const privateCipher = key ? await sealVault(key, next.events, next.uploads) : null;
    setLockedContactEventIds(next.lockedContactEventIds);
    const active = next.activeEventId ? (next.events[next.activeEventId] ?? null) : null;
    await opened.store.save({
      operatorName: next.operatorName,
      baseUrl: next.baseUrl,
      appId: next.appId,
      account: next.account,
      state: active,
      events: next.events,
      activeEventId: active ? next.activeEventId : null,
      privateCipher,
      lockedContactEventIds: next.lockedContactEventIds,
    });
    record.current = {
      ...next,
      activeEventId: active ? next.activeEventId : null,
    };
    setOperatorName(next.operatorName);
    setBaseUrl(next.baseUrl);
    setAppId(next.appId);
    setAccount(next.account);
    setEvents(next.events);
    setActiveEventId(active ? next.activeEventId : null);
    setUploads(next.uploads);
  }, []);

  useEffect(() => {
    let cancelled = false;
    openLaptopBackend()
      .then(async (opened) => {
        const saved = await opened.store.load();
        const origin = dev ? saved.baseUrl : defaultSiteOrigin(false);
        const nextAppId = appIdForSite(origin);
        const key = await loadVaultKey(opened);
        const openedVault = await readSavedVault(key, saved.privateCipher);
        const restored = restoreEvents(saved.events, openedVault.vault.events);
        let nextLockedIds = saved.lockedContactEventIds;
        if (openedVault.locked && nextLockedIds.length === 0) {
          nextLockedIds = Object.keys(restored);
        }
        const token = await opened.credentials.readToken();
        if (cancelled) return;
        backend.current = opened;
        vaultKey.current = key;
        const session: Session = {
          operatorName: saved.operatorName,
          baseUrl: origin,
          appId: nextAppId,
          account: saved.account,
          events: restored,
          activeEventId: saved.activeEventId,
          uploads: openedVault.vault.uploads,
          lockedContactEventIds: nextLockedIds,
        };
        record.current = session;
        setVaultReady(true);
        setOperatorName(saved.operatorName);
        setBaseUrl(origin);
        setAppId(nextAppId);
        setAccount(saved.account);
        setEvents(restored);
        setActiveEventId(saved.activeEventId);
        setUploads(openedVault.vault.uploads);
        setLockedContactEventIds(nextLockedIds);
        setHasToken(token !== null);
        setReady(true);
        if (!token) return;
        const generation = epoch.current;
        const check = await confirmSession({
          baseUrl: origin,
          appId: nextAppId,
          token,
          fetch: siteFetch,
        });
        if (cancelled || epoch.current !== generation) return;
        if (check.kind === "keep") return;
        if (check.kind === "ok") {
          const current = record.current;
          if (
            current.account?.userId === check.account.userId &&
            current.account.role === check.account.role &&
            current.account.name === check.account.name
          ) {
            return;
          }
          await persist({
            ...current,
            baseUrl: origin,
            appId: nextAppId,
            account: check.account,
            operatorName: current.operatorName ?? check.account.name,
          });
          return;
        }
        await dropRejectedSession(opened.credentials, check);
        await persist({
          ...record.current,
          baseUrl: origin,
          appId: nextAppId,
          account: null,
        });
        if (cancelled || epoch.current !== generation) return;
        setHasToken(false);
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
  }, [persist]);

  const rememberSignIn = useCallback(
    async (
      generation: number,
      origin: string,
      nextAppId: string,
      signedIn: SiteAccount,
    ) => {
      if (epoch.current !== generation) return;
      setNotice(null);
      setHasToken(true);
      await persist({
        ...record.current,
        operatorName: signedIn.name,
        baseUrl: origin,
        appId: nextAppId,
        account: signedIn,
      });
      if (epoch.current !== generation) return;
      setScreen("events");
    },
    [persist],
  );

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const generation = ++epoch.current;
      const origin = record.current.baseUrl;
      const nextAppId = appIdForSite(origin);
      const signedIn = await completeSignIn(opened.credentials, {
        baseUrl: origin,
        appId: nextAppId,
        email: input.email,
        password: input.password,
        fetch: siteFetch,
      });
      await rememberSignIn(generation, origin, nextAppId, signedIn);
    },
    [rememberSignIn],
  );

  const signInWithGoogle = useCallback(
    async (input: { code: string; state: string }) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      const generation = ++epoch.current;
      const origin = record.current.baseUrl;
      const nextAppId = appIdForSite(origin);
      const signedIn = await completeGoogleSignIn(opened.credentials, {
        baseUrl: origin,
        code: input.code,
        state: input.state,
        fetch: siteFetch,
      });
      await rememberSignIn(generation, origin, nextAppId, signedIn);
    },
    [rememberSignIn],
  );

  const signOut = useCallback(async () => {
    const opened = backend.current;
    if (!opened) throw new Error("The race database is not open");
    epoch.current += 1;
    await opened.credentials.clearToken();
    setHasToken(false);
    await persist({ ...record.current, account: null });
    setNotice("Signed out. Races already on this laptop stay available.");
    setScreen("events");
  }, [persist]);

  const setDevSite = useCallback(
    async (nextUrl: string) => {
      if (!dev) return;
      const origin = new URL(nextUrl).origin;
      await persist({
        ...record.current,
        baseUrl: origin,
        appId: appIdForSite(origin),
      });
    },
    [persist],
  );

  const noteRejected = useCallback(
    async (error: unknown) => {
      if (!(error instanceof SignInError)) {
        if (
          error instanceof SiteApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          const opened = backend.current;
          if (opened) await opened.credentials.clearToken();
          setHasToken(false);
          await persist({ ...record.current, account: null });
          setNotice(error.message);
        }
        return;
      }
      if (error.code !== "session_expired" && error.code !== "forbidden_role") return;
      setHasToken(false);
      await persist({ ...record.current, account: null });
      setNotice(error.message);
    },
    [persist],
  );

  const listSiteEvents = useCallback(async () => {
    const opened = backend.current;
    if (!opened) throw new Error("The race database is not open");
    const token = await opened.credentials.readToken();
    if (!token) {
      throw new SignInError(
        "signed_out",
        "No sign-in token is saved on this laptop, so events cannot be loaded from the site. Sign in again.",
      );
    }
    try {
      return await fetchEventList({
        baseUrl: record.current.baseUrl,
        token,
        fetch: siteFetch,
      });
    } catch (error) {
      await noteRejected(error);
      throw error;
    }
  }, [noteRejected]);

  const importEvent = useCallback(
    async (eventId: string, sourceUpdatedAt: string | null) => {
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
          sourceUpdatedAt: sourceUpdatedAt ?? racePackage.event.updatedAt ?? null,
        });
        const eventsNext = { ...record.current.events, [next.race.event.id]: next };
        await persist({
          ...record.current,
          events: eventsNext,
          activeEventId: next.race.event.id,
        });
        setNotice(null);
      } catch (error) {
        await noteRejected(error);
        throw error;
      }
    },
    [noteRejected, persist],
  );

  const selectEvent = useCallback(
    async (eventId: string) => {
      if (!record.current.events[eventId]) return;
      await persist({ ...record.current, activeEventId: eventId });
    },
    [persist],
  );

  const fetchPackage = useCallback(
    async (eventId: string) => {
      const opened = backend.current;
      if (!opened) throw new Error("The race database is not open");
      try {
        return await downloadRacePackage(opened.credentials, {
          baseUrl: record.current.baseUrl,
          eventId,
          fetch: siteFetch,
        });
      } catch (error) {
        await noteRejected(error);
        throw error;
      }
    },
    [noteRejected],
  );

  const applyImported = useCallback(
    async (racePackage: RacePackage) => {
      const current = record.current.events[racePackage.event.id];
      const who = record.current.account?.name ?? record.current.operatorName;
      if (!current) throw new Error("Import the event before re-importing it.");
      if (!who) throw new Error("Sign in before re-importing.");
      const restoreUnreadableContacts = record.current.lockedContactEventIds.includes(
        racePackage.event.id,
      );
      const preview = previewReimport(current, racePackage, {
        restoreUnreadableContacts,
      });
      const entryIds = Array.from({ length: Math.max(preview.applyCount, 1) }, () =>
        crypto.randomUUID(),
      );
      const next = applyReimport(
        current,
        racePackage,
        {
          who,
          when: new Date().toISOString(),
          why: "Re-import from the site",
          entryIds,
        },
        { restoreUnreadableContacts },
      );
      const lockedContactEventIds = record.current.lockedContactEventIds.filter(
        (id) => id !== next.race.event.id,
      );
      await persist({
        ...record.current,
        events: { ...record.current.events, [next.race.event.id]: next },
        activeEventId: next.race.event.id,
        lockedContactEventIds,
      });
      setNotice(
        preview.applyCount === 0
          ? "Nothing new to apply. The event is already up to date."
          : `Applied ${preview.applyCount} change${preview.applyCount === 1 ? "" : "s"}.`,
      );
    },
    [persist],
  );

  const touchEvent = useCallback(async (eventId: string) => {
    const opened = backend.current;
    if (!opened || !dev) return;
    const token = await opened.credentials.readToken();
    if (!token) throw new SignInError("signed_out", "Sign in first.");
    const response = await siteFetch(`${record.current.baseUrl}/mock/touch-event`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ eventId }),
    });
    if (!response.ok) throw new Error("The mock site did not record a change.");
    setNotice(
      "The mock site has a newer copy of that event. Refresh the list, then re-import.",
    );
  }, []);

  const change = useCallback(
    async (
      why: string,
      update: (state: RaceDayState, audit: ChangeAudit) => RaceDayState,
    ) => {
      const currentId = record.current.activeEventId;
      const current = currentId ? record.current.events[currentId] : null;
      const who = record.current.account?.name ?? record.current.operatorName ?? "";
      if (!current || !currentId) throw new Error("Import an event first.");
      if (!who) throw new Error("Sign in before changing the race.");
      const next = update(current, {
        who,
        why,
        when: new Date().toISOString(),
        entryId: crypto.randomUUID(),
      });
      await persist({
        ...record.current,
        events: { ...record.current.events, [currentId]: next },
        operatorName: who,
      });
    },
    [persist],
  );

  const flushUploads = useCallback(async () => {
    const pending = record.current.uploads;
    const opened = backend.current;
    if (!opened || pending.length === 0) return;
    const token = await opened.credentials.readToken();
    if (!token) return;
    try {
      const created = await uploadSeriesRiders({
        baseUrl: record.current.baseUrl,
        token,
        riders: pending,
        fetch: siteFetch,
      });
      let eventsNext = record.current.events;
      for (const row of created) {
        if (row.localId === row.seriesId) continue;
        eventsNext = mapEvents(eventsNext, (state) =>
          rewriteSeriesId(state, row.localId, row.seriesId),
        );
      }
      const sent = new Set(created.map((row) => row.localId));
      await persist({
        ...record.current,
        events: eventsNext,
        uploads: record.current.uploads.filter((rider) => !sent.has(rider.localId)),
      });
      setNotice("New series riders were uploaded to the site.");
    } catch (error) {
      await noteRejected(error);
      if (!(error instanceof SignInError) && !(error instanceof SiteApiError)) {
        setNotice(
          "New series riders are saved here and will upload the next time the site answers.",
        );
      }
    }
  }, [noteRejected, persist]);

  const queueSeriesUpload = useCallback(
    async (rider: SeriesRiderUpload) => {
      const uploadsNext = [
        ...record.current.uploads.filter((entry) => entry.localId !== rider.localId),
        rider,
      ];
      await persist({ ...record.current, uploads: uploadsNext });
      await flushUploads();
    },
    [flushUploads, persist],
  );

  const state = activeEventId ? (events[activeEventId] ?? null) : null;

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
      vaultReady,
      state,
      events,
      activeEventId,
      pendingUploads: uploads.length,
      lockedContactEventIds,
      lockedContactNote: lockedContactMessage({
        lockedEventIds: lockedContactEventIds,
        events,
      }),
      notice,
      dismissNotice: () => setNotice(null),
      signIn,
      signInWithGoogle,
      signOut,
      setDevSite,
      listEvents: listSiteEvents,
      importEvent,
      selectEvent,
      fetchPackage,
      applyImported,
      previewImported: (racePackage) => {
        const current = events[racePackage.event.id];
        if (!current) {
          return {
            newRiders: [],
            riderUpdates: [],
            raceChanges: [],
            raceDayKept: [],
            contactsRestored: [],
            removedCount: 0,
            unchangedCount: 0,
            applyCount: 0,
          };
        }
        return previewReimport(current, racePackage, {
          restoreUnreadableContacts: lockedContactEventIds.includes(racePackage.event.id),
        });
      },
      touchEvent,
      change,
      queueSeriesUpload,
      flushUploads,
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
      vaultReady,
      state,
      events,
      activeEventId,
      uploads.length,
      lockedContactEventIds,
      notice,
      signIn,
      signInWithGoogle,
      signOut,
      setDevSite,
      listSiteEvents,
      importEvent,
      selectEvent,
      fetchPackage,
      applyImported,
      touchEvent,
      change,
      queueSeriesUpload,
      flushUploads,
    ],
  );

  return <HubContext.Provider value={api}>{children}</HubContext.Provider>;
}

async function loadVaultKey(opened: LaptopBackend): Promise<CryptoKey> {
  const existing = await opened.credentials.readVaultKey();
  if (existing) return importVaultKey(existing);
  const key = await createVaultKey();
  await opened.credentials.writeVaultKey(await exportVaultKey(key));
  return key;
}

async function sealVault(
  key: CryptoKey,
  events: Record<string, RaceDayState>,
  uploads: SeriesRiderUpload[],
): Promise<string | null> {
  const file: SavedVault = {
    events: Object.fromEntries(
      Object.entries(events).map(([id, state]) => [
        id,
        collectPrivateRecords(state.race),
      ]),
    ),
    uploads,
  };
  const hasContact = Object.values(file.events).some((records) => records.length > 0);
  if (!hasContact && uploads.length === 0) return null;
  return sealJson(key, file);
}

function restoreEvents(
  events: Record<string, RaceDayState>,
  contacts: Record<string, RiderPrivateRecord[]>,
): Record<string, RaceDayState> {
  const restored: Record<string, RaceDayState> = {};
  for (const [id, state] of Object.entries(events)) {
    const records = contacts[id] ?? [];
    restored[id] = raceDayStateSchema.parse({
      ...state,
      snapshot: restorePrivateRecords(state.snapshot, records),
      race: restorePrivateRecords(state.race, records),
    });
  }
  return restored;
}

function mapEvents(
  events: Record<string, RaceDayState>,
  update: (state: RaceDayState) => RaceDayState,
): Record<string, RaceDayState> {
  const next: Record<string, RaceDayState> = {};
  for (const [id, state] of Object.entries(events)) next[id] = update(state);
  return next;
}

function rewriteSeriesId(state: RaceDayState, from: string, to: string): RaceDayState {
  if (from === to) return state;
  if (!state.race.riders.some((rider) => rider.seriesId === from)) return state;
  return raceDayStateSchema.parse({
    ...state,
    race: racePackageSchema.parse({
      ...state.race,
      riders: state.race.riders.map((rider) =>
        rider.seriesId === from ? { ...rider, seriesId: to } : rider,
      ),
      registrations: state.race.registrations.map((registration) =>
        registration.seriesId === from ? { ...registration, seriesId: to } : registration,
      ),
    }),
    dayOfRegistrations: state.dayOfRegistrations.map((dayOf) =>
      dayOf.seriesId === from ? { ...dayOf, seriesId: to } : dayOf,
    ),
  });
}
