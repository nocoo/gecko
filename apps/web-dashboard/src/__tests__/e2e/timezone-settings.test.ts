import { describe, expect, test } from "vitest";
import { humanApi, jsonBody } from "./harness";

describe("E2E: Timezone Settings API", () => {
  test("GET /api/settings/timezone returns a timezone", async () => {
    const res = await humanApi("/api/settings/timezone");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.timezone).toBe("string");
    expect(body.timezone.length).toBeGreaterThan(0);
  });

  test("PUT /api/settings/timezone updates timezone", async () => {
    const res = await humanApi(
      "/api/settings/timezone",
      jsonBody("PUT", { timezone: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).timezone).toBe("America/New_York");
  });

  test("GET /api/settings/timezone reads back updated timezone", async () => {
    const res = await humanApi("/api/settings/timezone");
    expect(res.status).toBe(200);
    expect((await res.json()).timezone).toBe("America/New_York");
  });

  test("PUT /api/settings/timezone with invalid timezone returns 400", async () => {
    const res = await humanApi(
      "/api/settings/timezone",
      jsonBody("PUT", { timezone: "Not/A/Zone" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  test("PUT /api/settings/timezone with missing timezone returns 400", async () => {
    const res = await humanApi("/api/settings/timezone", jsonBody("PUT", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  test("PUT /api/settings/timezone restores original timezone", async () => {
    const res = await humanApi(
      "/api/settings/timezone",
      jsonBody("PUT", { timezone: "Asia/Shanghai" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).timezone).toBe("Asia/Shanghai");
  });
});
