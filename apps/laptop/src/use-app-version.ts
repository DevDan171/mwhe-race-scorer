import { useEffect, useState } from "react";

import { APP_VERSION } from "./app-version";
import { isTauri } from "./platform";

/** The version baked into the installer, or the repo version in the browser preview. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(isTauri() ? null : APP_VERSION);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (!cancelled) setVersion(value);
      })
      .catch(() => {
        if (!cancelled) setVersion(APP_VERSION);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
