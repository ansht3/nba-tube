import Link from "next/link";
import { SECTIONS } from "@/catalog/content-types";
import { loadCatalog } from "@/catalog/load";
import { videosInSection } from "@/catalog/select";
import { EmptyState } from "@/components/EmptyState";
import { FavoriteTeamsShelf } from "@/components/FavoriteTeamsShelf";
import { ChevronRightIcon } from "@/components/icons";
import { VideoGrid } from "@/components/VideoCard";
import { SITE_NAME } from "@/lib/site";

/** How many of the newest videos each shelf shows before "See all". */
const SHELF_SIZES = { highlights: 8, postgame: 8, pregame: 4, interviews: 4 } as const;

// Postgame comes right after highlights on Home: those two are what most
// people open the site for the morning after a game.
const SHELF_ORDER = ["highlights", "postgame", "pregame", "interviews"] as const;

export default function HomePage() {
  const { videos } = loadCatalog();

  return (
    <>
      <h1 className="sr-only">{SITE_NAME}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Official videos from the NBA and all 30 team channels, newest first. No recommendations and no comments.{" "}
        <Link href="/about/" className="link">
          How videos are chosen
        </Link>
      </p>

      {videos.length === 0 && (
        <EmptyState title="The catalog is empty">
          <p>
            Run <code>npm run sync</code> to fetch the latest official videos.
          </p>
        </EmptyState>
      )}

      <FavoriteTeamsShelf />

      {SHELF_ORDER.map((id) => {
        const section = SECTIONS.find((candidate) => candidate.id === id)!;
        const all = videosInSection(videos, id);
        if (all.length === 0) return null;

        return (
          <section key={id} data-shelf={id} aria-labelledby={`shelf-${id}`} className="mb-10">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 id={`shelf-${id}`} className="text-lg font-bold tracking-tight">
                {section.title}
              </h2>
              <Link href={section.path + "/"} className="flex shrink-0 items-center gap-0.5 text-sm text-muted hover:text-text hover:underline">
                See all {all.length.toLocaleString("en-US")}
                <ChevronRightIcon className="size-4" />
              </Link>
            </div>
            <VideoGrid videos={all.slice(0, SHELF_SIZES[id])} />
          </section>
        );
      })}
    </>
  );
}
