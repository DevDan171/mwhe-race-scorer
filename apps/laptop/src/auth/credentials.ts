export interface CredentialStore {
  readToken(): Promise<string | null>;
  writeToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

/** In-memory store for tests and the browser preview. Nothing is written to disk. */
export function createMemoryCredentialStore(): CredentialStore {
  let token: string | null = null;
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
  };
}
