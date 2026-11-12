import type { Metadata } from "next";
import { loadCatalog } from "@/catalog/load";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = {
  title: "Browse all videos",
  description: "Search and filter every video in the catalog by section, type, team and source.",
};

const INITIAL_COUNT = 48;

export default function BrowsePage() {
  const { videos } = loadCatalog();

  const names = new Map<string, string>();
  for (const video of videos) names.set(video.channelId, video.channelTitle);
  const sources = [...names]
    .map(([channelId, name]) => ({ channelId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <BrowseView initial={videos.slice(0, INITIAL_COUNT)} total={videos.length} sources={sources} />
  );
}
