import { Capacitor, registerPlugin } from "@capacitor/core";

interface StationKeepPlugin {
  start(options: { title: string; body: string }): Promise<void>;
  stop(): Promise<void>;
  ensureCamera(): Promise<void>;
}

const StationKeep = registerPlugin<StationKeepPlugin>("StationKeep");

/** Keep the screen on, and ask Android not to kill the station while it is live. */
export async function setStationAwake(active: boolean, body: string): Promise<void> {
  if (active) {
    await requestScreenLock();
    if (Capacitor.isNativePlatform()) {
      await StationKeep.start({ title: "MWHE Station is recording", body });
    }
    return;
  }
  await releaseScreenLock();
  if (Capacitor.isNativePlatform()) {
    await StationKeep.stop().catch(() => undefined);
  }
}

export async function ensureCamera(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await StationKeep.ensureCamera();
}

let screenLock: WakeLockSentinel | null = null;

async function requestScreenLock(): Promise<void> {
  const locks = navigator.wakeLock;
  if (!locks || screenLock) return;
  try {
    screenLock = await locks.request("screen");
    screenLock.addEventListener("release", () => {
      screenLock = null;
    });
  } catch {
    screenLock = null;
  }
}

async function releaseScreenLock(): Promise<void> {
  const current = screenLock;
  screenLock = null;
  await current?.release().catch(() => undefined);
}
