import Link from "next/link";
import type { SectionId } from "@/catalog/content-types";
import type { VideoFilter } from "@/catalog/repository";
import { getCatalogRepository } from "@/catalog/server";
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
  filter: VideoFilter;
  seeAll: string;
}

// Full-game recaps lead: they are what most people come for the morning after
// a game. Postgame sessions follow, then the rest.
const SHELVES: Shelf[] = [
  { id: "games", title: "Latest game highlights", section: "highlights", size: 6, filter: { contentTypes: ["GAME_HIGHLIGHTS"] }, seeAll: "/browse/?type=GAME_HIGHLIGHTS" },
  { id: "postgame", title: "Postgame", section: "postgame", size: 6, filter: { section: "postgame" }, seeAll: "/postgame/" },
  { id: "players", title: "Player highlights and top plays", section: "highlights", size: 6, filter: { contentTypes: ["PLAYER_HIGHLIGHTS", "TOP_PLAYS"] }, seeAll: "/browse/?section=highlights" },
  { id: "pregame", title: "Pregame", section: "pregame", size: 3, filter: { section: "pregame" }, seeAll: "/pregame/" },
  { id: "interviews", title: "Interviews", section: "interviews", size: 3, filter: { section: "interviews" }, seeAll: "/interviews/" },
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

export default async function HomePage() {
  const repository = getCatalogRepository();
  const [{ total }, shelves] = await Promise.all([
    repository.meta(),
    Promise.all(SHELVES.map(async (shelf) => ({ shelf, page: await repository.list({ ...shelf.filter, limit: shelf.size }) }))),
  ]);

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

      {total === 0 && (
        <EmptyState title="The catalog is empty">
          <p>
            Run <code>npm run sync</code> to fetch the latest official videos.
          </p>
        </EmptyState>
      )}

      <FavoriteTeamsShelf />

      {shelves.map(({ shelf, page }) => {
        if (page.total === 0) return null;

        return (
          <section key={shelf.id} data-shelf={shelf.section} aria-labelledby={`shelf-${shelf.id}`} className="mb-10">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 id={`shelf-${shelf.id}`} className="text-lg font-bold tracking-tight">
                {shelf.title}
              </h2>
              <Link href={shelf.seeAll} className="flex shrink-0 items-center gap-0.5 text-sm text-muted hover:text-text hover:underline">
                See all {page.total.toLocaleString("en-US")}
                <ChevronRightIcon className="size-4" />
              </Link>
            </div>
            <VideoGrid videos={page.videos} />
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
