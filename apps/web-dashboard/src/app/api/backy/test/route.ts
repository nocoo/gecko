/**
 * POST /api/backy/test — Test connectivity to the configured Backy webhook.
 *
 * Sends a HEAD request to the user's configured webhook URL
 * with the stored API key to verify the service is reachable.
 */

import { jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { backyRepo } from "@/lib/backy-repo";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const config = await backyRepo.getPushConfig(user.userId);
  if (!config) {
    return jsonError("Backy push not configured — save webhook URL and API key first", 422);
  }

  try {
    const start = Date.now();
    const res = await fetch(config.webhookUrl, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;

    if (res.ok) {
      return jsonOk({ ok: true, status: res.status, durationMs });
    }
    return jsonOk({ ok: false, status: res.status, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(`Connection failed: ${message}`, 502);
  }
}
