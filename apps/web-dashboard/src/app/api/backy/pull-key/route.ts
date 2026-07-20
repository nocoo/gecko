/**
 * Pull key management — dashboard endpoints for managing the Backy pull webhook key.
 *
 * GET    /api/backy/pull-key — Check if a pull key exists (returns masked key or null)
 * POST   /api/backy/pull-key — Generate a new pull key (returns full key once)
 * DELETE /api/backy/pull-key — Revoke the pull key
 */

import { jsonOk, requireSession } from "@/lib/api-helpers";
import { backyRepo } from "@/lib/backy-repo";

export const dynamic = "force-dynamic";

/**
 * GET — Check whether a pull key exists.
 * Returns the key prefix + masked remainder so the user can identify it
 * without exposing the full secret.
 */
export async function GET(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const key = await backyRepo.getPullKey(user.userId);
  if (!key) {
    return jsonOk({ exists: false, maskedKey: null });
  }

  // Show prefix + last 8 chars: "bpk_••••••••abcdef12"
  const masked =
    key.length > 12
      ? key.slice(0, 4) + "•".repeat(key.length - 12) + key.slice(-8)
      : "•".repeat(key.length);

  return jsonOk({ exists: true, maskedKey: masked });
}

/**
 * POST — Generate a new pull key. If one already exists, it is replaced.
 * Returns the full key exactly once — it cannot be retrieved again.
 */
export async function POST(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const key = backyRepo.generatePullKey();
  await backyRepo.savePullKey(user.userId, key);

  return jsonOk({ key });
}

/**
 * DELETE — Revoke the pull key. Backy will no longer be able to trigger pulls.
 */
export async function DELETE(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const existed = await backyRepo.deletePullKey(user.userId);

  return jsonOk({ revoked: existed });
}
