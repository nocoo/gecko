/**
 * Backy push execution — the core push-to-backy workflow.
 *
 * Shared by both the dashboard push API and the pull webhook handler.
 * Collects user data, compresses, and uploads to the configured Backy service.
 */

import {
  type BackupStats,
  buildBackupTag,
  buildFileName,
  compressEnvelope,
  envelopeStats,
  todayUTC,
} from "@/lib/backy";
import { exportUserData } from "@/lib/backy-export";
import { type BackyPushConfig, backyRepo } from "@/lib/backy-repo";
import { APP_VERSION } from "@/lib/version";

export interface PushResult {
  ok: true;
  durationMs: number;
  tag: string;
  fileName: string;
  stats: BackupStats;
  compressedBytes: number;
}

export interface PushError {
  ok: false;
  error: string;
  status?: number;
}

/**
 * Execute a full backup push to the user's configured Backy service.
 *
 * Steps:
 *   1. Load push config (webhookUrl + apiKey)
 *   2. Export all user data into a BackupEnvelope
 *   3. Gzip compress
 *   4. Upload as multipart/form-data to Backy
 *
 * Returns a PushResult on success or PushError on failure.
 */
export async function executePush(
  userId: string,
  config?: BackyPushConfig,
): Promise<PushResult | PushError> {
  const start = Date.now();

  // 1. Load config if not provided
  const pushConfig = config ?? (await backyRepo.getPushConfig(userId));
  if (!pushConfig) {
    return { ok: false, error: "Backy push not configured", status: 422 };
  }

  // 2. Export user data
  const envelope = await exportUserData(userId);
  const stats = envelopeStats(envelope);

  // 3. Compress
  const date = todayUTC();
  const compressed = compressEnvelope(envelope);
  const fileName = buildFileName(date);
  const tag = buildBackupTag(APP_VERSION, date, stats);

  // 4. Upload via multipart/form-data
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([compressed as BlobPart], { type: "application/gzip" }),
    fileName,
  );
  // Backy expects: dev | prod | staging | test
  const envMap: Record<string, string> = {
    production: "prod",
    development: "dev",
    test: "test",
  };
  const env = envMap[process.env.NODE_ENV ?? "development"] ?? "dev";
  formData.append("environment", env);
  formData.append("tag", tag);

  try {
    const res = await fetch(pushConfig.webhookUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${pushConfig.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(120_000), // 2 min timeout for large backups
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return {
        ok: false,
        error: `Backy responded with ${res.status}: ${text}`,
        status: 502,
      };
    }

    return {
      ok: true,
      durationMs: Date.now() - start,
      tag,
      fileName,
      stats,
      compressedBytes: compressed.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Push failed: ${message}`, status: 502 };
  }
}
