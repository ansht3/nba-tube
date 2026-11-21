import type { CatalogMeta, CatalogRepository } from "@/catalog/repository";
import { errorResponse, json, NO_STORE } from "./http";

const MINUTE_MS = 60_000;
/** The worker runs every 5 minutes: a success within this is normal, within the next limit is late, beyond it is down. */
export const WORKER_LATE_AFTER_MIN = 15;
export const WORKER_DOWN_AFTER_MIN = 60;
export const SOURCES_STALE_AFTER_MIN = 60;
export const FAILING_CHANNELS_LIMIT = 3;

/** What the database knows about ingestion. Only a database-backed repository can answer. */
export interface IngestionHealth {
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastSuccessAt: string | null;
  channelsTracked: number;
  /** Channels that have failed three or more runs in a row. */
  channelsFailing: number;
  /** When the least recently read channel last succeeded. */
  oldestSourceSuccessAt: string | null;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  /** Is the scheduled job running and succeeding? */
  worker: { state: "ok" | "late" | "down" | "unknown"; lastRunAt: string | null; lastRunStatus: string | null; lastSuccessAgeMinutes: number | null };
  /** Are the YouTube channels being read? */
  sources: { state: "ok" | "stale" | "unknown"; channelsTracked: number; channelsFailing: number; oldestSuccessAgeMinutes: number | null };
  /** What a viewer sees right now. A quiet night is old but not broken, so this only informs; it never fails the check on its own. */
  catalog: { version: string; publishedAgeMinutes: number; newestVideoAgeMinutes: number | null; total: number };
  mode: "database" | "file";
  reasons: string[];
}

const ageMin = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / MINUTE_MS)) : null);

/** Turns what was measured into a verdict, with the reasons spelled out. Worker, source and viewer-visible freshness are judged separately. */
export function evaluateHealth(meta: CatalogMeta, ingestion: IngestionHealth | null, now: number): HealthReport {
  const reasons: string[] = [];
  const catalog = { version: meta.version, publishedAgeMinutes: ageMin(meta.generatedAt, now) ?? 0, newestVideoAgeMinutes: ageMin(meta.newestPublishedAt, now), total: meta.total };
  if (!ingestion) {
    return { status: "ok", mode: "file", reasons: ["The catalog is a file built at deploy time: there is no worker to check."], worker: { state: "unknown", lastRunAt: null, lastRunStatus: null, lastSuccessAgeMinutes: null }, sources: { state: "unknown", channelsTracked: 0, channelsFailing: 0, oldestSuccessAgeMinutes: null }, catalog };
  }

  const lastSuccessAgeMinutes = ageMin(ingestion.lastSuccessAt, now);
  const workerState = lastSuccessAgeMinutes === null || lastSuccessAgeMinutes > WORKER_DOWN_AFTER_MIN ? "down" : lastSuccessAgeMinutes > WORKER_LATE_AFTER_MIN ? "late" : "ok";
  if (workerState === "down") reasons.push(lastSuccessAgeMinutes === null ? "The worker has never completed a run." : `The worker last succeeded ${lastSuccessAgeMinutes} minutes ago.`);
  if (workerState === "late") reasons.push(`The worker last succeeded ${lastSuccessAgeMinutes} minutes ago (it should run every 5).`);

  const oldestSuccessAgeMinutes = ageMin(ingestion.oldestSourceSuccessAt, now);
  const sourcesStale = ingestion.channelsFailing >= FAILING_CHANNELS_LIMIT || (oldestSuccessAgeMinutes !== null && oldestSuccessAgeMinutes > SOURCES_STALE_AFTER_MIN);
  if (ingestion.channelsFailing >= FAILING_CHANNELS_LIMIT) reasons.push(`${ingestion.channelsFailing} channels have failed several runs in a row.`);
  if (oldestSuccessAgeMinutes !== null && oldestSuccessAgeMinutes > SOURCES_STALE_AFTER_MIN) reasons.push(`The least recently read channel succeeded ${oldestSuccessAgeMinutes} minutes ago.`);

  const status = workerState === "down" ? "down" : workerState === "late" || sourcesStale ? "degraded" : "ok";
  return {
    status,
    mode: "database",
    reasons,
    worker: { state: workerState, lastRunAt: ingestion.lastRunAt, lastRunStatus: ingestion.lastRunStatus, lastSuccessAgeMinutes },
    sources: { state: sourcesStale ? "stale" : "ok", channelsTracked: ingestion.channelsTracked, channelsFailing: ingestion.channelsFailing, oldestSuccessAgeMinutes },
    catalog,
  };
}

/** Repositories that can describe ingestion expose this; the file repository does not. */
export interface HealthSource extends CatalogRepository {
  ingestionHealth?(): Promise<IngestionHealth>;
}

/** GET /api/health: 200 when ok or degraded, 503 when the worker is down. Never cached, and it carries no secrets. */
export async function handleHealth(repository: HealthSource, now: number = Date.now()): Promise<Response> {
  try {
    const report = evaluateHealth(await repository.meta(), repository.ingestionHealth ? await repository.ingestionHealth() : null, now);
    return json(report, { status: report.status === "down" ? 503 : 200, cache: NO_STORE });
  } catch (error) {
    console.error("GET /api/health failed:", error instanceof Error ? error.message : error);
    return errorResponse(503, "The catalog is unavailable.");
  }
}
