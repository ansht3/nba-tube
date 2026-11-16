import type { SavedVideo } from "./storage/library";
import type { Playlist } from "./storage/playlists";

/** What the queue needs to show and link a video. */
export interface QueueEntry {
  id: string;
  title: string;
  channelTitle: string;
}

export interface Queue {
  /** playlist: the viewer is playing one of their playlists. related: the suggestions beside the video. */
  source: "playlist" | "related";
  /** In play order. For a playlist this is every item; otherwise the suggestions, without the current video. */
  entries: QueueEntry[];
  /** Where the current video sits in `entries`, or -1 when it is not part of them. */
  index: number;
  previous: QueueEntry | null;
  next: QueueEntry | null;
  listId: string | null;
  listName: string | null;
}

const entryOf = (video: QueueEntry | SavedVideo): QueueEntry => ({ id: video.id, title: video.title, channelTitle: video.channelTitle });

/**
 * What plays before and after the current video.
 *
 * In a playlist it is the playlist's own order, and the ends are real ends: the
 * first video has nothing before it and the last nothing after. Otherwise Next
 * is the first suggestion and Previous is the last video the viewer watched
 * (from their own history, so with history paused there is none). Nothing here
 * ever starts a video by itself: it only says what a button would open.
 */
export function buildQueue(input: { currentId: string; playlist: Playlist | null; related: QueueEntry[]; history: SavedVideo[] }): Queue {
  const { currentId, playlist, related, history } = input;

  if (playlist) {
    const index = playlist.items.findIndex((item) => item.id === currentId);
    if (index >= 0) {
      const entries = playlist.items.map(entryOf);
      return { source: "playlist", entries, index, previous: entries[index - 1] ?? null, next: entries[index + 1] ?? null, listId: playlist.id, listName: playlist.name };
    }
  }

  const entries = related.filter((entry) => entry.id !== currentId);
  const lastWatched = history.find((entry) => entry.id !== currentId);
  return { source: "related", entries, index: -1, previous: lastWatched ? entryOf(lastWatched) : null, next: entries[0] ?? null, listId: null, listName: null };
}

/** The in-app address of a video, carrying the playlist it is being played from so Next and Previous keep working. */
export function watchHref(youtubeId: string, listId?: string | null): string {
  return `/watch/${youtubeId}/${listId ? `?list=${encodeURIComponent(listId)}` : ""}`;
}

/** The first video of a playlist, as the address "Play all" opens. Null for an empty playlist. */
export function playAllHref(playlist: Pick<Playlist, "id" | "items">): string | null {
  const first = playlist.items[0];
  return first ? watchHref(first.id, playlist.id) : null;
}
