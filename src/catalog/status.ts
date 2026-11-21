import { z } from "zod";
import type { Catalog } from "./schema";

/**
 * What the last sync did, written next to the catalog so the site can say
 * whether its data is current instead of leaving that to a green build.
 */
export const syncStatusSchema = z.object({
  ok: z.boolean(),
  finishedAt: z.iso.datetime(),
  mode: z.enum(["seed", "feed", "api"]).nullable(),
  /** none: this sync's own result. previous-catalog: the sync failed, so the last published catalog was kept. seed: it failed and there was nothing to keep. */
  usedFallback: z.enum(["none", "previous-catalog", "seed"]),
  sourceErrors: z.number().int().nonnegative(),
  error: z.string().nullable(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export interface CatalogStatus {
  generatedAt: string;
  mode: Catalog["mode"];
  videoCount: number;
  newestPublishedAt: string | null;
  /** null when the catalog did not come from a sync run on this machine (for example the committed seed). */
  sync: SyncStatus | null;
}

export function buildStatus(catalog: Catalog, sync: SyncStatus | null): CatalogStatus {
  const newest = catalog.videos.reduce<string | null>((latest, video) => (latest === null || video.publishedAt > latest ? video.publishedAt : latest), null);
  return { generatedAt: catalog.generatedAt, mode: catalog.mode, videoCount: catalog.videos.length, newestPublishedAt: newest, sync };
}

/** A failed sync keeps the last published catalog when there is one; the seed is only for a first build. */
export function fallbackFor(previous: Catalog | null): "previous-catalog" | "seed" {
  return previous ? "previous-catalog" : "seed";
}
