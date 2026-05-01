/**
 * Email notification service — sends analysis results via Dove relay.
 *
 * Design principles:
 *   - Never throws: outer try/catch guarantees transparency to callers
 *   - Env-var gated: missing DOVE_WEBHOOK_URL silently skips
 *   - User-level opt-in: checks notification.email.enabled + address
 *   - Idempotent: sends gecko-analysis-{userId}-{date} as idempotency key
 *   - Fire-and-forget safe: callers don't need to await
 */

import { settingsRepo } from "@/lib/settings-repo";
import { fmtDuration, type AiAnalysisResult } from "@/services/analyze-core";
import type { DailyStats } from "@/services/daily-stats";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendAnalysisEmailParams {
  userId: string;
  date: string;
  result: AiAnalysisResult;
  stats: DailyStats;
  dashboardBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// Formatters (exported for testing)
// ---------------------------------------------------------------------------

/** Format highlights array → Markdown bullet list. */
export function formatHighlights(highlights: string[]): string {
  return highlights.map((h) => `- ${h}`).join("\n");
}

/** Format improvements array → Markdown bullet list. */
export function formatImprovements(improvements: string[]): string {
  return improvements.map((i) => `- ${i}`).join("\n");
}

/** Format timeSegments → Markdown table rows (no header). */
export function formatTimeSegments(
  segments: { timeRange: string; label: string; description: string }[],
): string {
  return segments
    .map((seg) => `| ${seg.timeRange} | ${seg.label} | ${seg.description} |`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Send analysis results via Dove email relay.
 * Silently skips when env vars or user settings are not configured.
 * Never throws — safe to fire-and-forget.
 */
export async function sendAnalysisEmail(
  params: SendAnalysisEmailParams,
): Promise<void> {
  try {
    // 1. Check env vars
    const webhookUrl = process.env.DOVE_WEBHOOK_URL;
    const webhookToken = process.env.DOVE_WEBHOOK_TOKEN;
    if (!webhookUrl || !webhookToken) {
      return; // silently skip — Dove not configured
    }

    // 2. Check user settings
    const [enabledSetting, addressSetting] = await Promise.all([
      settingsRepo.findByKey(params.userId, "notification.email.enabled"),
      settingsRepo.findByKey(params.userId, "notification.email.address"),
    ]);

    const enabled = enabledSetting?.value === "true";
    const address = addressSetting?.value?.trim();
    if (!enabled || !address) {
      return; // user hasn't opted in or no address
    }

    // 3. Build template variables
    const templateSlug = process.env.DOVE_TEMPLATE_SLUG || "daily-analysis";
    const dashboardBaseUrl =
      params.dashboardBaseUrl ||
      process.env.NEXTAUTH_URL ||
      "https://gecko.hexly.ai";
    const dashboardUrl = `${dashboardBaseUrl}/daily/${params.date}`;

    const variables: Record<string, string> = {
      date: params.date,
      score: String(params.result.score),
      total_duration: fmtDuration(params.stats.totalDuration),
      total_apps: String(params.stats.totalApps),
      highlights: formatHighlights(params.result.highlights),
      improvements: formatImprovements(params.result.improvements),
      time_segments: formatTimeSegments(params.result.timeSegments),
      summary: params.result.summary,
      dashboard_url: dashboardUrl,
    };

    // 4. POST to Dove webhook
    const idempotencyKey = `gecko-analysis-${params.userId}-${params.date}`;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookToken}`,
      },
      body: JSON.stringify({
        to: address,
        template: templateSlug,
        variables,
        idempotency_key: idempotencyKey,
      }),
    });

    if (!response.ok) {
      // response.text() doesn't reject in practice for fetch Responses;
      // the `.catch` is defense-in-depth only.
      /* v8 ignore next */
      const body = await response.text().catch(() => "(unreadable)");
      console.error(
        `[email-notification] Dove returned ${response.status}: ${body}`,
      );
    } else {
      console.log(
        `[email-notification] Email sent for user ${params.userId} date ${params.date}`,
      );
    }
  } catch (err) {
    // Never throw — email is a best-effort side effect
    console.error(
      "[email-notification] Unexpected error:",
      err instanceof Error ? err.message : err,
    );
  }
}
