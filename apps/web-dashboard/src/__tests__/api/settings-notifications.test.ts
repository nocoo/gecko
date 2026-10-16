import { describe, expect, test } from "vitest";
import { humanRequest, installHumanTestEnv, mockD1 } from "../test-env";

function settingRow(key: string, value: string) {
  return { user_id: "e2e-test-user", key, value, updated_at: 1000 };
}

const url = "http://127.0.0.1:17018/api/settings/notifications";

describe("/api/settings/notifications", () => {
  describe("GET", () => {
    test("returns notification settings", async () => {
      mockD1([
        [settingRow("ai.autoSummarize", "true")],
        [settingRow("notification.email.enabled", "true")],
        [settingRow("notification.email.address", "test@example.com")],
      ]);
      const { GET } = await import("../../app/api/settings/notifications/route");
      const res = await GET(humanRequest(url));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.autoSummarize).toBe(true);
      expect(data.emailEnabled).toBe(true);
      expect(data.emailAddress).toBe("test@example.com");
    });

    test("returns default values when no settings exist", async () => {
      mockD1([[], [], []]);
      const { GET } = await import("../../app/api/settings/notifications/route");
      const res = await GET(humanRequest(url));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.autoSummarize).toBe(false);
      expect(data.emailEnabled).toBe(false);
      expect(data.emailAddress).toBe("");
    });

    test("returns 401 when not authenticated", async () => {
      installHumanTestEnv({ authMode: "jwt" });
      const { GET } = await import("../../app/api/settings/notifications/route");
      const res = await GET(humanRequest(url));
      expect(res.status).toBe(401);
    });
  });

  describe("PUT", () => {
    test("updates autoSummarize and emailEnabled fields", async () => {
      const { calls } = mockD1([
        [],
        [],
        [],
        [settingRow("ai.autoSummarize", "true")],
        [settingRow("notification.email.enabled", "false")],
        [settingRow("notification.email.address", "new@example.com")],
      ]);
      const { PUT } = await import("../../app/api/settings/notifications/route");
      const res = await PUT(
        humanRequest(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autoSummarize: true,
            emailEnabled: false,
            emailAddress: "new@example.com",
          }),
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.autoSummarize).toBe(true);
      expect(data.emailEnabled).toBe(false);
      expect(data.emailAddress).toBe("new@example.com");
      expect(calls.length).toBe(6);
    });

    test("deletes emailAddress when empty string provided", async () => {
      const { calls } = mockD1([[], [], [], []]);
      const { PUT } = await import("../../app/api/settings/notifications/route");
      const res = await PUT(
        humanRequest(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailAddress: "   " }),
        }),
      );
      expect(res.status).toBe(200);
      expect(calls[0]?.sql).toContain("DELETE");
    });

    test("returns 401 when not authenticated", async () => {
      installHumanTestEnv({ authMode: "jwt" });
      const { PUT } = await import("../../app/api/settings/notifications/route");
      const res = await PUT(
        humanRequest(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(401);
    });
  });
});
