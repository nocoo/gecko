/**
 * GET /api/backy/history — Fetch backup history from the configured Backy service.
 */

import { jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { backyRepo } from "@/lib/backy-repo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const config = await backyRepo.getPushConfig(user.userId);
  if (!config) {
    return jsonError("Backy push not configured", 422);
  }

  try {
    const res = await fetch(config.webhookUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return jsonError(`Backy responded with ${res.status}: ${text}`, 502);
    }

    const data = await res.json();
    return jsonOk(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(`Failed to fetch history: ${message}`, 502);
  }
}
