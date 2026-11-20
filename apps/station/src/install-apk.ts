import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { bytesToBase64 } from "@mwhe/core";

interface StationUpdatePlugin {
  install(options: { path: string }): Promise<void>;
}

const StationUpdate = registerPlugin<StationUpdatePlugin>("StationUpdate");

/**
 * Hand the APK to Android's installer. The user taps Install. Android refuses
 * the file when its signing certificate is not the one already on this phone,
 * which is why a debug test build cannot update another debug build.
 */
export async function launchStationInstaller(bytes: Uint8Array): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Install the update on the phone.");
  }
  await Filesystem.writeFile({
    path: "updates/station-update.apk",
    directory: Directory.Cache,
    data: bytesToBase64(bytes),
  });
  await StationUpdate.install({ path: "updates/station-update.apk" });
}
