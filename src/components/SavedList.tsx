"use client";

import { useState } from "react";
import { formatShortDate, pluralize } from "@/lib/format";
import { removeSaved, type SavedVideo } from "@/lib/storage/library";
import type { Store } from "@/lib/storage/store";
import { useStore } from "@/lib/storage/use-store";
import { useCatalog } from "@/lib/use-catalog";
import { EmptyState } from "./EmptyState";
import { SavedRow } from "./SavedRow";
import { StorageNotice } from "./StorageNotice";

interface Props {
  store: Store<SavedVideo[]>;
  /** Shown before the date on each row: "Saved" or "Watched". */
  dateVerb: string;
  removeLabel: string;
  emptyTitle: string;
  emptyHint: string;
  /** When set, the list can be emptied in one step, after a confirmation. */
  clearAllLabel?: string;
}

/** The body of the Watch later, Liked and History pages. */
export function SavedList({ store, dateVerb, removeLabel, emptyTitle, emptyHint, clearAllLabel }: Props) {
  const list = useStore(store);
  const catalog = useCatalog(list.length > 0);
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (list.length === 0) {
    return (
      <EmptyState title={emptyTitle}>
        <p>{emptyHint}</p>
      </EmptyState>
    );
  }

  // Until the catalog has loaded, assume every entry still has a page.
  const known = catalog.status === "ready" ? new Set(catalog.videos.map((video) => video.youtubeId)) : null;

  return (
    <>
      <StorageNotice store={store} />
      <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{pluralize(list.length, "video")}</p>
        {clearAllLabel &&
          (confirmingClear ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={clearAllLabel}>
              <span>Remove all {list.length.toLocaleString("en-US")}?</span>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  store.set([]);
                  setConfirmingClear(false);
                }}
              >
                Yes, clear
              </button>
              <button type="button" className="pill" onClick={() => setConfirmingClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="pill" onClick={() => setConfirmingClear(true)}>
              {clearAllLabel}
            </button>
          ))}
      </div>
      <ul className="flex max-w-3xl flex-col gap-4">
        {list.map((saved) => (
          <SavedRow
            key={saved.id}
            saved={saved}
            inCatalog={known ? known.has(saved.id) : true}
            note={`${dateVerb} ${formatShortDate(new Date(saved.savedAt).toISOString())}`}
            removeLabel={removeLabel}
            onRemove={() => store.update((current) => removeSaved(current, saved.id))}
          />
        ))}
      </ul>
    </>
  );
}
