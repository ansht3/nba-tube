import { getCatalogRepository } from "@/catalog/server";
import { handleGetVideo } from "@/lib/api/videos";

export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  return handleGetVideo(request, id, getCatalogRepository());
}
