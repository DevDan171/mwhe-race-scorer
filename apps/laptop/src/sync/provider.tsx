import type {
  Punch,
  RowStart,
  StartRowBrief,
  StartTime,
  StationPairing,
  StationRole,
  StationUpdateManifest,
} from "@mwhe/core";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { openLaptopBackend } from "../db/open";
import { messageOf } from "../message";
import { useAppVersion } from "../use-app-version";
import { useHub } from "../use-hub";
import { openSyncClient, type SyncClient } from "./client";
import { storedOf, type SyncView } from "./host";
import { createSyncStore, type SyncStore } from "./store";

interface SyncApi {
  view: SyncView | null;
  error: string | null;
  ready: boolean;
  createPairing: (input: {
    hubUrl: string;
    eventId: string;
    eventName: string;
    raceId: string;
    raceName: string;
    checkId: string;
    checkName: string;
    role?: StationRole;
    startRows?: StartRowBrief[];
  }) => Promise<StationPairing>;
  showPairing: (pairingId: string, hubUrl?: string) => Promise<StationPairing>;
  importPunchText: (text: string) => Promise<void>;
  rosterQr: (eventId: string, since: number) => Promise<string[]>;
  setClockWarnMs: (ms: number) => Promise<void>;
  setManualStart: (start: StartTime) => Promise<void>;
  setRowClock: (start: RowStart) => Promise<void>;
  setStationUpdate: (manifest: StationUpdateManifest, apkBase64: string) => Promise<void>;
  addPaperPunch: (punch: Punch) => Promise<void>;
  voidPunch: (uuid: string) => Promise<void>;
}

const SyncContext = createContext<SyncApi | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const hub = useHub();
  const version = useAppVersion();
  const clientRef = useRef<SyncClient | null>(null);
  const storeRef = useRef<SyncStore | null>(null);
  const savedJson = useRef("");
  const rosterKey = useRef<string | null>(null);
  const [view, setView] = useState<SyncView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remember(next: SyncView) {
    const store = storeRef.current;
    const json = JSON.stringify(storedOf(next));
    if (store && json !== savedJson.current) {
      await store.save(storedOf(next));
      savedJson.current = json;
    }
    setView(next);
  }

  useEffect(() => {
    if (!hub.ready || !version) return;
    let cancelled = false;
    let timer = 0;
    void (async () => {
      try {
        const backend = await openLaptopBackend();
        const store = createSyncStore(backend.db);
        const stored = await store.load();
        const client = await openSyncClient();
        if (cancelled) return;
        storeRef.current = store;
        clientRef.current = client;
        const seeded = await client.seed({
          stored,
          rosterDeltas: hub.state?.rosterDeltas ?? [],
          hubVersion: version,
        });
        if (cancelled) return;
        await remember(seeded);
        rosterKey.current = rosterIdentity(
          hub.state?.race.event.id,
          hub.state?.rosterVersion,
        );
        timer = window.setInterval(() => {
          void client
            .snapshot()
            .then((next) => remember(next))
            .catch((caught) => setError(messageOf(caught)));
        }, 2000);
      } catch (caught) {
        if (!cancelled) setError(messageOf(caught));
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // Seed once when the database and the app version are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.ready, version]);

  const eventId = hub.state?.race.event.id ?? "";
  const rosterVersion = hub.state?.rosterVersion ?? 0;
  useEffect(() => {
    const client = clientRef.current;
    const identity = rosterIdentity(eventId, rosterVersion);
    if (!client || !view) return;
    if (rosterKey.current === identity) return;
    rosterKey.current = identity;
    void client
      .setRoster(hub.state?.rosterDeltas ?? [])
      .then((next) => remember(next))
      .catch((caught) => setError(messageOf(caught)));
    // remember and hub.state are current when the version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, rosterVersion, view]);

  async function commit(
    work: (client: SyncClient) => Promise<SyncView>,
  ): Promise<SyncView> {
    const client = clientRef.current;
    if (!client) throw new Error("Stations are still opening.");
    const next = await work(client);
    await remember(next);
    return next;
  }

  const api: SyncApi = {
    view,
    error,
    ready: view !== null,
    async createPairing(input) {
      const client = clientRef.current;
      if (!client) throw new Error("Stations are still opening.");
      const pair = await client.createPairing(input);
      await remember(pair.view);
      return pair.payload;
    },
    async showPairing(pairingId, hubUrl) {
      const client = clientRef.current;
      if (!client) throw new Error("Stations are still opening.");
      const shown = await client.showPairing(pairingId, hubUrl);
      await remember(shown.view);
      return shown.payload;
    },
    async importPunchText(text) {
      await commit((client) => client.importPunchText(text));
    },
    rosterQr(eventIdForQr, since) {
      const client = clientRef.current;
      if (!client) return Promise.reject(new Error("Stations are still opening."));
      return client.rosterQr(eventIdForQr, since);
    },
    async setClockWarnMs(ms) {
      await commit((client) => client.setClockWarnMs(ms));
    },
    async setManualStart(start) {
      await commit((client) => client.setManualStart(start));
    },
    async setRowClock(start) {
      await commit((client) => client.setRowClock(start));
    },
    async setStationUpdate(manifest, apkBase64) {
      const client = clientRef.current;
      if (!client) return;
      await client.setStationUpdate(manifest, apkBase64);
    },
    async addPaperPunch(punch) {
      await commit((client) => client.addPaperPunch(punch));
    },
    async voidPunch(uuid) {
      await commit((client) => client.voidPunch(uuid));
    },
  };

  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncApi {
  const api = useContext(SyncContext);
  if (!api) throw new Error("useSync must be used inside SyncProvider");
  return api;
}

function rosterIdentity(
  eventId: string | undefined,
  version: number | undefined,
): string {
  return `${eventId ?? ""}:${version ?? 0}`;
}
