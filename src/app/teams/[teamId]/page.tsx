import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SECTIONS } from "@/catalog/content-types";
import { loadCatalog, loadSources } from "@/catalog/load";
import { videosForTeam, videosInSection } from "@/catalog/select";
import { TEAMS, getTeam, teamFullName } from "@/catalog/teams";
import { EmptyState } from "@/components/EmptyState";
import { ExternalIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { LIST_PAGE_SIZE, VideoList } from "@/components/VideoList";
import { pluralize } from "@/lib/format";
import { channelUrl } from "@/lib/youtube";

export const dynamicParams = false;

export function generateStaticParams() {
  return TEAMS.map((team) => ({ teamId: team.id.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps<"/teams/[teamId]">): Promise<Metadata> {
  const team = getTeam((await params).teamId.toUpperCase());
  if (!team) return { title: "Team not found" };
  return { title: teamFullName(team), description: `Official highlights and media sessions for the ${teamFullName(team)}.` };
}

export default async function TeamPage({ params }: PageProps<"/teams/[teamId]">) {
  const team = getTeam((await params).teamId.toUpperCase());
  if (!team) notFound();

  const videos = videosForTeam(loadCatalog().videos, team.id);
  const channel = loadSources().sources.find((source) => source.teamId === team.id && source.status === "approved");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/teams/" className="text-muted hover:text-text hover:underline">
          Teams
        </Link>
      </p>
      <PageHeader title={teamFullName(team)}>
        <p>
          {videos.length > 0 ? `${pluralize(videos.length, "video")}, newest first.` : "No videos in the catalog right now."}
          {channel && (
            <>
              {" "}
              <a href={channelUrl(channel.channelId)} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
                Official channel on YouTube
                <ExternalIcon className="size-3.5" />
              </a>
            </>
          )}
        </p>
      </PageHeader>

      {videos.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label={`${team.name} videos by section`}>
          {SECTIONS.map((section) => {
            const count = videosInSection(videos, section.id).length;
            if (count === 0) return null;
            return (
              <li key={section.id}>
                <Link href={`/browse/?section=${section.id}&team=${team.id}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-sm hover:bg-line">
                  {section.title}
                  <span className="tabular-nums text-muted">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {videos.length === 0 ? (
        <EmptyState title={`Nothing from the ${team.name} yet`}>
          <p>
            Their recent uploads did not include highlights or media sessions that the catalog accepts. This page fills
            in as they publish more.
          </p>
        </EmptyState>
      ) : (
        <VideoList initial={videos.slice(0, LIST_PAGE_SIZE)} total={videos.length} scope={{ teamId: team.id }} />
      )}
    </>
  );
}
