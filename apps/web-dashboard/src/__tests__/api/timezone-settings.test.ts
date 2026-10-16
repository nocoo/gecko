import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/settings/timezone route handler tests
// ---------------------------------------------------------------------------

describe("/api/settings/timezone", () => {
  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------
  describe("GET", () => {
    test("returns saved timezone for user", async () => {
      mockD1([
        [
          {
            user_id: "e2e-test-user",
            key: "timezone",
            value: "America/New_York",
            updated_at: 1000,
          },
        ],
      ]);
      const { GET } = await import("../../app/api/settings/timezone/route");

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("America/New_York");
    });

    test("returns default timezone when no setting exists", async () => {
      mockD1([
        [], // no rows = no timezone setting
      ]);
      const { GET } = await import("../../app/api/settings/timezone/route");

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("Asia/Shanghai");
    });

    test("returns default when stored value is invalid", async () => {
      mockD1([
        [{ user_id: "e2e-test-user", key: "timezone", value: "Invalid/Zone", updated_at: 1000 }],
      ]);
      const { GET } = await import("../../app/api/settings/timezone/route");

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("Asia/Shanghai");
    });
  });

  // -------------------------------------------------------------------------
  // PUT
  // -------------------------------------------------------------------------
  describe("PUT", () => {
    test("saves a valid timezone", async () => {
      const { calls } = mockD1([
        [], // upsert returns no rows
      ]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = humanRequest("http://127.0.0.1:17018/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Europe/London" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("Europe/London");

      // Verify the upsert SQL was called
      expect(calls.length).toBe(1);
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("INSERT INTO settings");
      expect(c0.params[0]).toBe("e2e-test-user");
      expect(c0.params[1]).toBe("timezone");
      expect(c0.params[2]).toBe("Europe/London");
    });

    test("rejects invalid timezone string", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = humanRequest("http://127.0.0.1:17018/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Not_A_Zone" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Invalid IANA timezone");
    });

    test("rejects missing timezone field", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = humanRequest("http://127.0.0.1:17018/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Missing timezone");
    });

    test("rejects non-string timezone field", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = humanRequest("http://127.0.0.1:17018/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: 123 }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("rejects invalid JSON body", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = humanRequest("http://127.0.0.1:17018/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });
});
