import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// API helpers tests — auth extraction for route handlers
// ---------------------------------------------------------------------------

// We test the pure logic functions, not the NextAuth integration directly.

describe("api-helpers", () => {
  // ---------------------------------------------------------------------------
  // requireSession() logic
  // ---------------------------------------------------------------------------

  describe("requireSession logic", () => {
    // Simulates the session extraction logic
    function extractUserId(
      session: { user?: { id?: string } } | null,
      skipAuth: boolean
    ): { userId: string } | { error: string; status: number } {
      if (skipAuth) {
        return { userId: "e2e-test-user" };
      }
      if (!session?.user?.id) {
        return { error: "Unauthorized", status: 401 };
      }
      return { userId: session.user.id };
    }

    test("returns userId from valid session", () => {
      const result = extractUserId({ user: { id: "google-123" } }, false);
      expect(result).toEqual({ userId: "google-123" });
    });

    test("returns 401 when session is null", () => {
      const result = extractUserId(null, false);
      expect(result).toEqual({ error: "Unauthorized", status: 401 });
    });

    test("returns 401 when session has no user", () => {
      const result = extractUserId({}, false);
      expect(result).toEqual({ error: "Unauthorized", status: 401 });
    });

    test("returns 401 when user has no id", () => {
      const result = extractUserId({ user: {} }, false);
      expect(result).toEqual({ error: "Unauthorized", status: 401 });
    });

    test("returns e2e-test-user when skipAuth is true", () => {
      const result = extractUserId(null, true);
      expect(result).toEqual({ userId: "e2e-test-user" });
    });
  });

  // ---------------------------------------------------------------------------
  // API key extraction from header
  // ---------------------------------------------------------------------------

  describe("extractBearerToken()", () => {
    // Import after module exists
    let extractBearerToken: (req: Request) => string | null;

    beforeEach(async () => {
      const mod = await import("../../lib/api-helpers");
      extractBearerToken = mod.extractBearerToken;
    });

    test("extracts token from valid Authorization header", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "Bearer gk_abc123" },
      });
      expect(extractBearerToken(req)).toBe("gk_abc123");
    });

    test("returns null when no Authorization header", () => {
      const req = new Request("http://localhost");
      expect(extractBearerToken(req)).toBeNull();
    });

    test("returns null for non-Bearer scheme", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "Basic abc123" },
      });
      expect(extractBearerToken(req)).toBeNull();
    });

    test("returns null for empty Bearer value", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "Bearer " },
      });
      expect(extractBearerToken(req)).toBeNull();
    });

    test("handles case-insensitive Bearer prefix", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "bearer gk_abc123" },
      });
      expect(extractBearerToken(req)).toBe("gk_abc123");
    });
  });

  // ---------------------------------------------------------------------------
  // JSON response helpers
  // ---------------------------------------------------------------------------

  describe("json response helpers", () => {
    let jsonOk: (data: unknown, status?: number) => Response;
    let jsonError: (message: string, status: number) => Response;

    beforeEach(async () => {
      const mod = await import("../../lib/api-helpers");
      jsonOk = mod.jsonOk;
      jsonError = mod.jsonError;
    });

    test("jsonOk returns 200 with data", async () => {
      const res = jsonOk({ foo: "bar" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ foo: "bar" });
    });

    test("jsonOk supports custom status", async () => {
      const res = jsonOk({ created: true }, 201);
      expect(res.status).toBe(201);
    });

    test("jsonError returns error envelope", async () => {
      const res = jsonError("Not found", 404);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    });
  });
});
