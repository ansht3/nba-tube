import { loadCatalog, loadSyncStatus } from "@/catalog/load";
import { buildStatus } from "@/catalog/status";

// Emitted as a plain file at build time: when this build's catalog was made,
// how fresh its newest video is, and what the sync that made it reported.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildStatus(loadCatalog(), loadSyncStatus()));
}
