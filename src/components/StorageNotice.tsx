"use client";

import type { Store } from "@/lib/storage/store";
import { useStore } from "@/lib/storage/use-store";

/**
 * Tells the viewer when the browser is not saving their changes, which happens
 * in some private modes and when storage is full. Without this, a list would
 * look saved and then be empty on the next visit.
 */
export function StorageNotice<Value>({ store }: { store: Store<Value> }) {
  // Subscribing re-renders this after every write, which is when the answer can change.
  useStore(store);
  if (store.isPersisting()) return null;

  return (
    <p role="status" className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      Your browser is not saving changes right now, so this will be lost when you close the tab. Private browsing or
      full storage are the usual causes.
    </p>
  );
}
