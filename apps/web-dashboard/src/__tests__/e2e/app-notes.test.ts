import { beforeAll, describe, expect, test } from "vitest";
import { humanApi, jsonBody, makeSession, syncSessions } from "./harness";

describe("E2E: App Notes API", () => {
  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    const res = await syncSessions([
      makeSession({
        app_name: "VS Code",
        bundle_id: "com.microsoft.VSCode",
        window_title: "index.ts",
        url: null,
        start_time: now - 600,
        duration: 600,
      }),
      makeSession({
        app_name: "Safari",
        bundle_id: "com.apple.Safari",
        window_title: "Example",
        url: "https://example.com",
        start_time: now - 300,
        duration: 300,
      }),
    ]);
    expect(res.status).toBe(202);
  });

  test("GET /api/apps lists tracked apps", async () => {
    const res = await humanApi("/api/apps");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.apps)).toBe(true);
    expect(body.apps.length).toBeGreaterThan(0);
    expect(typeof body.apps[0].bundleId).toBe("string");
    expect(typeof body.apps[0].appName).toBe("string");
  });

  test("GET /api/apps/notes returns notes list", async () => {
    const res = await humanApi("/api/apps/notes");
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).notes)).toBe(true);
  });

  test("PUT /api/apps/notes creates a note", async () => {
    const res = await humanApi(
      "/api/apps/notes",
      jsonBody("PUT", { bundleId: "com.apple.Safari", note: "Web browsing" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bundleId).toBe("com.apple.Safari");
    expect(body.note).toBe("Web browsing");
  });

  test("GET /api/apps/notes lists the created note", async () => {
    const res = await humanApi("/api/apps/notes");
    const notes = (await res.json()).notes as Array<{ bundleId: string; note: string }>;
    expect(notes.find((n) => n.bundleId === "com.apple.Safari")?.note).toBe("Web browsing");
  });

  test("PUT /api/apps/notes updates the note", async () => {
    const res = await humanApi(
      "/api/apps/notes",
      jsonBody("PUT", { bundleId: "com.apple.Safari", note: "Updated note" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe("Updated note");
  });

  test("PUT /api/apps/notes with note > 500 chars returns 400", async () => {
    const res = await humanApi(
      "/api/apps/notes",
      jsonBody("PUT", { bundleId: "com.apple.Safari", note: "x".repeat(501) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("500 characters");
  });

  test("DELETE /api/apps/notes removes the note", async () => {
    const res = await humanApi(
      "/api/apps/notes",
      jsonBody("DELETE", { bundleId: "com.apple.Safari" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });

  test("GET /api/apps/notes is empty after delete", async () => {
    const res = await humanApi("/api/apps/notes");
    const notes = (await res.json()).notes as Array<{ bundleId: string }>;
    expect(notes.find((n) => n.bundleId === "com.apple.Safari")).toBeUndefined();
  });
});
