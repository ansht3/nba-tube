import { CONTENT_TYPE_LABELS } from "@/catalog/content-types";
import type { VideoLabels as Labels } from "@/catalog/schema";

/** "Coach · Postgame" for a coach's session with a known phase, otherwise the plain type label. */
export function contentLabel(labels: Pick<Labels, "contentType" | "gamePhase">): string {
  const label = CONTENT_TYPE_LABELS[labels.contentType];
  if (labels.contentType !== "COACH_PRESS_CONFERENCE" || labels.gamePhase === null) return label;
  return `${label} · ${labels.gamePhase === "pregame" ? "Pregame" : "Postgame"}`;
}

/**
 * NBATube's own description of a video: what kind it is and which teams it is
 * tagged with. It is always a separate element from the YouTube title, which
 * is shown unchanged.
 */
export function VideoLabels({ labels, className = "" }: { labels: Labels; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}>
      <span className="text-accent">{contentLabel(labels)}</span>
      {labels.teamIds.length > 0 && <span className="tabular-nums text-muted">{labels.teamIds.join(" · ")}</span>}
    </p>
  );
}
