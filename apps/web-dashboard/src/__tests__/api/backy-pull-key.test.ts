/**
 * Tests for /api/backy/pull-key — Pull key management endpoints.
 */

import { describe, expect, test } from "vitest";
import { humanRequest, mockD1BySql } from "../test-env";

function writeReq(method: "POST" | "DELETE"): Request {
  return humanRequest("http://127.0.0.1:17018/api/backy/pull-key", { method });
}

describe("GET /api/backy/pull-key", () => {
  test("returns exists:false when no pull key set", async () => {
    mockD1BySql(() => []);

    const { GET } = await import("../../app/api/backy/pull-key/route");
    const res = await GET(humanRequest("http://127.0.0.1:17018/"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exists).toBe(false);
    expect(data.maskedKey).toBeNull();
  });

  test("returns masked key when pull key exists", async () => {
    const pullKey = `bpk_${"ab".repeat(32)}`;

    mockD1BySql((sql) => {
      if (sql.includes("backy.pullKey")) return [{ value: pullKey }];
      return [];
    });

    const { GET } = await import("../../app/api/backy/pull-key/route");
    const res = await GET(humanRequest("http://127.0.0.1:17018/"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exists).toBe(true);
    expect(data.maskedKey).toBeTruthy();
    expect(data.maskedKey).toMatch(/^bpk_/);
    expect(data.maskedKey).toContain("•");
    expect(data.maskedKey).toMatch(/abababab$/);
    expect(data.maskedKey).not.toBe(pullKey);
  });
});

describe("POST /api/backy/pull-key", () => {
  test("generates and returns a new pull key", async () => {
    const { calls } = mockD1BySql(() => ({ results: [], meta: { changes: 1 } }));

    const { POST } = await import("../../app/api/backy/pull-key/route");
    const res = await POST(writeReq("POST"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBeTruthy();
    expect(data.key).toMatch(/^bpk_[0-9a-f]{64}$/);
    expect(calls.some((c) => c.sql.includes("backy.pullKey"))).toBe(true);
  });

  test("each call generates a unique key", async () => {
    mockD1BySql(() => ({ results: [], meta: { changes: 1 } }));

    const { POST } = await import("../../app/api/backy/pull-key/route");
    const res1 = await POST(writeReq("POST"));
    const res2 = await POST(writeReq("POST"));

    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1.key).not.toBe(data2.key);
  });
});

describe("DELETE /api/backy/pull-key", () => {
  test("returns revoked:true when key existed", async () => {
    mockD1BySql(() => ({ results: [], meta: { changes: 1 } }));

    const { DELETE } = await import("../../app/api/backy/pull-key/route");
    const res = await DELETE(writeReq("DELETE"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revoked).toBe(true);
  });

  test("returns revoked:false when no key existed", async () => {
    mockD1BySql(() => ({ results: [], meta: { changes: 0 } }));

    const { DELETE } = await import("../../app/api/backy/pull-key/route");
    const res = await DELETE(writeReq("DELETE"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revoked).toBe(false);
  });
});
