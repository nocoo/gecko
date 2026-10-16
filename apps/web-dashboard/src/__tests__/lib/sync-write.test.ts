import { describe, expect, test } from "vitest";
import {
  buildMultiRowInsert,
  COLUMNS,
  OwnershipConflictError,
  type QueuedSession,
  writeSessions,
} from "../../lib/sync-write";
import { mockD1, TEST_DEVICE_ID, TEST_USER_ID } from "../test-env";

function session(overrides: Partial<QueuedSession> = {}): QueuedSession {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    user_id: TEST_USER_ID,
    device_id: TEST_DEVICE_ID,
    app_name: "Google Chrome",
    window_title: "GitHub",
    url: "https://github.com",
    start_time: 1740600000,
    duration: 120,
    bundle_id: "com.google.Chrome",
    tab_title: "gecko",
    tab_count: 2,
    document_path: null,
    is_full_screen: false,
    is_minimized: false,
    ...overrides,
  };
}

describe("buildMultiRowInsert", () => {
  test("uses ON CONFLICT DO NOTHING and 14 columns", () => {
    const built = buildMultiRowInsert([session(), session({ id: "other" })]);
    expect(COLUMNS).toHaveLength(14);
    expect(built.sql).toContain("ON CONFLICT(id) DO NOTHING");
    expect(built.params).toHaveLength(28);
  });

  test("nulls optional session fields", () => {
    const built = buildMultiRowInsert([
      session({
        url: undefined as unknown as string,
        bundle_id: undefined as unknown as string,
        tab_title: undefined as unknown as string,
        tab_count: undefined as unknown as number,
        document_path: undefined as unknown as string,
      }),
    ]);
    expect(built.params[5]).toBeNull();
    expect(built.params[8]).toBeNull();
    expect(built.params[9]).toBeNull();
    expect(built.params[10]).toBeNull();
    expect(built.params[11]).toBeNull();
  });

  test("encodes fullscreen and minimized flags", () => {
    const built = buildMultiRowInsert([session({ is_full_screen: true, is_minimized: true })]);
    expect(built.params[12]).toBe(1);
    expect(built.params[13]).toBe(1);
  });
});

describe("writeSessions", () => {
  test("inserts, checks ownership, and writes sync_logs", async () => {
    const { calls } = mockD1();
    const result = await writeSessions([session()], "sync-1");
    expect(result).toEqual({ accepted: 1, syncId: "sync-1" });
    expect(calls.some((call) => /INSERT INTO\s+focus_sessions/i.test(call.sql))).toBe(true);
    expect(calls.some((call) => /INSERT INTO\s+sync_logs/i.test(call.sql))).toBe(true);
    const log = calls.find((call) => /INSERT INTO\s+sync_logs/i.test(call.sql));
    expect(log?.params[0]).toBe("sync-1");
    expect(log?.sql).toContain("first_start");
    expect(log?.sql).toContain("last_start");
  });

  test("throws OwnershipConflictError when another user owns the id", async () => {
    const { db } = mockD1([[{ id: "550e8400-e29b-41d4-a716-446655440000", user_id: "other" }]]);
    db.autoSync = false;
    await expect(writeSessions([session()], "sync-2")).rejects.toBeInstanceOf(
      OwnershipConflictError,
    );
  });

  test("rejects empty batches", async () => {
    await expect(writeSessions([], "sync-3")).rejects.toThrow("sessions must not be empty");
  });

  test("rejects sessions without user_id", async () => {
    await expect(writeSessions([session({ user_id: "" })], "sync-4")).rejects.toThrow(
      "user_id is required",
    );
  });

  test("writes an empty device_id when the first session omits it", async () => {
    const { calls } = mockD1();
    await writeSessions([session({ device_id: undefined as unknown as string })], "sync-5");
    const log = calls.find((call) => /INSERT INTO\s+sync_logs/i.test(call.sql));
    expect(log?.params[2]).toBe("");
  });
});
