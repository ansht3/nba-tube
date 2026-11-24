import { getCatalogRepository } from "@/catalog/server";
import { handleListVideos } from "@/lib/api/videos";

// Reads the request URL, so this runs per request; the CDN caches it through the
// Cache-Control and ETag headers the handler sets.
export function GET(request: Request) {
  return handleListVideos(request, getCatalogRepository());
}
