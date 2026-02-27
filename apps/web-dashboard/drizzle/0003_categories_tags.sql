-- Migration 0003: Add categories, tags, and app mappings.
--
-- Categories: user-scoped, with title/icon/is_default.
--   Color is computed via stable hash at display time (not stored).
-- Tags: user-scoped, with name. Color also via stable hash.
-- Mappings: bundle_id -> category (1:1), bundle_id -> tag (1:N).

-- ============================================================
-- Categories
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'folder',   -- lucide icon name
  is_default INTEGER NOT NULL DEFAULT 0,       -- 1 = system default, not editable
  slug       TEXT NOT NULL,                     -- e.g. 'system-core', 'browser'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_slug
  ON categories (user_id, slug);

-- ============================================================
-- App -> Category mapping (1 app : 1 category per user)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_category_mappings (
  user_id    TEXT NOT NULL,
  bundle_id  TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id)
);

CREATE INDEX IF NOT EXISTS idx_acm_category
  ON app_category_mappings (category_id);

-- ============================================================
-- Tags
-- ============================================================

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_name
  ON tags (user_id, name);

-- ============================================================
-- App -> Tag mapping (1 app : N tags per user)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_tag_mappings (
  user_id    TEXT NOT NULL,
  bundle_id  TEXT NOT NULL,
  tag_id     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_atm_tag
  ON app_tag_mappings (tag_id);
