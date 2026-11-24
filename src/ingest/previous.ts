import { catalogSchema, type Catalog } from "@/catalog/schema";
import { fallbackFor } from "@/catalog/status";
import { fetchWithRetry, MAX_CATALOG_BYTES, readJsonLimited, type FetchLike } from "./http";

export interface PreviousCatalogSources {
  /** The local data/catalog.json parsed as JSON, or undefined when the file does not exist. */
  local: () => unknown | undefined;
  /** Where the last published catalog can be downloaded, or null when unknown. */
  url: string | null;
  fetch: FetchLike;
  warn: (message: string) => void;
  /** Replaced in tests so that backoff does not slow them down. */
  sleep?: (ms: number) => Promise<void>;
}

const COST_OF_STARTING_FRESH = "This build will start fresh and publish only each channel's newest uploads, which can be fewer videos than the live site has.";

/**
 * The catalog a sync continues from. A build server starts clean, so without
 * the published catalog every build would forget videos that have scrolled out
 * of the channel feeds.
 */
export async function readPreviousCatalog(sources: PreviousCatalogSources): Promise<Catalog | null> {
  const local = sources.local();
  if (local !== undefined) {
    const parsed = catalogSchema.safeParse(local);
    if (parsed.success) return parsed.data;
    sources.warn("The existing data/catalog.json is not valid and will be rebuilt from scratch.");
    return null;
  }

  if (!sources.url) return null;
  try {
    // A busy server or a dropped connection is common for a moment, and giving up on the first one would shrink the
    // catalog, so these are retried before the build goes on without it.
    const response = await fetchWithRetry(sources.fetch, sources.url, { retries: 2, baseDelayMs: 1500, timeoutMs: 15_000, sleep: sources.sleep });
    // Nothing published yet: the first deploy. That is expected, not a failure.
    if (response.status === 404) {
      sources.warn("No published catalog exists yet (a first deploy), so this build starts fresh.");
      return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = catalogSchema.safeParse(await readJsonLimited(response, MAX_CATALOG_BYTES));
    // The seed is a sample, not a sync, so it is never carried forward.
    if (parsed.success && parsed.data.mode === "seed") return null;
    if (!parsed.success) throw new Error("the response is not a valid catalog");
    return parsed.data;
  } catch (error) {
    // The build goes on rather than failing (a failed sync deploys the committed seed, which is smaller still), but it
    // says plainly what that costs.
    sources.warn(`Could not read the published catalog (${error instanceof Error ? error.message : error}). ${COST_OF_STARTING_FRESH}`);
    return null;
  }
}

/**
 * What to do after a failed sync. The previous catalog is written back only
 * when this machine has none yet (a clean build server), so that the build
 * publishes it instead of the committed seed.
 */
export function planFailure(previous: Catalog | null, localCatalogExists: boolean): { writePrevious: boolean; fallback: "previous-catalog" | "seed" } {
  return { writePrevious: previous !== null && !localCatalogExists, fallback: fallbackFor(previous) };
}
