import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/sync/status route handler tests
// ---------------------------------------------------------------------------

describe("GET /api/sync/status", () => {
  test("returns devices with last sync info and friendly names", async () => {
    mockD1([
      // sync_logs query
      [
        { device_id: "dev-1", session_count: 25, synced_at: "2026-02-27T10:00:00Z" },
        { device_id: "dev-2", session_count: 5, synced_at: "2026-02-27T08:00:00Z" },
      ],
      // api_keys name lookup
      [
        { device_id: "dev-1", name: "MacBook Pro" },
        { device_id: "dev-2", name: "Mac Mini" },
      ],
    ]);
    const { GET } = await import("../../app/api/sync/status/route");

    const res = await GET(humanRequest("http://127.0.0.1:17018/api/sync/status"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.devices).toHaveLength(2);
    expect(data.devices[0]).toEqual({
      deviceId: "dev-1",
      name: "MacBook Pro",
      lastSync: "2026-02-27T10:00:00Z",
      sessionCount: 25,
    });
    expect(data.devices[1].name).toBe("Mac Mini");
  });

  test("falls back to 'Unknown device' when name not found", async () => {
    mockD1([
      [{ device_id: "dev-orphan", session_count: 1, synced_at: "2026-02-27T10:00:00Z" }],
      [], // no api_keys for this device
    ]);
    const { GET } = await import("../../app/api/sync/status/route");

    const res = await GET(humanRequest("http://127.0.0.1:17018/api/sync/status"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].name).toBe("Unknown device");
  });

  test("returns empty devices array when no sync logs", async () => {
    mockD1([[], []]);
    const { GET } = await import("../../app/api/sync/status/route");

    const res = await GET(humanRequest("http://127.0.0.1:17018/api/sync/status"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.devices).toEqual([]);
  });

  test("scopes queries to the authenticated user", async () => {
    const { calls } = mockD1([[], []]);
    const { GET } = await import("../../app/api/sync/status/route");

    await GET(humanRequest("http://127.0.0.1:17018/api/sync/status"));

    expect(calls.length).toBe(2);
    const c0 = calls[0];
    const c1 = calls[1];
    if (!c0 || !c1) return;
    expect(c0.params).toEqual(["e2e-test-user"]);
    expect(c1.params).toEqual(["e2e-test-user"]);
    expect(c0.sql).toContain("sync_logs");
    expect(c1.sql).toContain("api_keys");
  });
});
