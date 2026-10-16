import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/sessions route handler tests
// ---------------------------------------------------------------------------

const sampleRow = {
  id: "session-1",
  app_name: "Google Chrome",
  window_title: "GitHub",
  url: "https://github.com",
  start_time: 1740600000,
  end_time: 1740600120,
  duration: 120,
  bundle_id: "com.google.Chrome",
  tab_title: "GitHub - gecko",
  tab_count: 5,
  document_path: null,
  is_full_screen: 1,
  is_minimized: 0,
  device_id: "dev-1",
  synced_at: "2026-02-27T00:00:00.000Z",
};

describe("GET /api/sessions", () => {
  test("returns paginated sessions with mapped fields", async () => {
    const { calls } = mockD1([[sampleRow]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = humanRequest("http://127.0.0.1:17018/api/sessions");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].id).toBe("session-1");
    expect(data.sessions[0].appName).toBe("Google Chrome");
    expect(data.sessions[0].isFullScreen).toBe(true);
    expect(data.sessions[0].isMinimized).toBe(false);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);

    expect(calls.length).toBe(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("FROM focus_sessions");
    expect(c0.params).toEqual(["e2e-test-user", 50, 0]);
  });

  test("respects limit and offset query params", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = humanRequest("http://127.0.0.1:17018/api/sessions?limit=10&offset=20");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.limit).toBe(10);
    expect(data.offset).toBe(20);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.params).toEqual(["e2e-test-user", 10, 20]);
  });

  test("caps limit at MAX_LIMIT (200)", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = humanRequest("http://127.0.0.1:17018/api/sessions?limit=9999");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.limit).toBe(200);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.params[1]).toBe(200);
  });

  test("returns empty array when no sessions", async () => {
    mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const res = await GET(humanRequest("http://127.0.0.1:17018/api/sessions"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessions).toEqual([]);
  });
});
