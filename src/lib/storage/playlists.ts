import { STORAGE_KEYS } from "./keys";
import { isSaved, parseSavedList, removeSaved, type SavedVideo } from "./library";
import { createStore } from "./store";

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  items: SavedVideo[];
}

export const PLAYLIST_NAME_MAX = 60;
export const MAX_PLAYLISTS = 50;
export const MAX_PLAYLIST_ITEMS = 500;

export function parsePlaylists(stored: unknown): Playlist[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const playlists: Playlist[] = [];

  for (const value of stored) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (typeof entry.id !== "string" || entry.id === "" || seen.has(entry.id)) continue;
    if (typeof entry.name !== "string" || entry.name.trim() === "") continue;

    seen.add(entry.id);
    playlists.push({
      id: entry.id,
      name: entry.name.trim().slice(0, PLAYLIST_NAME_MAX),
      createdAt: typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
      items: parseSavedList(entry.items, MAX_PLAYLIST_ITEMS),
    });
  }

  return playlists.slice(0, MAX_PLAYLISTS);
}

/**
 * Checks a name someone typed. Returns the message to show them, or null when
 * the name is fine. `exceptId` is the playlist being renamed, which is allowed
 * to keep its own name.
 */
export function validatePlaylistName(name: string, playlists: Playlist[], exceptId?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Give the playlist a name.";
  if (trimmed.length > PLAYLIST_NAME_MAX) return `Keep the name under ${PLAYLIST_NAME_MAX} characters.`;
  const taken = playlists.some(
    (playlist) => playlist.id !== exceptId && playlist.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (taken) return "You already have a playlist with that name.";
  if (exceptId === undefined && playlists.length >= MAX_PLAYLISTS) return `You can keep up to ${MAX_PLAYLISTS} playlists.`;
  return null;
}

export function createPlaylist(playlists: Playlist[], name: string, id: string, now: number): Playlist[] {
  if (validatePlaylistName(name, playlists) !== null) return playlists;
  return [{ id, name: name.trim(), createdAt: now, items: [] }, ...playlists];
}

export function renamePlaylist(playlists: Playlist[], id: string, name: string): Playlist[] {
  if (validatePlaylistName(name, playlists, id) !== null) return playlists;
  return playlists.map((playlist) => (playlist.id === id ? { ...playlist, name: name.trim() } : playlist));
}

export function deletePlaylist(playlists: Playlist[], id: string): Playlist[] {
  return playlists.filter((playlist) => playlist.id !== id);
}

/** Adds the video to the end of the playlist. Adding it twice changes nothing. */
export function addToPlaylist(playlists: Playlist[], id: string, video: SavedVideo): Playlist[] {
  return playlists.map((playlist) => {
    if (playlist.id !== id || isSaved(playlist.items, video.id)) return playlist;
    if (playlist.items.length >= MAX_PLAYLIST_ITEMS) return playlist;
    return { ...playlist, items: [...playlist.items, video] };
  });
}

export function removeFromPlaylist(playlists: Playlist[], id: string, videoId: string): Playlist[] {
  return playlists.map((playlist) =>
    playlist.id === id ? { ...playlist, items: removeSaved(playlist.items, videoId) } : playlist,
  );
}

/** A random id for a new playlist. randomUUID needs a secure context, so plain http gets a fallback. */
export function newPlaylistId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const EMPTY: Playlist[] = [];

export const playlistsStore = createStore({ key: STORAGE_KEYS.playlists, fallback: EMPTY, parse: parsePlaylists });
