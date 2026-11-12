import type { Metadata } from "next";
import Link from "next/link";
import { loadCatalog } from "@/catalog/load";
import { countByTeam } from "@/catalog/select";
import { TEAMS, teamFullName, type Conference } from "@/catalog/teams";
import { PageHeader } from "@/components/PageHeader";
import { pluralize } from "@/lib/format";
import { teamPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Teams", description: "Browse official videos by NBA team." };

const CONFERENCES: { id: Conference; title: string }[] = [
  { id: "East", title: "Eastern Conference" },
  { id: "West", title: "Western Conference" },
];

export default function TeamsPage() {
  const counts = countByTeam(loadCatalog().videos);

  return (
    <>
      <PageHeader title="Teams">
        <p>
          A video is listed under a team when that team&apos;s official channel published it, or when the league
          channel&apos;s game recap names the team in its matchup.
        </p>
      </PageHeader>
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {CONFERENCES.map((conference) => (
          <section key={conference.id} aria-labelledby={`conference-${conference.id}`}>
            <h2 id={`conference-${conference.id}`} className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted">
              {conference.title}
            </h2>
            <ul className="divide-y divide-line border-y border-line">
              {TEAMS.filter((team) => team.conference === conference.id).map((team) => {
                const count = counts.get(team.id) ?? 0;
                return (
                  <li key={team.id}>
                    <Link href={teamPath(team.id)} className="flex min-h-12 items-center gap-3 px-1 hover:bg-surface-2">
                      <span className="w-10 text-xs font-semibold tabular-nums tracking-wider text-accent">{team.id}</span>
                      <span className="flex-1 font-medium">{teamFullName(team)}</span>
                      <span className="text-sm tabular-nums text-muted">{count === 0 ? "No videos" : pluralize(count, "video")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
