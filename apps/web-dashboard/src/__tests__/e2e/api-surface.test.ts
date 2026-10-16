import { describe, expect, test } from "vitest";
import { API_SURFACE } from "./api-surface";
import { api, BASE_URL, humanHeaders, machineHeaders } from "./harness";

describe("API surface", () => {
  test("lists 50 explicit methods", () => {
    expect(API_SURFACE).toHaveLength(50);
  });

  test("GET /api/live is public and reports d1", async () => {
    const res = await api("/api/live");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storage).toBe("d1");
    expect(body.status).toBe("ok");
  });

  test("GET /api/me requires Access JWT", async () => {
    const anon = await api("/api/me");
    expect(anon.status).toBe(401);
    const ok = await api("/api/me", { headers: humanHeaders() });
    expect(ok.status).toBe(200);
    const me = await ok.json();
    expect(me.user.email).toContain("@");
  });

  test("POST /api/sync requires an API key", async () => {
    const anon = await api("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessions: [] }),
    });
    expect(anon.status).toBe(401);
    const keyed = await api("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json", ...machineHeaders() },
      body: JSON.stringify({ sessions: [] }),
    });
    expect(keyed.status).toBe(400);
  });

  test("deleted NextAuth routes are gone", async () => {
    const res = await api("/api/auth/session");
    expect([404, 405]).toContain(res.status);
  });

  test("BASE_URL is loopback", () => {
    expect(BASE_URL.startsWith("http://127.0.0.1:")).toBe(true);
  });
});
