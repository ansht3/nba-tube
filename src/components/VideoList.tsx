"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { SectionId } from "@/catalog/content-types";
import type { Video } from "@/catalog/schema";
import { feedKey } from "@/lib/feed";
import { useVideoFeed } from "@/lib/use-video-feed";
import { FeedFooter } from "./FeedFooter";
import { VideoGrid } from "./VideoCard";

interface Props {
  /** The first page, rendered on the server so the list is there before any script runs. */
  initial: Video[];
  total: number;
  /** Where the next page starts, from the same query that produced `initial`. */
  nextCursor: string | null;
  /** Which slice of the catalog this list shows. */
  scope: { section?: SectionId; teamId?: string };
}

function ListBody({ initial, total, nextCursor, scope, path }: Props & { path: string }) {
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (scope.section) p.set("section", scope.section);
    if (scope.teamId) p.set("team", scope.teamId);
    return p;
  }, [scope.section, scope.teamId]);
  const feed = useVideoFeed({ path, params, initial: { key: feedKey(path, params), page: { videos: initial, total, nextCursor } } });

  return (
    <>
      <VideoGrid videos={feed.videos} />
      <FeedFooter feed={feed} retry={feed.retry} sentinel={feed.sentinel} />
    </>
  );
}

/**
 * A long list that keeps loading as the viewer scrolls. Only the first page is
 * in the HTML; the rest come from the API shortly before they are needed.
 */
export function VideoList(props: Props) {
  const path = usePathname() ?? "/";
  // Moving between two teams re-renders this component with new props; the key gives each list its own state.
  return <ListBody key={`${path}|${props.scope.section ?? ""}|${props.scope.teamId ?? ""}`} {...props} path={path} />;
}
