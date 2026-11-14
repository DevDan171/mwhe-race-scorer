/** Bump when a persisted document shape changes in a breaking way. */
export const SCHEMA_VERSION = 1 as const;

/**
 * Results stay provisional until this window closes, then the laptop
 * republishes them as official. Core records the status; it does not
 * advance the clock.
 */
export const PROTEST_WINDOW_MINUTES = 30;
