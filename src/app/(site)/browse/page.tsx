import type { Metadata } from "next";
import { getCatalogRepository } from "@/catalog/server";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = {
  title: "Browse all videos",
  description: "Search and filter every video in the catalog by section, type, team and source.",
};

const INITIAL_COUNT = 48;

export default async function BrowsePage() {
  const repository = getCatalogRepository();
  const [first, channels] = await Promise.all([repository.list({ limit: INITIAL_COUNT }), repository.channels()]);
  const sources = channels.map(({ channelId, channelTitle }) => ({ channelId, name: channelTitle })).sort((a, b) => a.name.localeCompare(b.name));

  return <BrowseView initial={first.videos} total={first.total} sources={sources} />;
}
