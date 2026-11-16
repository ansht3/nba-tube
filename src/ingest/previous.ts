import { catalogSchema, type Catalog } from "@/catalog/schema";
import { fallbackFor } from "@/catalog/status";
import type { FetchLike } from "./http";

export interface PreviousCatalogSources {
  /** The local data/catalog.json parsed as JSON, or undefined when the file does not exist. */
  local: () => unknown | undefined;
  /** Where the last published catalog can be downloaded, or null when unknown. */
  url: string | null;
  fetch: FetchLike;
  warn: (message: string) => void;
}

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
    const response = await sources.fetch(sources.url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = catalogSchema.safeParse(await response.json());
    // The seed is a sample, not a sync, so it is never carried forward.
    if (!parsed.success || parsed.data.mode === "seed") return null;
    return parsed.data;
  } catch (error) {
    // First deploy, or the site is down: start fresh rather than fail the build.
    sources.warn(`Could not read the published catalog (${error instanceof Error ? error.message : error}). Starting fresh.`);
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
