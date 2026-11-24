import { getCatalogRepository } from "@/catalog/server";
import { handleHealth } from "@/lib/api/health";

export function GET() {
  return handleHealth(getCatalogRepository());
}
