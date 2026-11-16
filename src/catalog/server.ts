import { createNeonDb } from "@/db/neon";
import { PostgresCatalogRepository } from "@/db/postgres-repository";
import { FileCatalogRepository } from "./file-repository";
import { loadCatalog } from "./load";
import type { CatalogRepository } from "./repository";

/**
 * Server-only. With DATABASE_URL set the catalog comes from Postgres; without it,
 * from the JSON file the site is built from, exactly as before the database
 * existed. That variable is the only switch, so rolling back is unsetting it.
 * There is deliberately no silent fallback to the file when the database fails:
 * that would hide an outage and serve a different catalog than the one published.
 */
function createRepository(): CatalogRepository {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  return databaseUrl ? new PostgresCatalogRepository(createNeonDb(databaseUrl)) : new FileCatalogRepository(loadCatalog);
}

let repository: CatalogRepository | undefined;

export function getCatalogRepository(): CatalogRepository {
  return (repository ??= createRepository());
}
