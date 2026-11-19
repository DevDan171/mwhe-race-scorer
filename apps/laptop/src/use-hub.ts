import {
  type ChangeAudit,
  type EventSummary,
  type RaceDayState,
  type RacePackage,
  type ReimportPreview,
  type SeriesRiderUpload,
  type SiteAccount,
} from "@mwhe/core";
import { createContext, useContext } from "react";

export type ScreenId =
  | "events"
  | "setup"
  | "registration"
  | "lookup"
  | "scoring"
  | "results"
  | "settings"
  | "changelog";

export interface HubApi {
  ready: boolean;
  bootError: string | null;
  screen: ScreenId;
  setScreen: (screen: ScreenId) => void;
  operatorName: string | null;
  baseUrl: string;
  appId: string;
  account: SiteAccount | null;
  hasToken: boolean;
  credentialStore: "windows" | "memory";
  vaultReady: boolean;
  state: RaceDayState | null;
  events: Record<string, RaceDayState>;
  activeEventId: string | null;
  pendingUploads: number;
  notice: string | null;
  dismissNotice: () => void;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signInWithGoogle: (input: { code: string; state: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setDevSite: (baseUrl: string) => Promise<void>;
  listEvents: () => Promise<EventSummary[]>;
  importEvent: (eventId: string, sourceUpdatedAt: string | null) => Promise<void>;
  selectEvent: (eventId: string) => Promise<void>;
  fetchPackage: (eventId: string) => Promise<RacePackage>;
  applyImported: (racePackage: RacePackage) => Promise<void>;
  previewImported: (racePackage: RacePackage) => ReimportPreview;
  touchEvent: (eventId: string) => Promise<void>;
  change: (
    why: string,
    update: (state: RaceDayState, audit: ChangeAudit) => RaceDayState,
  ) => Promise<void>;
  queueSeriesUpload: (rider: SeriesRiderUpload) => Promise<void>;
  flushUploads: () => Promise<void>;
}

export const HubContext = createContext<HubApi | null>(null);

export function useHub(): HubApi {
  const api = useContext(HubContext);
  if (!api) throw new Error("useHub must be used inside HubProvider");
  return api;
}
