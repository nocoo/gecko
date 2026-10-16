import { describe, expect, test, vi } from "vitest";
import * as access from "../../lib/access";
import {
  extractBearerToken,
  getUserTimezone,
  jsonError,
  jsonOk,
  requireApiKey,
  requireSession,
} from "../../lib/api-helpers";
import { humanRequest, installHumanTestEnv, mockD1 } from "../test-env";

describe("requireSession", () => {
  test("returns stub user in local test stub mode", async () => {
    const result = await requireSession(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(result.user?.userId).toBe("e2e-test-user");
    expect(result.user?.email).toBe("e2e@test.local");
    expect(result.error).toBeUndefined();
  });

  test("returns 401 when jwt mode has no assertion", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const result = await requireSession(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(result.error?.status).toBe(401);
  });

  test("returns 403 when write origin is missing", async () => {
    const req = new Request("http://127.0.0.1:17018/api/tags", { method: "POST" });
    const result = await requireSession(req);
    expect(result.error?.status).toBe(403);
  });

  test("rethrows non-AccessError from identity resolution", async () => {
    const spy = vi.spyOn(access, "resolveHumanUser").mockRejectedValue(new Error("boom"));
    await expect(requireSession(humanRequest("http://127.0.0.1:17018/api/me"))).rejects.toThrow(
      "boom",
    );
    spy.mockRestore();
  });
});

describe("requireApiKey", () => {
  test("returns 401 when no Authorization header", async () => {
    const result = await requireApiKey(humanRequest("http://127.0.0.1:17018/api/sync"));
    expect(result.error?.status).toBe(401);
  });

  test("returns 401 when API key is invalid", async () => {
    const { db } = mockD1([[]]);
    db.autoApiKey = false;
    const result = await requireApiKey(
      humanRequest("http://127.0.0.1:17018/api/sync", {
        headers: { Authorization: "Bearer gk_invalid" },
      }),
    );
    expect(result.error?.status).toBe(401);
  });

  test("returns user when API key is valid", async () => {
    const result = await requireApiKey(
      humanRequest("http://127.0.0.1:17018/api/sync", {
        headers: { Authorization: "Bearer gk_valid_key_12345" },
      }),
    );
    expect(result.user?.userId).toBe("e2e-test-user");
    expect(result.user?.deviceId).toBe("e2e-test-device");
  });

  test("swallows last_used update failures", async () => {
    const { db } = mockD1([[]]);
    db.throwOn = (sql) => (/LAST_USED/i.test(sql) ? new Error("simulated D1 outage") : undefined);
    const result = await requireApiKey(
      humanRequest("http://127.0.0.1:17018/api/sync", {
        headers: { Authorization: "Bearer gk_valid_key_12345" },
      }),
    );
    expect(result.user?.userId).toBe("e2e-test-user");
  });

  test("never stubs when TEST_AUTH_MODE is stub", async () => {
    const { db } = mockD1([[]]);
    db.autoApiKey = false;
    const result = await requireApiKey(humanRequest("http://127.0.0.1:17018/api/sync"));
    expect(result.error?.status).toBe(401);
  });
});

describe("extractBearerToken", () => {
  test("extracts token from valid Authorization header", () => {
    const req = humanRequest("http://127.0.0.1:17018", {
      headers: { Authorization: "Bearer gk_abc123" },
    });
    expect(extractBearerToken(req)).toBe("gk_abc123");
  });

  test("returns null when no Authorization header", () => {
    expect(extractBearerToken(humanRequest("http://127.0.0.1:17018"))).toBeNull();
  });

  test("returns null for non-Bearer scheme", () => {
    const req = humanRequest("http://127.0.0.1:17018", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(extractBearerToken(req)).toBeNull();
  });

  test("returns null for empty Bearer value", () => {
    const req = humanRequest("http://127.0.0.1:17018", {
      headers: { Authorization: "Bearer " },
    });
    expect(extractBearerToken(req)).toBeNull();
  });

  test("handles case-insensitive Bearer prefix", () => {
    const req = humanRequest("http://127.0.0.1:17018", {
      headers: { Authorization: "bearer gk_abc123" },
    });
    expect(extractBearerToken(req)).toBe("gk_abc123");
  });
});

describe("json response helpers", () => {
  test("jsonOk returns 200 with data", async () => {
    const res = jsonOk({ foo: "bar" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ foo: "bar" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("jsonOk supports custom status", async () => {
    const res = jsonOk({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  test("jsonOk merges Headers and array header inits", async () => {
    const fromHeaders = jsonOk({ ok: true }, 200, new Headers({ "x-a": "1" }));
    expect(fromHeaders.headers.get("x-a")).toBe("1");
    const fromArray = jsonOk({ ok: true }, 200, [["x-b", "2"]]);
    expect(fromArray.headers.get("x-b")).toBe("2");
    const fromRecord = jsonOk({ ok: true }, 200, { "x-c": "3" });
    expect(fromRecord.headers.get("x-c")).toBe("3");
  });

  test("jsonError returns error envelope", async () => {
    const res = jsonError("Not found", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("getUserTimezone", () => {
  test("returns user's timezone from settings", async () => {
    mockD1([[{ user_id: "u1", key: "timezone", value: "America/New_York", updated_at: 100 }]]);
    await expect(getUserTimezone("u1")).resolves.toBe("America/New_York");
  });

  test("falls back to default when no setting", async () => {
    mockD1([[]]);
    await expect(getUserTimezone("u1")).resolves.toBe("Asia/Shanghai");
  });

  test("falls back to default for invalid timezone", async () => {
    mockD1([[{ user_id: "u1", key: "timezone", value: "Invalid/Timezone", updated_at: 100 }]]);
    await expect(getUserTimezone("u1")).resolves.toBe("Asia/Shanghai");
  });

  test("rethrows D1 failures", async () => {
    const { db } = mockD1([[]]);
    db.throwOn = () => new Error("DB connection failed");
    await expect(getUserTimezone("u1")).rejects.toThrow("DB connection failed");
  });
});
