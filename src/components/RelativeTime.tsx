"use client";

import { useSyncExternalStore } from "react";
import { formatRelative, formatShortDate } from "@/lib/format";

// One shared clock that ticks once a minute, so every date on the page moves together.
const MINUTE = 60_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  if (listeners.size === 0) now = Date.now();
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((notify) => notify());
  }, MINUTE);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * "7 hours ago" in the browser. The prebuilt HTML says "Nov 12" instead, because
 * an age written at build time would be wrong by the time anyone reads it.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const current = useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
  return (
    <time dateTime={iso} title={formatShortDate(iso)}>
      {current === null ? formatShortDate(iso) : formatRelative(iso, current)}
    </time>
  );
}
