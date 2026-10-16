import { describe, expect, test } from "vitest";
import { humanApi, makeSession, syncSessions } from "./harness";

describe("E2E: Sync round-trip", () => {
  const session = makeSession();

  test("POST /api/sync accepts sessions without end_time and returns 202", async () => {
    const res = await syncSessions([session]);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.sync_id).toBeDefined();
  });

  test("GET /api/sessions returns computed end_time", async () => {
    const res = await humanApi("/api/sessions?limit=50");
    expect(res.status).toBe(200);
    const body = await res.json();
    const synced = body.sessions.find((row: { id: string }) => row.id === session.id);
    expect(synced).toBeDefined();
    expect(synced.endTime).toBe(session.start_time + session.duration);
    expect(synced.duration).toBe(session.duration);
    expect(synced.appName).toBe("E2E Test App");
  });

  test("POST /api/sync accepts payload with extra end_time field", async () => {
    const res = await syncSessions([makeSession({ end_time: Math.floor(Date.now() / 1000) })]);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  test("returns 400 when required field is missing", async () => {
    const res = await syncSessions([{ id: crypto.randomUUID() }]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("missing required field");
  });

  test("returns 400 for empty sessions array", async () => {
    const res = await syncSessions([]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("sessions array is required");
  });

  test("returns 413 when batch exceeds 1000 sessions", async () => {
    const sessions = Array.from({ length: 1001 }, (_, i) => makeSession({ id: `overflow-${i}` }));
    const res = await syncSessions(sessions);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("Batch too large");
  });
});
