"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { buildQueue, type Queue, type QueueEntry } from "./queue";
import { historyStore } from "./storage/library";
import { playlistsStore } from "./storage/playlists";
import { useStore } from "./storage/use-store";

/**
 * What plays before and after the video being watched: the playlist named in
 * the address (?list=) when there is one, otherwise the suggestions beside it
 * and the viewer's own history. Reads the address and local storage in the
 * browser, so the prerendered page itself stays the same for everyone.
 */
export function useWatchQueue(currentId: string, related: QueueEntry[]): Queue {
  const listId = useSearchParams().get("list");
  const playlists = useStore(playlistsStore);
  const history = useStore(historyStore);
  return useMemo(
    () => buildQueue({ currentId, playlist: listId ? (playlists.find((playlist) => playlist.id === listId) ?? null) : null, related, history }),
    [currentId, listId, playlists, related, history],
  );
}
