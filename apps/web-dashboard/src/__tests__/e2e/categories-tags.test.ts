// E2E: Categories & Tags CRUD + Mappings round-trip.
//
// Runs against the dev:e2e server (port 10728, E2E_SKIP_AUTH=true).
// Spawns the server, waits for readiness, runs BDD-style scenarios, then shuts down.
//
// IMPORTANT: Skipped unless explicitly invoked via `bun run test:e2e`.
// Set RUN_E2E=true to run these in the general test suite.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const SHOULD_RUN = process.env.RUN_E2E === "true";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:10728";
const STARTUP_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: Subprocess | null = null;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  if (!SHOULD_RUN) return;

  // Check if server is already running
  try {
    const res = await fetch(`${BASE_URL}/api/tags`);
    if (res.status > 0) {
      console.log("[E2E] Server already running on port 10728");
      return;
    }
  } catch {
    // Not running — start it
  }

  console.log("[E2E] Starting dev:e2e server...");
  server = spawn({
    cmd: ["bun", "run", "dev:e2e"],
    cwd: import.meta.dir + "/../..",
    stdout: "ignore",
    stderr: "ignore",
  });

  await waitForServer(`${BASE_URL}/api/tags`, STARTUP_TIMEOUT_MS);
  console.log("[E2E] Server ready.");
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  if (server) {
    console.log("[E2E] Shutting down server...");
    server.kill();
    server = null;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const body = await res.json();
  return { status: res.status, body: body as Record<string, unknown> };
}

function json(data: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function put(data: unknown): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function del(data: unknown): RequestInit {
  return {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Categories CRUD
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("E2E: Categories CRUD", () => {
  let customCategoryId: string;

  test("GET /api/categories seeds defaults on first access", async () => {
    const { status, body } = await api("/api/categories");
    expect(status).toBe(200);

    const categories = body.categories as Array<{
      id: string;
      title: string;
      isDefault: boolean;
      slug: string;
    }>;

    // Should have at least the 4 defaults
    const defaults = categories.filter((c) => c.isDefault);
    expect(defaults.length).toBeGreaterThanOrEqual(4);

    const slugs = defaults.map((c) => c.slug);
    expect(slugs).toContain("system-core");
    expect(slugs).toContain("system-app");
    expect(slugs).toContain("browser");
    expect(slugs).toContain("application");
  });

  test("POST /api/categories creates a custom category", async () => {
    const { status, body } = await api(
      "/api/categories",
      json({ title: "E2E Custom", icon: "folder" }),
    );
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.title).toBe("E2E Custom");
    customCategoryId = body.id as string;
  });

  test("GET /api/categories includes the new custom category", async () => {
    const { status, body } = await api("/api/categories");
    expect(status).toBe(200);

    const categories = body.categories as Array<{
      id: string;
      title: string;
      isDefault: boolean;
    }>;
    const custom = categories.find((c) => c.id === customCategoryId);
    expect(custom).toBeDefined();
    expect(custom!.title).toBe("E2E Custom");
    expect(custom!.isDefault).toBe(false);
  });

  test("PUT /api/categories renames the custom category", async () => {
    const { status, body } = await api(
      "/api/categories",
      put({ id: customCategoryId, title: "E2E Renamed", icon: "globe" }),
    );
    expect(status).toBe(200);
    expect(body.title).toBe("E2E Renamed");
  });

  test("DELETE /api/categories removes the custom category", async () => {
    const { status, body } = await api(
      "/api/categories",
      del({ id: customCategoryId }),
    );
    expect(status).toBe(200);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const list = await api("/api/categories");
    const categories = list.body.categories as Array<{ id: string }>;
    expect(categories.find((c) => c.id === customCategoryId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Tags CRUD
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("E2E: Tags CRUD", () => {
  let tagId: string;

  test("GET /api/tags returns empty list initially (or existing tags)", async () => {
    const { status, body } = await api("/api/tags");
    expect(status).toBe(200);
    expect(Array.isArray(body.tags)).toBe(true);
  });

  test("POST /api/tags creates a tag", async () => {
    const { status, body } = await api(
      "/api/tags",
      json({ name: "E2E Work" }),
    );
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.name).toBe("E2E Work");
    tagId = body.id as string;
  });

  test("GET /api/tags includes the new tag", async () => {
    const { status, body } = await api("/api/tags");
    expect(status).toBe(200);

    const tags = body.tags as Array<{ id: string; name: string }>;
    const found = tags.find((t) => t.id === tagId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("E2E Work");
  });

  test("PUT /api/tags renames the tag", async () => {
    const { status, body } = await api(
      "/api/tags",
      put({ id: tagId, name: "E2E Renamed Tag" }),
    );
    expect(status).toBe(200);
    expect(body.name).toBe("E2E Renamed Tag");
  });

  test("DELETE /api/tags removes the tag", async () => {
    const { status, body } = await api("/api/tags", del({ id: tagId }));
    expect(status).toBe(200);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const list = await api("/api/tags");
    const tags = list.body.tags as Array<{ id: string }>;
    expect(tags.find((t) => t.id === tagId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Category Mappings
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("E2E: Category Mappings", () => {
  let categoryId: string;
  const bundleId = "com.e2e.category-test";

  beforeAll(async () => {
    if (!SHOULD_RUN) return;

    // Ensure categories are seeded and get a category ID
    const { body } = await api("/api/categories");
    const categories = body.categories as Array<{
      id: string;
      slug: string;
    }>;
    const browser = categories.find((c) => c.slug === "browser");
    expect(browser).toBeDefined();
    categoryId = browser!.id;

    // Sync a session so the app appears in /api/apps
    await fetch(`${BASE_URL}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: [
          {
            id: crypto.randomUUID(),
            app_name: "E2E Category App",
            window_title: "Test",
            url: null,
            start_time: Math.floor(Date.now() / 1000) - 600,
            duration: 120,
            bundle_id: bundleId,
            tab_title: null,
            tab_count: null,
            document_path: null,
            is_full_screen: false,
            is_minimized: false,
          },
        ],
      }),
    });

    // Wait for queue drain
    await new Promise((r) => setTimeout(r, 4000));
  });

  test("PUT /api/categories/mappings assigns an app to a category", async () => {
    const { status, body } = await api(
      "/api/categories/mappings",
      put({ mappings: [{ bundleId, categoryId }] }),
    );
    expect(status).toBe(200);
    expect(body.upserted).toBe(1);
  });

  test("GET /api/categories/mappings returns the mapping", async () => {
    const { status, body } = await api("/api/categories/mappings");
    expect(status).toBe(200);

    const mappings = body.mappings as Array<{
      bundleId: string;
      categoryId: string;
    }>;
    const found = mappings.find((m) => m.bundleId === bundleId);
    expect(found).toBeDefined();
    expect(found!.categoryId).toBe(categoryId);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Tag Mappings (many-to-many)
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("E2E: Tag Mappings", () => {
  let tag1Id: string;
  let tag2Id: string;
  const bundleId = "com.e2e.tag-test";

  beforeAll(async () => {
    if (!SHOULD_RUN) return;

    // Create two tags
    const res1 = await api("/api/tags", json({ name: "E2E Tag Alpha" }));
    expect(res1.status).toBe(201);
    tag1Id = res1.body.id as string;

    const res2 = await api("/api/tags", json({ name: "E2E Tag Beta" }));
    expect(res2.status).toBe(201);
    tag2Id = res2.body.id as string;

    // Sync a session for this bundle
    await fetch(`${BASE_URL}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: [
          {
            id: crypto.randomUUID(),
            app_name: "E2E Tag App",
            window_title: "Test",
            url: null,
            start_time: Math.floor(Date.now() / 1000) - 600,
            duration: 60,
            bundle_id: bundleId,
            tab_title: null,
            tab_count: null,
            document_path: null,
            is_full_screen: false,
            is_minimized: false,
          },
        ],
      }),
    });

    await new Promise((r) => setTimeout(r, 4000));
  });

  test("POST /api/tags/mappings assigns multiple tags to an app", async () => {
    const { status, body } = await api(
      "/api/tags/mappings",
      json({ apps: [{ bundleId, tagIds: [tag1Id, tag2Id] }] }),
    );
    expect(status).toBe(200);
    expect(body.updated).toBe(1);
  });

  test("GET /api/tags/mappings returns both mappings", async () => {
    const { status, body } = await api("/api/tags/mappings");
    expect(status).toBe(200);

    const mappings = body.mappings as Array<{
      bundleId: string;
      tagId: string;
    }>;
    const appMappings = mappings.filter((m) => m.bundleId === bundleId);
    expect(appMappings.length).toBe(2);

    const tagIds = appMappings.map((m) => m.tagId).sort();
    expect(tagIds).toContain(tag1Id);
    expect(tagIds).toContain(tag2Id);
  });

  test("POST /api/tags/mappings replaces tags (remove one)", async () => {
    const { status, body } = await api(
      "/api/tags/mappings",
      json({ apps: [{ bundleId, tagIds: [tag1Id] }] }),
    );
    expect(status).toBe(200);
    expect(body.updated).toBe(1);

    // Verify only tag1 remains
    const list = await api("/api/tags/mappings");
    const mappings = list.body.mappings as Array<{
      bundleId: string;
      tagId: string;
    }>;
    const appMappings = mappings.filter((m) => m.bundleId === bundleId);
    expect(appMappings.length).toBe(1);
    expect(appMappings[0].tagId).toBe(tag1Id);
  });

  test("POST /api/tags/mappings with empty tagIds removes all tags", async () => {
    const { status, body } = await api(
      "/api/tags/mappings",
      json({ apps: [{ bundleId, tagIds: [] }] }),
    );
    expect(status).toBe(200);

    // Verify no mappings for this app
    const list = await api("/api/tags/mappings");
    const mappings = list.body.mappings as Array<{
      bundleId: string;
      tagId: string;
    }>;
    const appMappings = mappings.filter((m) => m.bundleId === bundleId);
    expect(appMappings.length).toBe(0);
  });

  // Cleanup
  afterAll(async () => {
    if (!SHOULD_RUN) return;
    // Remove test tags
    await api("/api/tags", del({ id: tag1Id }));
    await api("/api/tags", del({ id: tag2Id }));
  });
});
