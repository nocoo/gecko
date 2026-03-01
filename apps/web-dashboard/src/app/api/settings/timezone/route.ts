/**
 * GET  /api/settings/timezone — Read timezone for current user
 * PUT  /api/settings/timezone — Save timezone
 */

import { requireSession, jsonOk, jsonError, getUserTimezone } from "@/lib/api-helpers";
import { settingsRepo } from "@/lib/settings-repo";
import { isValidTimezone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const timezone = await getUserTimezone(user.userId);
  return jsonOk({ timezone });
}

export async function PUT(request: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { timezone?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!body.timezone || typeof body.timezone !== "string") {
    return jsonError("Missing timezone field", 400);
  }

  if (!isValidTimezone(body.timezone)) {
    return jsonError(`Invalid IANA timezone: ${body.timezone}`, 400);
  }

  await settingsRepo.upsert(user.userId, "timezone", body.timezone);

  return jsonOk({ timezone: body.timezone });
}
