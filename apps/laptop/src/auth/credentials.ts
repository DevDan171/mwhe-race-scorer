export interface CredentialStore {
  readToken(): Promise<string | null>;
  writeToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  /** AES key for rider contact fields. Sign-out does not clear it. */
  readVaultKey(): Promise<string | null>;
  writeVaultKey(value: string): Promise<void>;
}

/** In-memory store for tests and the browser preview. Nothing is written to disk. */
export function createMemoryCredentialStore(): CredentialStore {
  let token: string | null = null;
  let vaultKey: string | null = null;
  return {
    async readToken() {
      return token;
    },
    async writeToken(next) {
      const trimmed = next.trim();
      if (!trimmed) throw new Error("Token is empty");
      token = trimmed;
    },
    async clearToken() {
      token = null;
    },
    async readVaultKey() {
      return vaultKey;
    },
    async writeVaultKey(value) {
      const trimmed = value.trim();
      if (!trimmed) throw new Error("Vault key is empty");
      vaultKey = trimmed;
    },
  };
}
