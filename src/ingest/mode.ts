export type SyncMode = "api" | "feed";

export interface ModeRequest {
  /** The value of --mode, if one was given. */
  requested: string | undefined;
  seed: boolean;
  apiKey: string | undefined;
}

/**
 * Chooses how to discover videos. Without a key the sync still works, through
 * the keyless feeds. Asking for the API explicitly without a key is an error,
 * because silently doing something else would hide a misconfiguration.
 */
export function resolveMode({ requested, seed, apiKey }: ModeRequest): SyncMode {
  if (seed) return "feed";
  if (requested !== undefined && requested !== "api" && requested !== "feed") {
    throw new Error(`Unknown mode "${requested}". Use --mode=api or --mode=feed.`);
  }
  if (requested === "api" && !apiKey) {
    throw new Error(
      "--mode=api needs YOUTUBE_API_KEY. See docs/YOUTUBE_SETUP.md, or run without --mode to use the keyless feeds.",
    );
  }
  return requested ?? (apiKey ? "api" : "feed");
}
