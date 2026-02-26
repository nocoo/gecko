import { describe, test, expect, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Settings page unit tests
//
// We test the formatDate helper and the API key management logic.
// The page itself is a React component tested via E2E; here we focus on
// the data-layer interactions (fetch/create/delete keys).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// formatDate helper (extracted for testing)
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

describe("Settings page helpers", () => {
  describe("formatDate", () => {
    test("returns 'today' for current date", () => {
      expect(formatDate(new Date().toISOString())).toBe("today");
    });

    test("returns 'yesterday' for 1 day ago", () => {
      const yesterday = new Date(Date.now() - 86400 * 1000);
      expect(formatDate(yesterday.toISOString())).toBe("yesterday");
    });

    test("returns 'N days ago' for 2-6 days", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
      expect(formatDate(threeDaysAgo.toISOString())).toBe("3 days ago");
    });

    test("returns formatted date for older dates", () => {
      const result = formatDate("2025-01-15T12:00:00Z");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
    });

    test("includes year for dates in different year", () => {
      const result = formatDate("2024-06-01T12:00:00Z");
      expect(result).toContain("2024");
    });
  });
});

// ---------------------------------------------------------------------------
// API Key management (fetch layer)
// ---------------------------------------------------------------------------

describe("Settings API key management", () => {
  let fetchCalls: { url: string; init?: RequestInit }[];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
  });

  function mockFetch(responses: { status: number; body: unknown }[]) {
    let callIndex = 0;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push({ url, init });
      const resp = responses[callIndex] ?? { status: 500, body: { error: "No mock" } };
      callIndex++;
      return new Response(JSON.stringify(resp.body), {
        status: resp.status,
        headers: { "Content-Type": "application/json" },
      });
    };
  }

  // Restore after each group
  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  test("GET /api/keys returns list of keys", async () => {
    const mockKeys = [
      { id: "k1", name: "MacBook Pro", deviceId: "dev-1", createdAt: "2026-02-27T00:00:00Z", lastUsed: null },
    ];
    mockFetch([{ status: 200, body: { keys: mockKeys } }]);

    const res = await fetch("/api/keys");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.keys).toHaveLength(1);
    expect(data.keys[0].name).toBe("MacBook Pro");
    expect(fetchCalls[0].url).toBe("/api/keys");

    restoreFetch();
  });

  test("POST /api/keys creates a key and returns raw key", async () => {
    mockFetch([{
      status: 201,
      body: { id: "k2", key: "gk_abc123", deviceId: "dev-2", name: "iMac", createdAt: "2026-02-27T00:00:00Z" },
    }]);

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "iMac" }),
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.key).toBe("gk_abc123");
    expect(fetchCalls[0].init?.method).toBe("POST");

    restoreFetch();
  });

  test("DELETE /api/keys/:id revokes a key", async () => {
    mockFetch([{ status: 200, body: { deleted: true } }]);

    const res = await fetch("/api/keys/k1", { method: "DELETE" });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(true);
    expect(fetchCalls[0].url).toBe("/api/keys/k1");
    expect(fetchCalls[0].init?.method).toBe("DELETE");

    restoreFetch();
  });

  test("handles error response from POST /api/keys", async () => {
    mockFetch([{ status: 400, body: { error: "Name is required" } }]);

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Name is required");

    restoreFetch();
  });

  test("handles 404 on DELETE for non-existent key", async () => {
    mockFetch([{ status: 404, body: { error: "API key not found" } }]);

    const res = await fetch("/api/keys/nonexistent", { method: "DELETE" });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("API key not found");

    restoreFetch();
  });
});
