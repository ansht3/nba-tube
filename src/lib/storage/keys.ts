// The version is part of every key. If a stored shape ever has to change in a
// way old data cannot be read, bump it and write a migration, instead of
// letting two shapes share one key.
const PREFIX = "nbatube:v1";

export const STORAGE_KEYS = {
  liked: `${PREFIX}:liked`,
  watchLater: `${PREFIX}:watch-later`,
  history: `${PREFIX}:history`,
  playlists: `${PREFIX}:playlists`,
  settings: `${PREFIX}:settings`,
} as const;
