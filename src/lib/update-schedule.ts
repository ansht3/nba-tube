/** How often a visible tab asks the server whether the catalog changed. */
export const CHECK_INTERVAL_MS = 5 * 60_000;
/** Each wait is randomised by up to this fraction either way, so many open tabs do not all ask in the same second. */
export const JITTER = 0.2;
/** After failures the wait doubles, but never beyond this. */
export const MAX_INTERVAL_MS = 30 * 60_000;
/** Returning to a tab checks right away, unless it checked less than this long ago. */
export const MIN_GAP_ON_FOCUS_MS = 60_000;

/** The wait before the next check: the base interval, doubled per consecutive failure, with jitter. */
export function nextDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(CHECK_INTERVAL_MS * 2 ** failures, MAX_INTERVAL_MS);
  const factor = 1 + JITTER * (random() * 2 - 1);
  return Math.round(base * factor);
}

export function shouldCheckOnFocus(lastCheckAt: number, now: number): boolean {
  return now - lastCheckAt >= MIN_GAP_ON_FOCUS_MS;
}
