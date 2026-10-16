import { describe, expect, test } from "vitest";
import { humanApi, jsonBody } from "./harness";

describe("E2E: API Keys round-trip", () => {
  let createdKeyId = "";

  test("POST /api/keys returns 201 with key material", async () => {
    const res = await humanApi("/api/keys", jsonBody("POST", { name: "E2E Test Device" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.key).toMatch(/^gk_/);
    expect(body.deviceId).toBeDefined();
    expect(body.name).toBe("E2E Test Device");
    createdKeyId = body.id;
  });

  test("POST /api/keys without name returns 400", async () => {
    const res = await humanApi("/api/keys", jsonBody("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("name");
  });

  test("GET /api/keys contains the created key", async () => {
    const res = await humanApi("/api/keys");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.keys)).toBe(true);
    const found = body.keys.find((k: { id: string }) => k.id === createdKeyId);
    expect(found).toBeDefined();
    expect(found.name).toBe("E2E Test Device");
  });

  test("PATCH /api/keys/[id] renames the key", async () => {
    const res = await humanApi(
      `/api/keys/${createdKeyId}`,
      jsonBody("PATCH", { name: "Renamed Device" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(createdKeyId);
    expect(body.name).toBe("Renamed Device");
  });

  test("PATCH /api/keys/[bad-id] returns 404", async () => {
    const res = await humanApi(
      "/api/keys/non-existent-id-000",
      jsonBody("PATCH", { name: "Ghost Key" }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeDefined();
  });

  test("DELETE /api/keys/[id] revokes the key", async () => {
    const res = await humanApi(`/api/keys/${createdKeyId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });

  test("GET /api/keys no longer includes the deleted key", async () => {
    const res = await humanApi("/api/keys");
    const body = await res.json();
    expect(body.keys.find((k: { id: string }) => k.id === createdKeyId)).toBeUndefined();
  });
});
