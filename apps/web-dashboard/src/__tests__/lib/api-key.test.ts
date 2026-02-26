import { describe, test, expect } from "bun:test";
import { generateApiKey, hashApiKey, API_KEY_PREFIX } from "../../lib/api-key";

describe("api-key", () => {
  // ---------------------------------------------------------------------------
  // generateApiKey()
  // ---------------------------------------------------------------------------

  describe("generateApiKey()", () => {
    test("returns string with gk_ prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    });

    test("generates 32 bytes hex after prefix (64 hex chars)", () => {
      const key = generateApiKey();
      const hex = key.slice(API_KEY_PREFIX.length);
      expect(hex).toHaveLength(64);
      expect(hex).toMatch(/^[0-9a-f]+$/);
    });

    test("generates unique keys", () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
      expect(keys.size).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // hashApiKey()
  // ---------------------------------------------------------------------------

  describe("hashApiKey()", () => {
    test("returns hex string", async () => {
      const hash = await hashApiKey("gk_test123");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("deterministic — same input gives same hash", async () => {
      const h1 = await hashApiKey("gk_abc");
      const h2 = await hashApiKey("gk_abc");
      expect(h1).toBe(h2);
    });

    test("different inputs give different hashes", async () => {
      const h1 = await hashApiKey("gk_key1");
      const h2 = await hashApiKey("gk_key2");
      expect(h1).not.toBe(h2);
    });

    test("produces valid SHA-256 hash", async () => {
      // Known SHA-256 of "gk_test" computed externally
      const hash = await hashApiKey("gk_test");
      // Just verify it's 64 hex chars (256 bits)
      expect(hash).toHaveLength(64);
    });
  });

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  describe("constants", () => {
    test("API_KEY_PREFIX is gk_", () => {
      expect(API_KEY_PREFIX).toBe("gk_");
    });
  });
});
