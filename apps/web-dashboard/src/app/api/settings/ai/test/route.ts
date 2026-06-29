/**
 * POST /api/settings/ai/test — Test AI connection with current settings.
 *
 * Sends a minimal prompt to verify the API key and endpoint work.
 */

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { settingsRepo } from "@/lib/settings-repo";
import {
  resolveAiConfig,
  createAiModel,
} from "@nocoo/next-ai/server";
import type { AiSettingsInput } from "@nocoo/next-ai";
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
    const settings: AiSettingsInput = {
      provider,
      apiKey,
      model,
      baseURL: baseURL || undefined,
      sdkType: sdkType ? (sdkType as "anthropic" | "openai") : undefined,
    };

    const config = resolveAiConfig(settings);
    const aiModel = createAiModel(config);

    const { text } = await generateText({
      model: aiModel,
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
    // Surface upstream provider errors with their original status + message
    // so the UI can show "401 Authentication failed with upstream provider"
    // instead of a generic 502. ai-sdk attaches `statusCode` and a structured
    // `responseBody` for HTTP errors; AbortError, network errors, validation
    // errors all surface as the plain Error.message.
    type UpstreamError = Error & { statusCode?: number; responseBody?: string; url?: string };
    const e = err as UpstreamError;
    const statusCode = typeof e.statusCode === "number" ? e.statusCode : 502;
    const baseMessage = e.message ?? "Unknown error";
    // Try to lift the upstream's own message out of responseBody for clarity.
    let detail = baseMessage;
    if (e.responseBody) {
      try {
        const parsed = JSON.parse(e.responseBody) as {
          error?: { message?: string } | string;
          message?: string;
        };
        const inner =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error?.message ?? parsed.message;
        if (inner) detail = inner;
      } catch {
        // responseBody not JSON — keep baseMessage
      }
    }
    return jsonError(
      e.url ? `${detail} (upstream: ${e.url})` : detail,
      statusCode,
    );
  }
}
