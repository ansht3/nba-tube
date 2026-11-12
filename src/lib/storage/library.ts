import { STORAGE_KEYS } from "./keys";
import { createStore } from "./store";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A video as remembered in one of the personal lists. The title and channel
 * are copied at the time of saving, so the list can still say what an entry
 * was after the video has left the catalog.
 */
export interface SavedVideo {
  id: string;
  title: string;
  channelTitle: string;
  savedAt: number;
}

export const MAX_SAVED = 1000;
export const MAX_HISTORY = 500;

function isSavedVideo(value: unknown): value is SavedVideo {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    YOUTUBE_ID.test(entry.id) &&
    typeof entry.title === "string" &&
    typeof entry.channelTitle === "string" &&
    typeof entry.savedAt === "number" &&
    Number.isFinite(entry.savedAt)
  );
}

/**
 * Reads a stored list defensively. localStorage can hold anything: an older
 * shape, a hand-edited value, or data another script wrote. Invalid entries
 * and repeats are dropped rather than trusted.
 */
export function parseSavedList(stored: unknown, limit = MAX_SAVED): SavedVideo[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const list: SavedVideo[] = [];
  for (const entry of stored) {
    if (!isSavedVideo(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    list.push({ id: entry.id, title: entry.title, channelTitle: entry.channelTitle, savedAt: entry.savedAt });
  }
  return list.slice(0, limit);
}

export function toSavedVideo(video: { youtubeId: string; title: string; channelTitle: string }, now: number): SavedVideo {
  return { id: video.youtubeId, title: video.title, channelTitle: video.channelTitle, savedAt: now };
}

export function isSaved(list: SavedVideo[], id: string): boolean {
  return list.some((entry) => entry.id === id);
}

export function removeSaved(list: SavedVideo[], id: string): SavedVideo[] {
  return list.filter((entry) => entry.id !== id);
}

/** Adds the video to the front of the list, or removes it if it is already there. */
export function toggleSaved(list: SavedVideo[], video: SavedVideo): SavedVideo[] {
  if (isSaved(list, video.id)) return removeSaved(list, video.id);
  return [video, ...list].slice(0, MAX_SAVED);
}

/** Moves the video to the front, so watching something twice does not list it twice. */
export function recordWatch(list: SavedVideo[], video: SavedVideo): SavedVideo[] {
  return [video, ...removeSaved(list, video.id)].slice(0, MAX_HISTORY);
}

const EMPTY: SavedVideo[] = [];

export const likedStore = createStore({ key: STORAGE_KEYS.liked, fallback: EMPTY, parse: (stored) => parseSavedList(stored) });
export const watchLaterStore = createStore({ key: STORAGE_KEYS.watchLater, fallback: EMPTY, parse: (stored) => parseSavedList(stored) });
export const historyStore = createStore({ key: STORAGE_KEYS.history, fallback: EMPTY, parse: (stored) => parseSavedList(stored, MAX_HISTORY) });
