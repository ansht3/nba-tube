// Internal routes. The site is exported with trailing slashes, so links carry
// them too and never go through a redirect.

export function watchPath(youtubeId: string): string {
  return `/watch/${youtubeId}/`;
}

export function teamPath(teamId: string): string {
  return `/teams/${teamId.toLowerCase()}/`;
}

export function playlistPath(playlistId: string): string {
  return `/playlists/?list=${encodeURIComponent(playlistId)}`;
}
