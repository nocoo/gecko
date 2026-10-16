import { requireSession } from "@/lib/api-helpers";
import { settingsRepo } from "@/lib/settings-repo";

// Setting keys
const KEY_AUTO_SUMMARIZE = "ai.autoSummarize";
const KEY_EMAIL_ENABLED = "notification.email.enabled";
const KEY_EMAIL_ADDRESS = "notification.email.address";

/**
 * GET /api/settings/notifications
 * Returns notification settings for the current user.
 */
export async function GET(req: Request) {
  const { user, error } = await requireSession(req);
  if (error) return error;
  const userId = user.userId;

  const [autoSummarize, emailEnabled, emailAddress] = await Promise.all([
    settingsRepo.findByKey(userId, KEY_AUTO_SUMMARIZE),
    settingsRepo.findByKey(userId, KEY_EMAIL_ENABLED),
    settingsRepo.findByKey(userId, KEY_EMAIL_ADDRESS),
  ]);

  return Response.json({
    autoSummarize: autoSummarize?.value === "true",
    emailEnabled: emailEnabled?.value === "true",
    emailAddress: emailAddress?.value ?? "",
  });
}

/**
 * PUT /api/settings/notifications
 * Updates notification settings for the current user.
 */
export async function PUT(req: Request) {
  const { user, error } = await requireSession(req);
  if (error) return error;
  const userId = user.userId;
  const body = (await req.json()) as {
    autoSummarize?: unknown;
    emailEnabled?: unknown;
    emailAddress?: unknown;
  };

  if (typeof body.autoSummarize === "boolean") {
    await settingsRepo.upsert(userId, KEY_AUTO_SUMMARIZE, String(body.autoSummarize));
  }

  if (typeof body.emailEnabled === "boolean") {
    await settingsRepo.upsert(userId, KEY_EMAIL_ENABLED, String(body.emailEnabled));
  }

  if (typeof body.emailAddress === "string") {
    const trimmed = body.emailAddress.trim();
    if (trimmed) {
      await settingsRepo.upsert(userId, KEY_EMAIL_ADDRESS, trimmed);
    } else {
      // Delete if empty
      await settingsRepo.delete(userId, KEY_EMAIL_ADDRESS);
    }
  }

  // Return updated settings
  const [autoSummarize, emailEnabled, emailAddress] = await Promise.all([
    settingsRepo.findByKey(userId, KEY_AUTO_SUMMARIZE),
    settingsRepo.findByKey(userId, KEY_EMAIL_ENABLED),
    settingsRepo.findByKey(userId, KEY_EMAIL_ADDRESS),
  ]);

  return Response.json({
    autoSummarize: autoSummarize?.value === "true",
    emailEnabled: emailEnabled?.value === "true",
    emailAddress: emailAddress?.value ?? "",
  });
}
