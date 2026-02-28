/**
 * GET  /api/settings/ai — Read AI configuration for current user
 * PUT  /api/settings/ai — Save AI configuration
 */

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { settingsRepo } from "@/lib/settings-repo";
import { isValidProvider, type AiProvider, type SdkType } from "@/services/ai";

export const dynamic = "force-dynamic";

/** Read all AI settings for a user and return a typed object. */
async function readAiSettings(userId: string) {
  const all = await settingsRepo.findByUserId(userId);
  const map = new Map(all.map((s) => [s.key, s.value]));
  return {
    provider: (map.get("ai.provider") ?? "") as AiProvider | "",
    apiKey: map.get("ai.apiKey") ?? "",
    model: map.get("ai.model") ?? "",
    autoSummarize: map.get("ai.autoSummarize") === "true",
    baseURL: map.get("ai.baseURL") ?? "",
    sdkType: (map.get("ai.sdkType") ?? "") as SdkType | "",
  };
}

function maskApiKey(key: string): string {
  if (!key) return "";
  return `${"*".repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`;
}

export async function GET(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const settings = await readAiSettings(user.userId);
  return jsonOk({
    ...settings,
    apiKey: maskApiKey(settings.apiKey),
    hasApiKey: !!settings.apiKey,
  });
}

export async function PUT(request: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: {
    provider?: string;
    apiKey?: string;
    model?: string;
    autoSummarize?: boolean;
    baseURL?: string;
    sdkType?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  // Validate provider if provided
  if (body.provider !== undefined && body.provider !== "") {
    if (!isValidProvider(body.provider)) {
      return jsonError(`Invalid provider: ${body.provider}`, 400);
    }
  }

  // Validate sdkType if provided
  if (body.sdkType !== undefined && body.sdkType !== "") {
    if (body.sdkType !== "openai" && body.sdkType !== "anthropic") {
      return jsonError(`Invalid SDK type: ${body.sdkType}`, 400);
    }
  }

  // Save each field
  if (body.provider !== undefined) {
    await settingsRepo.upsert(user.userId, "ai.provider", body.provider);
  }
  if (body.apiKey !== undefined) {
    await settingsRepo.upsert(user.userId, "ai.apiKey", body.apiKey);
  }
  if (body.model !== undefined) {
    await settingsRepo.upsert(user.userId, "ai.model", body.model);
  }
  if (body.autoSummarize !== undefined) {
    await settingsRepo.upsert(user.userId, "ai.autoSummarize", String(body.autoSummarize));
  }
  if (body.baseURL !== undefined) {
    await settingsRepo.upsert(user.userId, "ai.baseURL", body.baseURL);
  }
  if (body.sdkType !== undefined) {
    await settingsRepo.upsert(user.userId, "ai.sdkType", body.sdkType);
  }

  const updated = await readAiSettings(user.userId);
  return jsonOk({
    ...updated,
    apiKey: maskApiKey(updated.apiKey),
    hasApiKey: !!updated.apiKey,
  });
}
