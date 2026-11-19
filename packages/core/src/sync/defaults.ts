/**
 * Defaults the owner should review before race day. They are settings, not
 * rules baked into scoring.
 *
 * - Clock warning: a phone whose clock differs from the laptop by at least
 *   this many milliseconds is flagged. It does not change the punch time.
 * - Double-tap: the station asks before saving the same number again at the
 *   same check inside this window. Zero turns the question off.
 * - Android 8 / API 26 is the oldest phone the station app is built for.
 * - The laptop hub listens on this TCP port on the travel-router network.
 * - QR frames stay at or under this many characters so a phone screen can
 *   show a code the laptop camera can read. One punch that cannot fit is
 *   still emitted as its own frame.
 */
export const DEFAULT_CLOCK_OFFSET_WARN_MS = 2_000;

export const DEFAULT_DOUBLE_TAP_WINDOW_MS = 60_000;

export const MIN_ANDROID_API = 26;

export const SYNC_PORT = 8788;

export const QR_CHUNK_MAX_CHARS = 700;
