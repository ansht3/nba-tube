import { z } from "zod";
import { CONTENT_TYPES, GAME_PHASES } from "./content-types";
import { TEAM_IDS } from "./teams";

export const CATALOG_SCHEMA_VERSION = 1;

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

export const PUBLISHER_TYPES = ["league", "team"] as const;
export const DISCOVERY_METHODS = ["data-api", "channel-feed", "manual"] as const;
export const VERIFICATION_STATUSES = ["verified-publisher", "manual-review"] as const;
export const CATALOG_MODES = ["seed", "feed", "api"] as const;

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "must be an ISO 8601 date-time",
});

// Thumbnails are rendered as <img src>, so only YouTube's image hosts are
// allowed. A catalog file cannot point the page at an arbitrary URL.
const thumbnailUrl = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && /^i\d?\.ytimg\.com$/.test(url.hostname);
    } catch {
      return false;
    }
  },
  { message: "must be an https URL on ytimg.com" },
);

const labelsSchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  gamePhase: z.enum(GAME_PHASES).nullable(),
  teamIds: z.array(z.enum(TEAM_IDS)),
  playerNames: z.array(z.string().min(1)),
  /** Id of the classifier rule, or "manual", that accepted the video. */
  reason: z.string().min(1),
});

const provenanceSchema = z.object({
  publisherType: z.enum(PUBLISHER_TYPES),
  discoveryMethod: z.enum(DISCOVERY_METHODS),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  metadataCheckedAt: isoDateTime,
});

export const videoSchema = z.object({
  youtubeId: z.string().regex(YOUTUBE_ID_PATTERN),

  // Provided by YouTube and shown unchanged.
  title: z.string().min(1),
  channelId: z.string().regex(CHANNEL_ID_PATTERN),
  channelTitle: z.string().min(1),
  thumbnailUrl,
  publishedAt: isoDateTime,
  /** null when the discovery method cannot know the length (the Atom feeds). */
  durationSeconds: z.number().int().positive().nullable(),
  embeddable: z.boolean().nullable(),

  // Assigned by NBATube.
  labels: labelsSchema,
  provenance: provenanceSchema,
});

export const catalogSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  mode: z.enum(CATALOG_MODES),
  generatedAt: isoDateTime,
  videos: z.array(videoSchema),
});

export type Video = z.infer<typeof videoSchema>;
export type VideoLabels = z.infer<typeof labelsSchema>;
export type VideoProvenance = z.infer<typeof provenanceSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogMode = (typeof CATALOG_MODES)[number];
export type PublisherType = (typeof PUBLISHER_TYPES)[number];
export type DiscoveryMethod = (typeof DISCOVERY_METHODS)[number];
