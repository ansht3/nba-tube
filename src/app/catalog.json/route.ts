import { loadCatalog } from "@/catalog/load";

// Emitted as a plain file at build time. Search, filters and the personal
// lists read it in the browser.
export const dynamic = "force-static";

export function GET() {
  return Response.json(loadCatalog());
}
