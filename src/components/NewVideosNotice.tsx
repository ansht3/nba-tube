"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { useCatalogUpdates, type CatalogMarker } from "@/lib/use-catalog-updates";

/**
 * "N new videos". It appears when ingestion has published videos after this
 * page was built, and never moves anything by itself.
 *
 * On a watch page a video may be playing, so the notice only offers a link that
 * opens the newest videos in a new tab: the player is never touched. Elsewhere
 * "Show" refreshes the page's data in place, without a full reload.
 */
export function NewVideosNotice({ version, newestId }: { version: string | null; newestId: string | null }) {
  const marker = useMemo<CatalogMarker | null>(() => (version && newestId ? { version, newestId } : null), [version, newestId]);
  const { count, hasMore, reset, acknowledge } = useCatalogUpdates(marker);
  const router = useRouter();
  const onWatchPage = (usePathname() ?? "").startsWith("/watch/");

  if (count === 0 && !reset) return null;
  const label = reset ? "The catalog has been updated" : `${hasMore ? `${count}+` : count} new video${count === 1 && !hasMore ? "" : "s"}`;
  const show = () => {
    router.refresh();
    acknowledge();
  };

  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-text py-2 pl-5 pr-2 text-sm text-bg shadow-lg">
      {label}
      {onWatchPage ? (
        <Link href="/browse/" target="_blank" rel="noopener" onClick={acknowledge} className="grid h-9 cursor-pointer place-items-center rounded-full bg-accent px-4 font-medium text-accent-text hover:opacity-90">
          See them in a new tab
        </Link>
      ) : (
        <button type="button" onClick={show} className="h-9 cursor-pointer rounded-full bg-accent px-4 font-medium text-accent-text hover:opacity-90">
          Show
        </button>
      )}
      <button type="button" onClick={acknowledge} aria-label="Dismiss" className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-white/15">
        ×
      </button>
    </div>
  );
}
