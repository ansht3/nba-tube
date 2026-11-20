"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { buildQueue, isSavedListId, savedListAsPlaylist, type Queue, type QueueEntry } from "./queue";
import { historyStore, likedStore, watchLaterStore } from "./storage/library";
import { playlistsStore } from "./storage/playlists";
import { useStore } from "./storage/use-store";

/**
 * What plays before and after the video being watched: the playlist named in
 * the address (?list=) when there is one (a playlist, or Liked or Watch later),
 * otherwise the suggestions beside it
 * and the viewer's own history. Reads the address and local storage in the
 * browser, so the prerendered page itself stays the same for everyone.
 */
export function useWatchQueue(currentId: string, related: QueueEntry[]): Queue {
  const listId = useSearchParams().get("list");
  const playlists = useStore(playlistsStore);
  const history = useStore(historyStore);
  const liked = useStore(likedStore);
  const watchLater = useStore(watchLaterStore);
  return useMemo(() => {
    const playlist = !listId ? null : isSavedListId(listId) ? savedListAsPlaylist(listId, listId === "liked" ? liked : watchLater) : (playlists.find((candidate) => candidate.id === listId) ?? null);
    return buildQueue({ currentId, playlist, related, history });
  }, [currentId, listId, playlists, liked, watchLater, related, history]);
}
