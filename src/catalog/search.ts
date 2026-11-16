import { CONTENT_TYPE_LABELS } from "./content-types";
import type { Video } from "./schema";
import { getTeam, teamFullName } from "./teams";

/** Lower case, with accents removed, so "jokic" finds "Jokić". */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Everything a search can match for one video, normalised. Stored in the database and built once per catalog in the browser. */
export function searchTextFor(video: Video): string {
  const teams = video.labels.teamIds.map((id) => {
    const team = getTeam(id);
    return team ? `${teamFullName(team)} ${team.id}` : id;
  });
  return normalizeText([video.title, video.channelTitle, CONTENT_TYPE_LABELS[video.labels.contentType], ...teams].join(" "));
}

/** A search matches when every one of these words appears in the video's search text, in any order. */
export function searchWords(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}
