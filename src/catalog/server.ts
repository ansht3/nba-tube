import { FileCatalogRepository } from "./file-repository";
import { loadCatalog } from "./load";
import type { CatalogRepository } from "./repository";

// Server-only: loadCatalog reads from disk. The database implementation is
// selected here once it exists; until then every environment reads the JSON file.
const repository: CatalogRepository = new FileCatalogRepository(loadCatalog);

export function getCatalogRepository(): CatalogRepository {
  return repository;
}
