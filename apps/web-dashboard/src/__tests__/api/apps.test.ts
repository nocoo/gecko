import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/apps route handler tests
// ---------------------------------------------------------------------------

describe("/api/apps", () => {
  describe("GET /api/apps", () => {
    test("returns list of unique apps ordered by total duration", async () => {
      mockD1([
        [
          {
            bundle_id: "com.google.Chrome",
            app_name: "Google Chrome",
            total_duration: 50000,
            session_count: 100,
          },
          {
            bundle_id: "com.microsoft.VSCode",
            app_name: "Visual Studio Code",
            total_duration: 30000,
            session_count: 80,
          },
        ],
      ]);
      const { GET } = await import("../../app/api/apps/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.apps).toHaveLength(2);
      const a0 = data.apps[0];
      const a1 = data.apps[1];
      if (!a0 || !a1) return;
      expect(a0.bundleId).toBe("com.google.Chrome");
      expect(a0.appName).toBe("Google Chrome");
      expect(a0.totalDuration).toBe(50000);
      expect(a0.sessionCount).toBe(100);
      expect(a1.bundleId).toBe("com.microsoft.VSCode");
    });

    test("returns empty array when no tracked apps", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/apps/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.apps).toEqual([]);
    });

    test("filters by user_id and excludes null/empty bundle_ids", async () => {
      const { calls } = mockD1([[]]);
      const { GET } = await import("../../app/api/apps/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps");
      await GET(req);

      expect(calls).toHaveLength(1);
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("user_id = ?");
      expect(c0.sql).toContain("bundle_id IS NOT NULL");
      expect(c0.sql).toContain("bundle_id != ''");
      expect(c0.params).toEqual(["e2e-test-user"]);
    });

    test("groups by bundle_id and sums duration", async () => {
      const { calls } = mockD1([[]]);
      const { GET } = await import("../../app/api/apps/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps");
      await GET(req);

      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("GROUP BY bundle_id");
      expect(c0.sql).toContain("SUM(duration)");
      expect(c0.sql).toContain("ORDER BY total_duration DESC");
    });
  });
});
