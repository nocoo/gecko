/**
 * Backy integration — types and pure utility functions.
 *
 * This module is side-effect free: no I/O, no DB access, no fetch.
 * It defines the BackupEnvelope schema and helpers for tag formatting,
 * file naming, and gzip compression.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { APP_VERSION } from "@/lib/version";

// ---------------------------------------------------------------------------
// Envelope row types (mirror D1 column names, snake_case)
// ---------------------------------------------------------------------------

export interface BkFocusSession {
  id: string;
  user_id: string;
  device_id: string;
  app_name: string;
  window_title: string;
  url: string | null;
  start_time: number;
  end_time: number | null;
  duration: number;
  bundle_id: string | null;
  tab_title: string | null;
  tab_count: number | null;
  document_path: string | null;
  is_full_screen: number | null;
  is_minimized: number | null;
  synced_at: string | null;
}

export interface BkCategory {
  id: string;
  user_id: string;
  title: string;
  icon: string;
  is_default: number;
  slug: string;
  created_at: string;
}

export interface BkAppCategoryMapping {
  user_id: string;
  bundle_id: string;
  category_id: string;
  created_at: string;
}

export interface BkTag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface BkAppTagMapping {
  user_id: string;
  bundle_id: string;
  tag_id: string;
  created_at: string;
}

export interface BkAppNote {
  user_id: string;
  bundle_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface BkDailySummary {
  id: string;
  user_id: string;
  date: string;
  ai_score: number | null;
  ai_result_json: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BkSetting {
  user_id: string;
  key: string;
  value: string;
  updated_at: number;
}

export interface BkApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  device_id: string;
  created_at: string;
  last_used: string | null;
}

export interface BkSyncLog {
  id: string;
  user_id: string;
  device_id: string;
  session_count: number;
  first_start: number;
  last_start: number;
  synced_at: string | null;
}

// ---------------------------------------------------------------------------
// BackupEnvelope
// ---------------------------------------------------------------------------

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupEnvelope {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string; // ISO 8601
  userId: string;
  focusSessions: BkFocusSession[];
  categories: BkCategory[];
  appCategoryMappings: BkAppCategoryMapping[];
  tags: BkTag[];
  appTagMappings: BkAppTagMapping[];
  appNotes: BkAppNote[];
  dailySummaries: BkDailySummary[];
  settings: BkSetting[];
  apiKeys: BkApiKey[];
  syncLogs: BkSyncLog[];
}

export interface BackupStats {
  sessions: number;
  categories: number;
  tags: number;
  appNotes: number;
  dailySummaries: number;
  settings: number;
  apiKeys: number;
  syncLogs: number;
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/** Extract counts from a BackupEnvelope. */
export function envelopeStats(env: BackupEnvelope): BackupStats {
  return {
    sessions: env.focusSessions.length,
    categories: env.categories.length,
    tags: env.tags.length,
    appNotes: env.appNotes.length,
    dailySummaries: env.dailySummaries.length,
    settings: env.settings.length,
    apiKeys: env.apiKeys.length,
    syncLogs: env.syncLogs.length,
  };
}

/**
 * Build the backup tag string.
 * Format: v{version}-{YYYY-MM-DD}-{N}sess-{N}cat-{N}tag
 * Example: v1.1.2-2026-03-02-60000sess-4cat-5tag
 */
export function buildBackupTag(version: string, date: string, stats: BackupStats): string {
  return `v${version}-${date}-${stats.sessions}sess-${stats.categories}cat-${stats.tags}tag`;
}

/**
 * Build the backup file name.
 * Format: gecko-backup-{YYYY-MM-DD}.json.gz
 */
export function buildFileName(date: string): string {
  return `gecko-backup-${date}.json.gz`;
}

/** Format today as YYYY-MM-DD (UTC). */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build a complete BackupEnvelope tag using current app version and today's date.
 */
export function buildTagFromEnvelope(env: BackupEnvelope): string {
  return buildBackupTag(APP_VERSION, todayUTC(), envelopeStats(env));
}

/**
 * Gzip-compress a BackupEnvelope to a Buffer.
 * Uses synchronous zlib — fine for server-side usage.
 */
export function compressEnvelope(envelope: BackupEnvelope): Buffer {
  const json = JSON.stringify(envelope);
  return gzipSync(Buffer.from(json, "utf-8"));
}

/**
 * Decompress a gzipped BackupEnvelope buffer back to an object.
 * Useful for validation and testing.
 */
export function decompressEnvelope(buf: Buffer): BackupEnvelope {
  const json = gunzipSync(buf).toString("utf-8");
  return JSON.parse(json) as BackupEnvelope;
}

/** Settings keys that belong to backy itself — excluded from backup. */
export const BACKY_SETTING_KEYS = ["backy.webhookUrl", "backy.apiKey", "backy.pullKey"] as const;

/** Check if a settings key is a backy-internal key (excluded from backup). */
export function isBackySettingKey(key: string): boolean {
  return (BACKY_SETTING_KEYS as readonly string[]).includes(key);
}
