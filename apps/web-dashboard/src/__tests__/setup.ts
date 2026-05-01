/**
 * Vitest setup — runs before each test file.
 *
 * Replaces bun's preload.ts. Mocks modules that cannot run in the test env:
 * - server-only: throws at import time in Next.js, needs to be a no-op in tests
 * - @nocoo/next-ai/server: depends on server-only
 * - ai: top-level generateText controlled per-test via __testOverrides
 */

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

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

vi.mock("@nocoo/next-ai/server", () => ({
  resolveAiConfig: (input: Record<string, unknown>) => {
    const fn = __testOverrides.resolveAiConfig ?? defaultResolveAiConfig;
    return fn(input);
  },
  createAiModel: () => "mock-model",
}));

vi.mock("ai", () => ({
  generateText: (opts: Record<string, unknown>) => {
    if (__testOverrides.generateText) {
      return __testOverrides.generateText(opts);
    }
    return Promise.reject(new Error("generateText not mocked"));
  },
}));
