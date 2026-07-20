/**
 * Backy Pull Webhook — lets Backy service trigger backups on-demand.
 *
 * HEAD /api/backy/pull — Connection test (validates pull key, returns 200 or 401)
 * POST /api/backy/pull — Trigger a full backup push to the caller's configured Backy service
 *
 * Auth: X-Webhook-Key header → lookup user by pull key (no session required).
 */

import { jsonError, jsonOk } from "@/lib/api-helpers";
import { executePush } from "@/lib/backy-push";
import { backyRepo } from "@/lib/backy-repo";

export const dynamic = "force-dynamic";

/**
 * Extract and validate the pull key from the request.
 * Returns the userId that owns the key, or an error Response.
 */
async function authenticatePullKey(
  req: Request,
): Promise<{ userId: string; error?: never } | { userId?: never; error: Response }> {
  const key = req.headers.get("X-Webhook-Key");
  if (!key) {
    return { error: jsonError("Missing X-Webhook-Key header", 401) };
  }

  const userId = await backyRepo.findUserByPullKey(key);
  if (!userId) {
    return { error: jsonError("Invalid webhook key", 401) };
  }

  return { userId };
}

/**
 * HEAD — Connection test. Backy calls this to verify the pull key is valid.
 */
export async function HEAD(req: Request): Promise<Response> {
  const { error } = await authenticatePullKey(req);
  if (error) return error;

  // 200 with empty body — key is valid
  return new Response(null, { status: 200 });
}

/**
 * POST — Trigger a backup push. Backy calls this to initiate a pull-style backup.
 *
 * Flow:
 *   1. Validate X-Webhook-Key → find user
 *   2. Load the user's push config (webhookUrl + apiKey)
 *   3. Execute the full push flow (export → compress → upload to Backy)
 *   4. Return push result to the caller
 */
export async function POST(req: Request): Promise<Response> {
  const { userId, error } = await authenticatePullKey(req);
  if (error) return error;

  const result = await executePush(userId);

  if (!result.ok) {
    return jsonError(result.error, result.status ?? 500);
  }

  return jsonOk({
    ok: true,
    tag: result.tag,
    fileName: result.fileName,
    stats: result.stats,
    durationMs: result.durationMs,
    compressedBytes: result.compressedBytes,
  });
}
