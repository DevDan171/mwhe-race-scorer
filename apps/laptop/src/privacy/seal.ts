/**
 * Field-level AES-256-GCM for rider contact fields.
 *
 * The race JSON stored in SQLite has those fields removed. This ciphertext
 * is the only copy on disk. The key is not in the database: the Windows app
 * keeps it in Credential Manager, and the browser preview keeps it in
 * IndexedDB because that preview has no credential manager.
 */

const VERSION = 1;

export async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportVaultKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importVaultKey(stored: string): Promise<CryptoKey> {
  const raw = toArrayBuffer(base64ToBytes(stored));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain),
  );
  const bytes = new Uint8Array(1 + iv.length + cipher.length);
  bytes[0] = VERSION;
  bytes.set(iv, 1);
  bytes.set(cipher, 1 + iv.length);
  return bytesToBase64(bytes);
}

export async function openJson(key: CryptoKey, sealed: string): Promise<unknown> {
  const bytes = base64ToBytes(sealed);
  if (bytes[0] !== VERSION || bytes.length < 14) {
    throw new Error("The encrypted rider file could not be read");
  }
  const iv = toArrayBuffer(bytes.subarray(1, 13));
  const cipher = toArrayBuffer(bytes.subarray(13));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as unknown;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
