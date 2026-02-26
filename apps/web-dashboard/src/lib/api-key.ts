// API key generation and hashing utilities for macOS app authentication.
// Keys use format: gk_<64 hex chars> (32 random bytes).
// Only the SHA-256 hash is stored server-side.

import { randomBytes, createHash } from "node:crypto";

export const API_KEY_PREFIX = "gk_";

/** Generate a new API key: gk_ + 32 random bytes as hex. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("hex");
}

/** Compute SHA-256 hash of an API key. Returns lowercase hex string. */
export async function hashApiKey(key: string): Promise<string> {
  return createHash("sha256").update(key).digest("hex");
}
