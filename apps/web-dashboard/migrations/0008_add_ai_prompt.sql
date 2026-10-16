-- Migration 0008: Add ai_prompt column to daily_summaries
-- Run with: npx wrangler d1 execute gecko --remote --file=drizzle/0008_add_ai_prompt.sql
--
-- Stores the full prompt sent to the AI provider, so users can inspect
-- exactly what data was fed to the model. Displayed as a collapsible card
-- in the Daily Review UI.

ALTER TABLE daily_summaries ADD COLUMN ai_prompt TEXT;
