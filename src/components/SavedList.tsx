"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { formatShortDate, pluralize } from "@/lib/format";
import { playAllHref, savedListAsPlaylist, type SavedListId } from "@/lib/queue";
import { removeSaved, type SavedVideo } from "@/lib/storage/library";
import type { Store } from "@/lib/storage/store";
import { useStore } from "@/lib/storage/use-store";
import { useKnownVideoIds } from "@/lib/use-known-videos";
import { EmptyState } from "./EmptyState";
import { PlayIcon } from "./icons";
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
  /** When set, the list can be played from the top inside the site, in the order shown. */
  queueId?: SavedListId;
}

/** The body of the Watch later, Liked and History pages. */
export function SavedList({ store, dateVerb, removeLabel, emptyTitle, emptyHint, clearAllLabel, queueId }: Props) {
  const list = useStore(store);
  const known = useKnownVideoIds(list.map((saved) => saved.id));
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Removing a row removes the focused button with it. Focus moves to the list
  // summary instead of falling back to the top of the page.
  const summary = useRef<HTMLParagraphElement>(null);
  // Remembers that this visit started with items, so emptying the list moves
  // focus to the empty state but a page that loads empty does not steal it.
  const [hadItems, setHadItems] = useState(false);
  if (list.length > 0 && !hadItems) setHadItems(true);

  if (list.length === 0) {
    return (
      <EmptyState title={emptyTitle} focusOnMount={hadItems}>
        <p>{emptyHint}</p>
      </EmptyState>
    );
  }

  // Until the lookup has answered, assume every entry still has a page. Play all starts at the first video that has one.
  const firstPlayable = queueId ? list.find((saved) => (known ? known.has(saved.id) : true)) : undefined;
  const playAll = queueId && firstPlayable ? playAllHref(savedListAsPlaylist(queueId, [firstPlayable])) : null;

  return (
    <>
      <StorageNotice store={store} />
      <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p ref={summary} tabIndex={-1} className="text-sm text-muted">
          {pluralize(list.length, "video")}
        </p>
        {playAll && (
          <Link href={playAll} className="pill">
            <PlayIcon />
            Play all
          </Link>
        )}
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
              <button type="button" className="pill" autoFocus onClick={() => setConfirmingClear(false)}>
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
            onRemove={() => {
              store.update((current) => removeSaved(current, saved.id));
              summary.current?.focus();
            }}
          />
        ))}
      </ul>
    </>
  );
}
