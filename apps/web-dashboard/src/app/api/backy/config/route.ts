/**
 * GET  /api/backy/config — Read backy push configuration
 * PUT  /api/backy/config — Save backy push configuration
 */

import { jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { backyRepo } from "@/lib/backy-repo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const config = await backyRepo.getPushConfig(user.userId);

  if (!config) {
    return jsonOk({ configured: false, webhookUrl: "", apiKey: "" });
  }

  // Mask API key — only show last 4 chars
  const masked =
    config.apiKey.length > 4
      ? "•".repeat(config.apiKey.length - 4) + config.apiKey.slice(-4)
      : "•".repeat(config.apiKey.length);

  return jsonOk({
    configured: true,
    webhookUrl: config.webhookUrl,
    apiKey: masked,
  });
}

export async function PUT(request: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { webhookUrl?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { webhookUrl, apiKey } = body;

  if (!webhookUrl || typeof webhookUrl !== "string") {
    return jsonError("Missing webhookUrl field", 400);
  }
  if (!apiKey || typeof apiKey !== "string") {
    return jsonError("Missing apiKey field", 400);
  }

  // Basic URL validation
  try {
    new URL(webhookUrl);
  } catch {
    return jsonError("Invalid webhookUrl — must be a valid URL", 400);
  }

  await backyRepo.savePushConfig(user.userId, webhookUrl.trim(), apiKey.trim());

  return jsonOk({ ok: true });
}
