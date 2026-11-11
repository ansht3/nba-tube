import { z } from "zod";
import { CONTENT_TYPES } from "./content-types";
import { CHANNEL_ID_PATTERN, PUBLISHER_TYPES } from "./schema";
import { TEAM_IDS } from "./teams";

export const SOURCE_STATUSES = ["approved", "candidate", "suspended"] as const;

/**
 * How a channel was confirmed to belong to the publisher it claims to be.
 * See docs/RESEARCH.md, section 4.
 */
export const VERIFICATION_METHODS = [
  // The publisher's own website links to this channel.
  "official-site-link",
  // No link could be fetched: YouTube's verification badge, audience size and
  // current uploads were checked together instead.
  "youtube-badge-and-activity",
] as const;

const sourceSchema = z.object({
  channelId: z.string().regex(CHANNEL_ID_PATTERN),
  /** The channel's name on YouTube, copied exactly. */
  name: z.string().min(1),
  handle: z.string().regex(/^@[\w.-]+$/),
  publisherType: z.enum(PUBLISHER_TYPES),
  status: z.enum(SOURCE_STATUSES),
  teamId: z.enum(TEAM_IDS).nullable(),
  allowedContentTypes: z.array(z.enum(CONTENT_TYPES)).min(1),
  verification: z.object({
    method: z.enum(VERIFICATION_METHODS),
    /** The page that links to the channel, or the channel URL itself. */
    evidence: z.url(),
    verifiedAt: z.iso.date(),
  }),
});

export const sourceRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    sources: z.array(sourceSchema),
  })
  .superRefine((registry, context) => {
    const seen = new Set<string>();
    registry.sources.forEach((source, index) => {
      if (seen.has(source.channelId)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "channelId"],
          message: `duplicate channel ${source.channelId}`,
        });
      }
      seen.add(source.channelId);

      // A team channel without a team could never be filtered by team, and a
      // league channel tied to one team would mislabel every video.
      const needsTeam = source.publisherType === "team";
      if (needsTeam !== (source.teamId !== null)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "teamId"],
          message: needsTeam ? "a team channel needs a teamId" : "a league channel must not have a teamId",
        });
      }
    });
  });

export type Source = z.infer<typeof sourceSchema>;
export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;

export function parseSourceRegistry(input: unknown): SourceRegistry {
  return sourceRegistrySchema.parse(input);
}

/** Only approved channels are ever ingested. */
export function approvedSources(registry: SourceRegistry): Source[] {
  return registry.sources.filter((source) => source.status === "approved");
}
