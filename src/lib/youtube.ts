// Every YouTube URL the interface builds comes from here. Ids are validated by
// the catalog schema before they get this far, and are still encoded so that a
// bad value can never change the shape of a URL.

export function watchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
}

export function channelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
}

/**
 * The official embedded player on YouTube's privacy-enhanced domain.
 * rel=0 keeps the end-of-video suggestions to the same official channel.
 * There is no autoplay parameter: playback starts when the viewer presses play.
 */
export function embedUrl(youtubeId: string, origin?: string): string {
  const params = new URLSearchParams({ rel: "0", enablejsapi: "1", playsinline: "1" });
  if (origin) params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?${params}`;
}

/** The thumbnail YouTube serves for every video. Used when only the id is known. */
export function defaultThumbnail(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;
}

/** YouTube's own "play these in order" link. It accepts at most 50 ids. */
export function playAllUrl(youtubeIds: string[]): string {
  const ids = youtubeIds.slice(0, 50).map(encodeURIComponent).join(",");
  return `https://www.youtube.com/watch_videos?video_ids=${ids}`;
}
