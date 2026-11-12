"use client";

import { useSyncExternalStore } from "react";
import type { Store } from "./store";

/**
 * Subscribes a component to a store. The server render and the first client
 * render both use the store's fallback, and the stored value arrives right
 * after hydration, so saved state never causes a hydration mismatch.
 */
export function useStore<Value>(store: Store<Value>): Value {
  return useSyncExternalStore(store.subscribe, store.get, () => store.fallback);
}
