import { invoke } from "@tauri-apps/api/core";

import type { CredentialStore } from "./credentials";

/** Windows Credential Manager via the `keyring` crate. The token is not written to a file. */
export function createTauriCredentialStore(): CredentialStore {
  return {
    readToken: () => invoke<string | null>("credential_get"),
    async writeToken(token: string) {
      await invoke("credential_set", { token });
    },
    clearToken: () => invoke("credential_clear"),
  };
}
