"use client";

import { historyStore, likedStore, watchLaterStore } from "@/lib/storage/library";
import { SavedList } from "./SavedList";

// Stores cannot cross from a server page to a client component, so the pages
// name the list they want and the wiring for each one lives here.
const LISTS = {
  watchLater: {
    store: watchLaterStore,
    dateVerb: "Saved",
    removeLabel: "Remove from Watch later",
    emptyTitle: "Nothing saved for later",
    emptyHint: "Use the clock button on any video to add it to this queue.",
    clearAllLabel: undefined,
  },
  liked: {
    store: likedStore,
    dateVerb: "Liked",
    removeLabel: "Remove from Liked",
    emptyTitle: "No liked videos yet",
    emptyHint: "Press Like on a video's page and it will be listed here.",
    clearAllLabel: undefined,
  },
  history: {
    store: historyStore,
    dateVerb: "Watched",
    removeLabel: "Remove from history",
    emptyTitle: "No watch history",
    emptyHint: "Videos you open are listed here, unless history is paused in Settings.",
    clearAllLabel: "Clear history",
  },
} as const;

export function LibraryList({ list }: { list: keyof typeof LISTS }) {
  return <SavedList {...LISTS[list]} />;
}
