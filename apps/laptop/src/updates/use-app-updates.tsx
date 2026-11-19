import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isTauri } from "../platform";
import { useHub } from "../use-hub";
import { releaseNotesUrl, UPDATE_OFFLINE, updateErrorMessage } from "./messages";
import {
  shouldCheckForUpdates,
  UPDATE_CHECK_INTERVAL_MS,
  updatesArePaused,
} from "./policy";

export type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available" }
  | { kind: "downloading"; percent: number | null }
  | { kind: "error"; message: string }
  | { kind: "paused" };

export interface AppUpdateOffer {
  version: string;
  notes: string;
  notesUrl: string;
}

interface FoundUpdate extends AppUpdateOffer {
  downloadAndInstall: (onProgress: (percent: number | null) => void) => Promise<void>;
  close: () => Promise<void>;
}

export interface AppUpdates {
  phase: UpdatePhase;
  offer: AppUpdateOffer | null;
  paused: boolean;
  bannerVisible: boolean;
  checkNow: () => void;
  install: () => void;
  later: () => void;
  openNotes: () => void;
}

const UpdatesContext = createContext<AppUpdates | null>(null);

export function UpdatesProvider({ children }: { children: ReactNode }) {
  const hub = useHub();
  const [now, setNow] = useState(() => Date.now());
  const paused = updatesArePaused({
    screen: hub.screen,
    races: hub.state?.race.races ?? [],
    now,
  });
  const [phase, setPhase] = useState<UpdatePhase>({ kind: "idle" });
  const [offer, setOffer] = useState<FoundUpdate | null>(null);
  const [bannerHidden, setBannerHidden] = useState(false);
  const dismissed = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  const downloadingRef = useRef(false);
  pausedRef.current = paused;
  downloadingRef.current = phase.kind === "downloading";

  const replaceOffer = useCallback((next: FoundUpdate | null) => {
    setOffer((current) => {
      if (current && current !== next) void current.close().catch(() => undefined);
      return next;
    });
  }, []);

  const check = useCallback(
    async (manual: boolean) => {
      if (!isTauri()) {
        if (manual) {
          setPhase({
            kind: "error",
            message: "Updates install from the Windows app, not this preview.",
          });
        }
        return;
      }
      if (pausedRef.current) {
        if (manual) setPhase({ kind: "paused" });
        return;
      }
      if (downloadingRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (manual) setPhase({ kind: "error", message: UPDATE_OFFLINE });
        return;
      }
      if (manual) setPhase({ kind: "checking" });
      try {
        const found = await findUpdate();
        if (pausedRef.current) {
          await found?.close();
          if (manual) setPhase({ kind: "paused" });
          return;
        }
        if (!found) {
          replaceOffer(null);
          setPhase({ kind: "upToDate" });
          return;
        }
        replaceOffer(found);
        setPhase({ kind: "available" });
        if (dismissed.current !== found.version) setBannerHidden(false);
      } catch (caught) {
        if (manual && !pausedRef.current) {
          setPhase({ kind: "error", message: updateErrorMessage(caught) });
        }
      }
    },
    [replaceOffer],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const run = () => {
      if (
        !shouldCheckForUpdates({
          online: navigator.onLine !== false,
          paused: pausedRef.current,
          downloading: downloadingRef.current,
        })
      ) {
        return;
      }
      void check(false);
    };
    run();
    const timer = window.setInterval(run, UPDATE_CHECK_INTERVAL_MS);
    window.addEventListener("online", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
    };
  }, [check, paused]);

  const install = useCallback(() => {
    if (!offer || pausedRef.current || phase.kind === "downloading") return;
    setPhase({ kind: "downloading", percent: 0 });
    void offer
      .downloadAndInstall((percent) => {
        if (!pausedRef.current) setPhase({ kind: "downloading", percent });
      })
      .then(async () => {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      })
      .catch((caught: unknown) => {
        setPhase({ kind: "error", message: updateErrorMessage(caught) });
      });
  }, [offer, phase.kind]);

  const value = useMemo<AppUpdates>(
    () => ({
      phase: paused && phase.kind !== "downloading" ? { kind: "paused" } : phase,
      offer,
      paused,
      bannerVisible:
        Boolean(offer) && !bannerHidden && !paused && phase.kind !== "upToDate",
      checkNow: () => {
        void check(true);
      },
      install,
      later: () => {
        if (offer) dismissed.current = offer.version;
        setBannerHidden(true);
      },
      openNotes: () => {
        if (!offer) return;
        void import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(offer.notesUrl))
          .catch(() => undefined);
      },
    }),
    [bannerHidden, check, install, offer, paused, phase],
  );

  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}

export function useAppUpdates(): AppUpdates {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error("useAppUpdates must be used inside UpdatesProvider");
  return value;
}

async function findUpdate(): Promise<FoundUpdate | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  const notes = (update.body ?? "").trim();
  return {
    version: update.version,
    notes: notes.length > 400 ? `${notes.slice(0, 397)}…` : notes,
    notesUrl: releaseNotesUrl(update.version),
    close: () => update.close(),
    downloadAndInstall: (onProgress) => {
      let downloaded = 0;
      let total = 0;
      return update.downloadAndInstall(
        (event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
            onProgress(total > 0 ? 0 : null);
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            onProgress(
              total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
            );
          } else {
            onProgress(100);
          }
        },
        { restartAfterInstall: true },
      );
    },
  };
}
