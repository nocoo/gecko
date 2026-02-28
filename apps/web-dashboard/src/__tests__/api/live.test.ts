import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// /api/live route handler tests
// ---------------------------------------------------------------------------

describe("/api/live", () => {
  describe("GET /api/live", () => {
    test("returns 200 with status ok", async () => {
      const { GET } = await import("../../app/api/live/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    test("returns version string", async () => {
      const { GET } = await import("../../app/api/live/route");

      const res = await GET();
      const data = await res.json();

      expect(typeof data.version).toBe("string");
      expect(data.version.length).toBeGreaterThan(0);
    });

    test("returns uptime as a non-negative number", async () => {
      const { GET } = await import("../../app/api/live/route");

      const res = await GET();
      const data = await res.json();

      expect(typeof data.uptime).toBe("number");
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    test("returns ISO 8601 timestamp", async () => {
      const { GET } = await import("../../app/api/live/route");

      const res = await GET();
      const data = await res.json();

      expect(typeof data.timestamp).toBe("string");
      // Validate it's a parseable ISO date
      const parsed = new Date(data.timestamp).getTime();
      expect(Number.isNaN(parsed)).toBe(false);
    });

    test("sets no-cache headers", async () => {
      const { GET } = await import("../../app/api/live/route");

      const res = await GET();
      const cc = res.headers.get("Cache-Control");

      expect(cc).toContain("no-store");
      expect(cc).toContain("no-cache");
      expect(cc).toContain("must-revalidate");
    });

    test("does not include 'ok' anywhere in error responses", async () => {
      // This test validates requirement #4: error responses must never
      // contain the word "ok" to avoid false positives from keyword monitors.
      // Since the happy path is the only reachable branch (Date/JSON can't
      // throw), we verify the contract by inspecting the error branch shape
      // via a simulated error scenario.

      // We can force an error by temporarily breaking Response.json
      const origJson = Response.json;
      let callCount = 0;
      Response.json = (...args: Parameters<typeof Response.json>) => {
        callCount++;
        if (callCount === 1) {
          // First call is the happy path — throw to enter catch block
          throw new Error("simulated failure");
        }
        // Second call is the error path — let it through
        return origJson.apply(Response, args);
      };

      try {
        const { GET } = await import("../../app/api/live/route");
        const res = await GET();

        expect(res.status).toBe(503);
        const data = await res.json();
        expect(data.status).toBe("error");
        expect(typeof data.reason).toBe("string");
        expect(data.timestamp).toBeTruthy();

        // The word "ok" must not appear anywhere in the error response
        const raw = JSON.stringify(data).toLowerCase();
        expect(raw).not.toContain('"ok"');
      } finally {
        Response.json = origJson;
      }
    });

    test("error response includes reason and timestamp but no status ok", async () => {
      const origJson = Response.json;
      let callCount = 0;
      Response.json = (...args: Parameters<typeof Response.json>) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("test error message");
        }
        return origJson.apply(Response, args);
      };

      try {
        const { GET } = await import("../../app/api/live/route");
        const res = await GET();

        const data = await res.json();
        expect(data.reason).toBe("test error message");
        expect(data.status).not.toBe("ok");

        // Validate no-cache on error responses too
        const cc = res.headers.get("Cache-Control");
        expect(cc).toContain("no-store");
      } finally {
        Response.json = origJson;
      }
    });

    test("response body has exactly the expected keys on success", async () => {
      const { GET } = await import("../../app/api/live/route");

      const res = await GET();
      const data = await res.json();
      const keys = Object.keys(data).sort();

      expect(keys).toEqual(["status", "timestamp", "uptime", "version"]);
    });
  });
});
