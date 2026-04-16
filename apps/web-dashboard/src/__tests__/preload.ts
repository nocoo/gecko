/**
 * Test preload script.
 *
 * Mocks modules that cannot run in the test environment:
 * - server-only: throws at import time in Next.js, needs to be a no-op in tests
 * - @nocoo/next-ai/server: depends on server-only
 */

import { mock } from "bun:test";

// Mock server-only to be a no-op
mock.module("server-only", () => ({}));

// Mock @nocoo/next-ai/server with stub implementations.
// resolveAiConfig can be overridden per-test via __testOverrides.resolveAiConfig.
export const __testOverrides: {
  resolveAiConfig?: ((input: Record<string, unknown>) => unknown) | null;
  generateText?: ((opts: Record<string, unknown>) => Promise<unknown>) | null;
} = {};

const defaultResolveAiConfig = (input: Record<string, unknown>) => ({
  provider: input.provider,
  baseURL: input.baseURL ?? "https://api.example.com",
  apiKey: input.apiKey,
  model: input.model ?? "test-model",
  sdkType: input.sdkType ?? "anthropic",
});

mock.module("@nocoo/next-ai/server", () => ({
  resolveAiConfig: (input: Record<string, unknown>) => {
    const fn = __testOverrides.resolveAiConfig ?? defaultResolveAiConfig;
    return fn(input);
  },
  createAiModel: () => "mock-model",
}));

// Mock the "ai" module's generateText so tests can control AI responses.
mock.module("ai", () => ({
  generateText: (opts: Record<string, unknown>) => {
    if (__testOverrides.generateText) {
      return __testOverrides.generateText(opts);
    }
    // Default: reject (simulates AI SDK failure when no D1 mock handles it)
    return Promise.reject(new Error("generateText not mocked"));
  },
}));
