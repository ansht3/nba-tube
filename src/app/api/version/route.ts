import { getCatalogRepository } from "@/catalog/server";
import { handleVersion } from "@/lib/api/catalog";

export function GET(request: Request) {
  return handleVersion(request, getCatalogRepository());
}
