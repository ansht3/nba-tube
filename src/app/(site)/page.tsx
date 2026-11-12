import Link from "next/link";
import type { ContentType, SectionId } from "@/catalog/content-types";
import { loadCatalog } from "@/catalog/load";
import { videosInSection } from "@/catalog/select";
import type { Video } from "@/catalog/schema";
import { EmptyState } from "@/components/EmptyState";
import { FavoriteTeamsShelf } from "@/components/FavoriteTeamsShelf";
import { ChevronRightIcon } from "@/components/icons";
import { VideoGrid } from "@/components/VideoCard";
import { SITE_NAME } from "@/lib/site";

interface Shelf {
  id: string;
  title: string;
  /** The Settings section this shelf belongs to, so hiding a section hides its shelves. */
  section: SectionId;
  size: number;
  select: (videos: Video[]) => Video[];
  seeAll: string;
}

const ofType = (types: ContentType[]) => (videos: Video[]) => videos.filter((video) => types.includes(video.labels.contentType));

// Full-game recaps lead: they are what most people come for the morning after
// a game. Postgame sessions follow, then the rest.
const SHELVES: Shelf[] = [
  { id: "games", title: "Latest game highlights", section: "highlights", size: 6, select: ofType(["GAME_HIGHLIGHTS"]), seeAll: "/browse/?type=GAME_HIGHLIGHTS" },
  { id: "postgame", title: "Postgame", section: "postgame", size: 6, select: (videos) => videosInSection(videos, "postgame"), seeAll: "/postgame/" },
  { id: "players", title: "Player highlights and top plays", section: "highlights", size: 6, select: ofType(["PLAYER_HIGHLIGHTS", "TOP_PLAYS"]), seeAll: "/browse/?section=highlights" },
  { id: "pregame", title: "Pregame", section: "pregame", size: 3, select: (videos) => videosInSection(videos, "pregame"), seeAll: "/pregame/" },
  { id: "interviews", title: "Interviews", section: "interviews", size: 3, select: (videos) => videosInSection(videos, "interviews"), seeAll: "/interviews/" },
];

const QUICK_LINKS = [
  { label: "Best first", href: "/browse/?sort=best" },
  { label: "Last 24 hours", href: "/browse/?date=day" },
  { label: "Game highlights", href: "/browse/?type=GAME_HIGHLIGHTS" },
  { label: "Postgame", href: "/postgame/" },
  { label: "Coaches", href: "/browse/?type=COACH_PRESS_CONFERENCE" },
  { label: "Pregame", href: "/pregame/" },
  { label: "Teams", href: "/teams/" },
];

export default function HomePage() {
  const { videos } = loadCatalog();

  return (
    <>
      <h1 className="sr-only">{SITE_NAME}: official NBA videos</h1>

      <nav aria-label="Quick filters" className="-mx-4 mb-6 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <ul className="flex w-max gap-3">
          <li>
            <Link href="/" aria-current="page" className="chip">
              All
            </Link>
          </li>
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="chip">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {videos.length === 0 && (
        <EmptyState title="The catalog is empty">
          <p>
            Run <code>npm run sync</code> to fetch the latest official videos.
          </p>
        </EmptyState>
      )}

      <FavoriteTeamsShelf />

      {SHELVES.map((shelf) => {
        const all = shelf.select(videos);
        if (all.length === 0) return null;

        return (
          <section key={shelf.id} data-shelf={shelf.section} aria-labelledby={`shelf-${shelf.id}`} className="mb-10">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 id={`shelf-${shelf.id}`} className="text-lg font-bold tracking-tight">
                {shelf.title}
              </h2>
              <Link href={shelf.seeAll} className="flex shrink-0 items-center gap-0.5 text-sm text-muted hover:text-text hover:underline">
                See all {all.length.toLocaleString("en-US")}
                <ChevronRightIcon className="size-4" />
              </Link>
            </div>
            <VideoGrid videos={all.slice(0, shelf.size)} />
          </section>
        );
      })}

      <p className="max-w-2xl text-sm text-muted">
        Official videos from the NBA and all 30 team channels. No recommendations and no comments.{" "}
        <Link href="/about/" className="link">
          How videos are chosen
        </Link>
      </p>
    </>
  );
}
