import { type ChangeAudit, type RaceDayState } from "@mwhe/core";
import { createContext, useContext } from "react";

export type ScreenId = "prep" | "setup" | "registration" | "changelog";

export interface HubApi {
  ready: boolean;
  bootError: string | null;
  screen: ScreenId;
  setScreen: (screen: ScreenId) => void;
  operatorName: string | null;
  baseUrl: string;
  hasToken: boolean;
  credentialStore: "windows" | "memory";
  state: RaceDayState | null;
  notice: string | null;
  signIn: (input: {
    operatorName: string;
    baseUrl: string;
    token: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  download: (eventId: string) => Promise<void>;
  change: (
    why: string,
    update: (state: RaceDayState, audit: ChangeAudit) => RaceDayState,
  ) => Promise<void>;
}

export const HubContext = createContext<HubApi | null>(null);

export function useHub(): HubApi {
  const api = useContext(HubContext);
  if (!api) throw new Error("useHub must be used inside HubProvider");
  return api;
}
