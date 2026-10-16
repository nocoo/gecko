import { describe, expect, test } from "vitest";
import { machineRequest, mockD1 } from "../test-env";

function sampleSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    app_name: "Google Chrome",
    window_title: "GitHub - gecko",
    url: "https://github.com/user/gecko",
    start_time: 1740600000.0,
    duration: 120.0,
    bundle_id: "com.google.Chrome",
    tab_title: "gecko: Screen time tracker",
    tab_count: 12,
    document_path: null,
    is_full_screen: false,
    is_minimized: false,
    ...overrides,
  };
}

async function post(body: unknown, init?: RequestInit) {
  const { POST } = await import("../../app/api/sync/route");
  return POST(
    machineRequest("http://127.0.0.1:17018/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/sync", () => {
  test("returns 202 after persisting sessions", async () => {
    mockD1();
    const res = await post({ sessions: [sampleSession()] });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.accepted).toBe(1);
    expect(typeof data.sync_id).toBe("string");
  });

  test("accepts multiple sessions", async () => {
    mockD1();
    const sessions = [
      sampleSession({ id: "id-1", start_time: 1740600000.0 }),
      sampleSession({ id: "id-2", start_time: 1740600120.0 }),
      sampleSession({ id: "id-3", start_time: 1740600240.0 }),
    ];
    const res = await post({ sessions });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.accepted).toBe(3);
  });

  test("returns 400 for empty sessions array", async () => {
    const res = await post({ sessions: [] });
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid JSON", async () => {
    const { POST } = await import("../../app/api/sync/route");
    const res = await POST(
      machineRequest("http://127.0.0.1:17018/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 401 without API key", async () => {
    const { POST } = await import("../../app/api/sync/route");
    const res = await POST(
      new Request("http://127.0.0.1:17018/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: [sampleSession()] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("returns 409 on ownership conflict", async () => {
    const { db } = mockD1();
    db.autoSync = false;
    db.setResponses([[], [{ id: "550e8400-e29b-41d4-a716-446655440000", user_id: "other" }]]);
    const res = await post({ sessions: [sampleSession()] });
    expect(res.status).toBe(409);
  });

  test("returns 413 when batch exceeds 1000", async () => {
    const sessions = Array.from({ length: 1001 }, (_, i) => sampleSession({ id: `id-${i}` }));
    const res = await post({ sessions });
    expect(res.status).toBe(413);
  });
});
