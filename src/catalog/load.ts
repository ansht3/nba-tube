import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSchema, type Catalog } from "./schema";
import { parseSourceRegistry, type SourceRegistry } from "./sources";

// This module reads from disk, so it only runs at build time or in the dev
// server. Client components get the catalog from /catalog.json instead.

const DATA_DIR = path.join(process.cwd(), "data");
const SYNCED_CATALOG = path.join(DATA_DIR, "catalog.json");
const SEED_CATALOG = path.join(DATA_DIR, "seed", "catalog.json");

function readCatalog(file: string): Catalog {
  const parsed = catalogSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join(".");
    throw new Error(`${path.relative(process.cwd(), file)} is not a valid catalog (${where}: ${issue.message}). Run "npm run sync" to rebuild it.`);
  }
  return parsed.data;
}

/** YouTube's Developer Policies: stored API data must be refreshed or deleted within 30 days. */
export const MAX_API_METADATA_AGE_DAYS = 30;

/**
 * Drops API-derived records whose metadata is past the storage limit. The sync
 * already does this, but a build can run long after the last sync, so the site
 * enforces it too. Feed and seed catalogs hold no API data and pass through.
 */
export function withinStorageLimit(catalog: Catalog, now: Date): Catalog {
  if (catalog.mode !== "api") return catalog;
  const oldest = now.getTime() - MAX_API_METADATA_AGE_DAYS * 86_400_000;
  return { ...catalog, videos: catalog.videos.filter((video) => Date.parse(video.provenance.metadataCheckedAt) >= oldest) };
}

let cached: { file: string; modifiedAt: number; catalog: Catalog } | null = null;

/**
 * The catalog the site is built from: the synced one when it exists and has
 * videos, otherwise the committed seed. Re-read when the file changes, so a
 * sync shows up in a running dev server without a restart.
 */
export function loadCatalog(): Catalog {
  const candidates = [SYNCED_CATALOG, SEED_CATALOG].filter((file) => existsSync(file));

  for (const file of candidates) {
    const modifiedAt = statSync(file).mtimeMs;
    if (cached?.file === file && cached.modifiedAt === modifiedAt) return cached.catalog;

    const catalog = withinStorageLimit(readCatalog(file), new Date());
    // An empty sync (say, every feed was down) should not blank the site while a seed is available.
    if (catalog.videos.length === 0 && file !== candidates[candidates.length - 1]) continue;

    cached = { file, modifiedAt, catalog };
    return catalog;
  }

  throw new Error('No catalog found. Run "npm run sync", or restore data/seed/catalog.json.');
}

export function loadSources(): SourceRegistry {
  return parseSourceRegistry(JSON.parse(readFileSync(path.join(DATA_DIR, "sources.json"), "utf8")));
}
