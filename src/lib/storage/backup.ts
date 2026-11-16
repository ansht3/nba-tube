import { MAX_HISTORY, MAX_SAVED, parseSavedList, type SavedVideo } from "./library";
import { MAX_PLAYLIST_ITEMS, MAX_PLAYLISTS, PLAYLIST_NAME_MAX, parsePlaylists, type Playlist } from "./playlists";

/**
 * Moving a library between browsers without an account: a plain JSON file the
 * viewer downloads and loads elsewhere. Nothing is sent anywhere. The file is
 * read as untrusted input, the same as localStorage is, so a hand-edited or
 * corrupt file drops bad entries instead of breaking the lists.
 */
export const BACKUP_APP = "nbatube";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5_000_000;

export interface Library {
  liked: SavedVideo[];
  watchLater: SavedVideo[];
  history: SavedVideo[];
  playlists: Playlist[];
}

export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  liked: SavedVideo[];
  watchLater: SavedVideo[];
  playlists: Playlist[];
  /** Only present when the viewer chose to include it: it records what they watched. */
  history?: SavedVideo[];
}

export function createBackup(library: Library, options: { includeHistory: boolean; now: Date }): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: options.now.toISOString(),
    liked: library.liked,
    watchLater: library.watchLater,
    playlists: library.playlists,
    ...(options.includeHistory ? { history: library.history } : {}),
  };
}

export type ParsedBackup = { ok: true; library: Partial<Library>; dropped: number } | { ok: false; error: string };

const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);

export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: "That file is too large to be an NBATube backup." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null || (raw as Record<string, unknown>).app !== BACKUP_APP) return { ok: false, error: "That file is not an NBATube backup." };
  const data = raw as Record<string, unknown>;
  if (typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1) return { ok: false, error: "That backup has no valid version." };
  if (data.version > BACKUP_VERSION) return { ok: false, error: "That backup was made by a newer version of NBATube. Update this site and try again." };

  const library: Partial<Library> = {};
  let dropped = 0;
  const readList = (key: "liked" | "watchLater" | "history", limit: number) => {
    if (!(key in data)) return;
    library[key] = parseSavedList(data[key], limit);
    dropped += count(data[key]) - library[key]!.length;
  };
  readList("liked", MAX_SAVED);
  readList("watchLater", MAX_SAVED);
  readList("history", MAX_HISTORY);
  if ("playlists" in data) {
    library.playlists = parsePlaylists(data.playlists);
    dropped += count(data.playlists) - library.playlists.length;
    for (const [i, playlist] of library.playlists.entries()) {
      const rawItems = (data.playlists as { items?: unknown }[])[i]?.items;
      dropped += Math.max(0, count(rawItems) - playlist.items.length);
    }
  }
  if (Object.keys(library).length === 0) return { ok: false, error: "That backup contains no lists." };
  return { ok: true, library, dropped };
}

/** The union of two lists, one entry per video (the more recently saved wins), newest first. */
export function mergeSaved(current: SavedVideo[], incoming: SavedVideo[], limit: number): SavedVideo[] {
  const byId = new Map<string, SavedVideo>();
  for (const entry of [...current, ...incoming]) {
    const have = byId.get(entry.id);
    if (!have || entry.savedAt > have.savedAt) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, limit);
}

/** A playlist name that no other playlist uses, keeping the viewer's name when they have not got it already. */
function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 1; taken.has(candidate.toLowerCase()); n++) {
    const suffix = n === 1 ? " (imported)" : ` (imported ${n})`;
    candidate = `${name.slice(0, PLAYLIST_NAME_MAX - suffix.length)}${suffix}`;
  }
  return candidate;
}

/**
 * Adds an imported library to the current one; nothing is replaced or removed.
 * A playlist with the same id gains the videos it lacks (its order and name are
 * kept). A new playlist whose name is taken by a different playlist is renamed.
 */
export function mergeLibrary(current: Library, incoming: Partial<Library>): { library: Library; added: { liked: number; watchLater: number; history: number; playlists: number; playlistVideos: number } } {
  const liked = mergeSaved(current.liked, incoming.liked ?? [], MAX_SAVED);
  const watchLater = mergeSaved(current.watchLater, incoming.watchLater ?? [], MAX_SAVED);
  const history = mergeSaved(current.history, incoming.history ?? [], MAX_HISTORY);

  const playlists = current.playlists.map((playlist) => ({ ...playlist, items: [...playlist.items] }));
  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const names = new Set(playlists.map((playlist) => playlist.name.toLowerCase()));
  let newPlaylists = 0;
  let playlistVideos = 0;
  for (const theirs of incoming.playlists ?? []) {
    const mine = byId.get(theirs.id);
    if (mine) {
      const have = new Set(mine.items.map((item) => item.id));
      for (const item of theirs.items) {
        if (have.has(item.id) || mine.items.length >= MAX_PLAYLIST_ITEMS) continue;
        mine.items.push(item);
        have.add(item.id);
        playlistVideos += 1;
      }
    } else if (playlists.length < MAX_PLAYLISTS) {
      const name = uniqueName(theirs.name, names);
      names.add(name.toLowerCase());
      const added = { ...theirs, name, items: theirs.items.slice(0, MAX_PLAYLIST_ITEMS) };
      playlists.push(added);
      byId.set(added.id, added);
      newPlaylists += 1;
      playlistVideos += added.items.length;
    }
  }

  const gained = (before: SavedVideo[], after: SavedVideo[]) => {
    const had = new Set(before.map((entry) => entry.id));
    return after.filter((entry) => !had.has(entry.id)).length;
  };
  return {
    library: { liked, watchLater, history, playlists },
    added: { liked: gained(current.liked, liked), watchLater: gained(current.watchLater, watchLater), history: gained(current.history, history), playlists: newPlaylists, playlistVideos },
  };
}
