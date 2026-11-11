import { z } from "zod";
import { CONTENT_TYPES, GAME_PHASES } from "@/catalog/content-types";
import { YOUTUBE_ID_PATTERN } from "@/catalog/schema";
import { TEAM_IDS } from "@/catalog/teams";

const youtubeId = z.string().regex(YOUTUBE_ID_PATTERN);

/**
 * Manual corrections, kept in data/overrides.json. They fix individual videos
 * the rules get wrong without anyone touching the rules. An inclusion still
 * requires the video to come from an approved channel.
 */
export const overridesSchema = z.object({
  schemaVersion: z.literal(1),
  include: z.array(
    z.object({
      youtubeId,
      contentType: z.enum(CONTENT_TYPES),
      gamePhase: z.enum(GAME_PHASES).nullable(),
      teamIds: z.array(z.enum(TEAM_IDS)).optional(),
      /** Why a person decided this video belongs. */
      note: z.string().min(1),
    }),
  ),
  exclude: z.array(z.object({ youtubeId, note: z.string().min(1) })),
});

export type Overrides = z.infer<typeof overridesSchema>;
export type ManualInclusion = Overrides["include"][number];

export const NO_OVERRIDES: Overrides = { schemaVersion: 1, include: [], exclude: [] };

export function parseOverrides(input: unknown): Overrides {
  const overrides = overridesSchema.parse(input);
  const excluded = new Set(overrides.exclude.map((entry) => entry.youtubeId));
  const conflict = overrides.include.find((entry) => excluded.has(entry.youtubeId));
  if (conflict) throw new Error(`Video ${conflict.youtubeId} is both included and excluded in the overrides`);
  return overrides;
}
