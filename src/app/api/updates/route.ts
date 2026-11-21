import { getCatalogRepository } from "@/catalog/server";
import { handleUpdates } from "@/lib/api/catalog";

export function GET(request: Request) {
  return handleUpdates(request, getCatalogRepository());
}
