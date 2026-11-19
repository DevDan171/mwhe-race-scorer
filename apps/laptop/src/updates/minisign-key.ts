/** The minisign public key the updater trusts. Key id is in the decoded comment. */
export interface MinisignPublicKey {
  keyId: string;
  /** Ed25519 public key, including the 2-byte algorithm tag and 8-byte id. */
  rawLength: number;
}

/**
 * Tauri stores the `.key.pub` file as one base64 line. Decoding it yields the
 * minisign public key text, then the key itself.
 */
export function readMinisignPublicKey(encoded: string): MinisignPublicKey {
  const text = Buffer.from(encoded.trim(), "base64").toString("utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const comment = lines[0] ?? "";
  const keyLine = lines[1] ?? "";
  const keyId = comment
    .match(/minisign public key:\s*([0-9A-Fa-f]+)/)?.[1]
    ?.toUpperCase();
  const raw = Buffer.from(keyLine, "base64");
  if (!keyId || raw.length !== 42 || raw[0] !== 0x45 || raw[1] !== 0x64) {
    throw new Error("Updater public key is not a minisign Ed25519 key");
  }
  return { keyId, rawLength: raw.length };
}
