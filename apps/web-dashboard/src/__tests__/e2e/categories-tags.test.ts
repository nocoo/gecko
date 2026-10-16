import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { humanApi, jsonBody, makeSession, syncSessions } from "./harness";

async function json(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await humanApi(path, init);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("E2E: Categories CRUD", () => {
  let customCategoryId = "";

  test("GET /api/categories seeds defaults on first access", async () => {
    const { status, body } = await json("/api/categories");
    expect(status).toBe(200);
    const categories = body.categories as Array<{ slug: string; isDefault: boolean }>;
    const slugs = categories.filter((c) => c.isDefault).map((c) => c.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["system-core", "system-app", "browser", "application"]),
    );
  });

  test("POST /api/categories creates a custom category", async () => {
    const { status, body } = await json(
      "/api/categories",
      jsonBody("POST", { title: "E2E Custom", icon: "folder" }),
    );
    expect(status).toBe(201);
    expect(body.title).toBe("E2E Custom");
    customCategoryId = body.id as string;
  });

  test("GET /api/categories includes the new custom category", async () => {
    const { body } = await json("/api/categories");
    const custom = (
      body.categories as Array<{ id: string; title: string; isDefault: boolean }>
    ).find((c) => c.id === customCategoryId);
    expect(custom?.title).toBe("E2E Custom");
    expect(custom?.isDefault).toBe(false);
  });

  test("PUT /api/categories renames the custom category", async () => {
    const { status, body } = await json(
      "/api/categories",
      jsonBody("PUT", { id: customCategoryId, title: "E2E Renamed", icon: "globe" }),
    );
    expect(status).toBe(200);
    expect(body.title).toBe("E2E Renamed");
  });

  test("DELETE /api/categories removes the custom category", async () => {
    const { status, body } = await json(
      "/api/categories",
      jsonBody("DELETE", { id: customCategoryId }),
    );
    expect(status).toBe(200);
    expect(body.deleted).toBe(true);
    const list = await json("/api/categories");
    const categories = list.body.categories as Array<{ id: string }>;
    expect(categories.find((c) => c.id === customCategoryId)).toBeUndefined();
  });
});

describe("E2E: Tags CRUD", () => {
  let tagId = "";

  test("GET /api/tags returns a list", async () => {
    const { status, body } = await json("/api/tags");
    expect(status).toBe(200);
    expect(Array.isArray(body.tags)).toBe(true);
  });

  test("POST /api/tags creates a tag", async () => {
    const { status, body } = await json("/api/tags", jsonBody("POST", { name: "E2E Work" }));
    expect(status).toBe(201);
    expect(body.name).toBe("E2E Work");
    tagId = body.id as string;
  });

  test("GET /api/tags includes the new tag", async () => {
    const { body } = await json("/api/tags");
    const found = (body.tags as Array<{ id: string; name: string }>).find((t) => t.id === tagId);
    expect(found?.name).toBe("E2E Work");
  });

  test("PUT /api/tags renames the tag", async () => {
    const { status, body } = await json(
      "/api/tags",
      jsonBody("PUT", { id: tagId, name: "E2E Renamed Tag" }),
    );
    expect(status).toBe(200);
    expect(body.name).toBe("E2E Renamed Tag");
  });

  test("DELETE /api/tags removes the tag", async () => {
    const { status, body } = await json("/api/tags", jsonBody("DELETE", { id: tagId }));
    expect(status).toBe(200);
    expect(body.deleted).toBe(true);
  });
});

describe("E2E: Category Mappings", () => {
  let categoryId = "";
  const bundleId = "com.e2e.category-test";

  beforeAll(async () => {
    const { body } = await json("/api/categories");
    const browser = (body.categories as Array<{ id: string; slug: string }>).find(
      (c) => c.slug === "browser",
    );
    expect(browser).toBeDefined();
    categoryId = browser!.id;
    const res = await syncSessions([
      makeSession({ app_name: "E2E Category App", bundle_id: bundleId, duration: 120 }),
    ]);
    expect(res.status).toBe(202);
  });

  test("PUT /api/categories/mappings assigns an app to a category", async () => {
    const { status, body } = await json(
      "/api/categories/mappings",
      jsonBody("PUT", { mappings: [{ bundleId, categoryId }] }),
    );
    expect(status).toBe(200);
    expect(body.upserted).toBe(1);
  });

  test("GET /api/categories/mappings returns the mapping", async () => {
    const { body } = await json("/api/categories/mappings");
    const found = (body.mappings as Array<{ bundleId: string; categoryId: string }>).find(
      (m) => m.bundleId === bundleId,
    );
    expect(found?.categoryId).toBe(categoryId);
  });
});

describe("E2E: Tag Mappings", () => {
  let tag1Id = "";
  let tag2Id = "";
  const bundleId = "com.e2e.tag-test";

  beforeAll(async () => {
    const res1 = await json("/api/tags", jsonBody("POST", { name: "E2E Tag Alpha" }));
    const res2 = await json("/api/tags", jsonBody("POST", { name: "E2E Tag Beta" }));
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    tag1Id = res1.body.id as string;
    tag2Id = res2.body.id as string;
    const res = await syncSessions([
      makeSession({ app_name: "E2E Tag App", bundle_id: bundleId, duration: 60 }),
    ]);
    expect(res.status).toBe(202);
  });

  afterAll(async () => {
    await json("/api/tags", jsonBody("DELETE", { id: tag1Id }));
    await json("/api/tags", jsonBody("DELETE", { id: tag2Id }));
  });

  test("POST /api/tags/mappings assigns multiple tags to an app", async () => {
    const { status, body } = await json(
      "/api/tags/mappings",
      jsonBody("POST", { apps: [{ bundleId, tagIds: [tag1Id, tag2Id] }] }),
    );
    expect(status).toBe(200);
    expect(body.updated).toBe(1);
  });

  test("GET /api/tags/mappings returns both mappings", async () => {
    const { body } = await json("/api/tags/mappings");
    const appMappings = (body.mappings as Array<{ bundleId: string; tagId: string }>).filter(
      (m) => m.bundleId === bundleId,
    );
    expect(appMappings).toHaveLength(2);
  });

  test("POST /api/tags/mappings replaces tags", async () => {
    const { status } = await json(
      "/api/tags/mappings",
      jsonBody("POST", { apps: [{ bundleId, tagIds: [tag1Id] }] }),
    );
    expect(status).toBe(200);
    const list = await json("/api/tags/mappings");
    const appMappings = (list.body.mappings as Array<{ bundleId: string; tagId: string }>).filter(
      (m) => m.bundleId === bundleId,
    );
    expect(appMappings).toHaveLength(1);
    expect(appMappings[0]?.tagId).toBe(tag1Id);
  });

  test("POST /api/tags/mappings with empty tagIds removes all tags", async () => {
    const { status } = await json(
      "/api/tags/mappings",
      jsonBody("POST", { apps: [{ bundleId, tagIds: [] }] }),
    );
    expect(status).toBe(200);
    const list = await json("/api/tags/mappings");
    const appMappings = (list.body.mappings as Array<{ bundleId: string }>).filter(
      (m) => m.bundleId === bundleId,
    );
    expect(appMappings).toHaveLength(0);
  });
});
