import { describe, expect, test } from "vitest";
import { humanApi, makeSession, syncSessions } from "./harness";

describe("Sync Status E2E", () => {
  test("GET /api/sync/status returns devices after an in-request sync", async () => {
    const res = await syncSessions([
      makeSession({ app_name: "Finder", bundle_id: "com.apple.finder", window_title: "Home" }),
    ]);
    expect(res.status).toBe(202);

    const status = await humanApi("/api/sync/status");
    expect(status.status).toBe(200);
    const body = await status.json();
    expect(Array.isArray(body.devices)).toBe(true);
    expect(body.devices.length).toBeGreaterThan(0);
    const device = body.devices[0];
    expect(typeof device.deviceId).toBe("string");
    expect(typeof device.lastSync).toBe("string");
    expect(typeof device.sessionCount).toBe("number");
  });
});
