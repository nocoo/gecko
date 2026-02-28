/**
 * POST /api/settings/ai/test — Test AI connection with current settings.
 *
 * Sends a minimal prompt to verify the API key and endpoint work.
 */

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { settingsRepo } from "@/lib/settings-repo";
import {
  resolveAiConfig,
  createAiClient,
  type AiProvider,
  type SdkType,
} from "@/services/ai";
import { generateText } from "ai";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  // Read settings from DB
  const all = await settingsRepo.findByUserId(user.userId);
  const map = new Map(all.map((s) => [s.key, s.value]));
  const provider = map.get("ai.provider") ?? "";
  const apiKey = map.get("ai.apiKey") ?? "";
  const model = map.get("ai.model") ?? "";
  const baseURL = map.get("ai.baseURL") ?? "";
  const sdkType = map.get("ai.sdkType") ?? "";

  if (!provider || !apiKey) {
    return jsonError("AI provider and API key must be configured first", 400);
  }

  try {
    const config = resolveAiConfig({
      provider: provider as AiProvider,
      apiKey,
      model,
      baseURL: baseURL || undefined,
      sdkType: (sdkType || undefined) as SdkType | undefined,
    });

    const client = createAiClient(config);

    const { text } = await generateText({
      model: client(config.model),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 10,
    });

    return jsonOk({
      success: true,
      response: text.trim(),
      model: config.model,
      provider: config.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 502);
  }
}
