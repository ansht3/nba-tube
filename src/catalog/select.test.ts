import { describe, expect, it } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import type { Video } from "./schema";
import { countByTeam, findVideo, relatedVideos, videosForTeam, videosInSection } from "./select";

function video(name: string, labels: Partial<Video["labels"]>, channelId = "UCWJ2lWNubArHWmf3FIHbfcQ"): Video {
  return makeVideo({ youtubeId: testId(name), channelId, labels: { ...makeVideo().labels, ...labels } });
}

const HAWKS_CHANNEL = "UCpfcwELvR1wtcRJ0UxNXHYw";

// Listed newest first, as the catalog always is.
const lakersGame = video("lakersGame", { contentType: "GAME_HIGHLIGHTS", teamIds: ["ATL", "LAL"] });
const hawksPresser = video("hawksTalk", { contentType: "POSTGAME_INTERVIEW", gamePhase: "postgame", teamIds: ["ATL"] }, HAWKS_CHANNEL);
const hawksCoach = video("hawksCoach", { contentType: "COACH_PRESS_CONFERENCE", gamePhase: "postgame", teamIds: ["ATL"] }, HAWKS_CHANNEL);
const celticsGame = video("celticsGame", { contentType: "GAME_HIGHLIGHTS", teamIds: ["BOS", "PHI"] });
const topPlays = video("topPlays", { contentType: "TOP_PLAYS", teamIds: [] });
const sunsShootaround = video("sunsShoot", { contentType: "PREGAME_INTERVIEW", gamePhase: "pregame", teamIds: ["PHX"] }, "UCLxlWVVHz2a8SdCfxzVXzQw");
const all = [lakersGame, hawksPresser, hawksCoach, celticsGame, topPlays, sunsShootaround];

describe("catalog selectors", () => {
  it("lists a section's videos in catalog order", () => {
    expect(videosInSection(all, "highlights")).toEqual([lakersGame, celticsGame, topPlays]);
    expect(videosInSection(all, "postgame")).toEqual([hawksPresser, hawksCoach]);
    expect(videosInSection(all, "pregame")).toEqual([sunsShootaround]);
    expect(videosInSection(all, "interviews")).toEqual([]);
  });

  it("lists a team's videos, including games it played on the league channel", () => {
    expect(videosForTeam(all, "ATL")).toEqual([lakersGame, hawksPresser, hawksCoach]);
    expect(videosForTeam(all, "LAL")).toEqual([lakersGame]);
    expect(videosForTeam(all, "DEN")).toEqual([]);
  });

  it("finds a video by id", () => {
    expect(findVideo(all, celticsGame.youtubeId)).toBe(celticsGame);
    expect(findVideo(all, "missing_id_")).toBeUndefined();
  });

  it("counts videos per team", () => {
    const counts = countByTeam(all);
    expect(counts.get("ATL")).toBe(3);
    expect(counts.get("BOS")).toBe(1);
    expect(counts.has("DEN")).toBe(false);
  });
});

describe("relatedVideos", () => {
  it("never includes the video itself", () => {
    expect(relatedVideos(lakersGame, all, 10)).not.toContain(lakersGame);
  });

  it("puts videos that share a team first, then the same kind of video", () => {
    const related = relatedVideos(hawksPresser, all, 10);
    // Same team, same section and same channel beats same team alone.
    expect(related.slice(0, 2)).toEqual([hawksCoach, lakersGame]);
  });

  it("falls back to the same kind of video when no team is shared", () => {
    expect(relatedVideos(celticsGame, all, 2)).toEqual([lakersGame, topPlays]);
  });

  it("leaves out videos with nothing in common", () => {
    const related = relatedVideos(sunsShootaround, all, 10);
    expect(related).toEqual([]);
  });

  it("gives the same answer every time and respects the limit", () => {
    expect(relatedVideos(lakersGame, all, 2)).toEqual(relatedVideos(lakersGame, all, 2));
    expect(relatedVideos(lakersGame, all, 2)).toHaveLength(2);
  });

  it("keeps newer videos first among equally related ones", () => {
    const older = video("olderGame", { contentType: "GAME_HIGHLIGHTS", teamIds: ["DEN", "UTA"] });
    const related = relatedVideos(celticsGame, [lakersGame, celticsGame, older], 10);
    expect(related).toEqual([lakersGame, older]);
  });
});
