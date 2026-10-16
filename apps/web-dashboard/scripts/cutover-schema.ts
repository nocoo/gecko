export const USER_ID_TABLES = [
  "focus_sessions",
  "api_keys",
  "sync_logs",
  "categories",
  "app_category_mappings",
  "tags",
  "app_tag_mappings",
  "settings",
  "daily_summaries",
  "app_notes",
] as const;

export type UserIdTable = (typeof USER_ID_TABLES)[number];

export const HISTORICAL_MIGRATIONS = [
  "0001_cloud_init.sql",
  "0002_slim_columns.sql",
  "0003_categories_tags.sql",
  "0004_settings.sql",
  "0005_daily_summaries.sql",
  "0006_app_notes.sql",
  "0007_drop_stats_json.sql",
  "0008_add_ai_prompt.sql",
] as const;

export const FORWARD_MIGRATION = "0009_add_analysis_claim.sql";

export const DESTRUCTIVE_MIGRATIONS = new Set([
  "0002_slim_columns.sql",
  "0007_drop_stats_json.sql",
]);

export type UniqueSpec = { columns: string[] };

export const TABLE_UNIQUES: Record<UserIdTable, UniqueSpec[]> = {
  focus_sessions: [{ columns: ["id"] }],
  api_keys: [{ columns: ["id"] }, { columns: ["key_hash"] }, { columns: ["device_id"] }],
  sync_logs: [{ columns: ["id"] }],
  categories: [{ columns: ["id"] }, { columns: ["user_id", "slug"] }],
  app_category_mappings: [{ columns: ["user_id", "bundle_id"] }],
  tags: [{ columns: ["id"] }, { columns: ["user_id", "name"] }],
  app_tag_mappings: [{ columns: ["user_id", "bundle_id", "tag_id"] }],
  settings: [{ columns: ["user_id", "key"] }],
  daily_summaries: [{ columns: ["id"] }, { columns: ["user_id", "date"] }],
  app_notes: [{ columns: ["user_id", "bundle_id"] }],
};

export function isUserIdTable(name: string): name is UserIdTable {
  return (USER_ID_TABLES as readonly string[]).includes(name);
}
