/**
 * POST /api/backy/push — Execute a backup push to the configured Backy service.
 *
 * Collects all user data, gzip-compresses it, and uploads via multipart/form-data.
 */

import { jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { executePush } from "@/lib/backy-push";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const result = await executePush(user.userId);

  if (!result.ok) {
    return jsonError(result.error, result.status ?? 500);
  }

  return jsonOk(result);
}
