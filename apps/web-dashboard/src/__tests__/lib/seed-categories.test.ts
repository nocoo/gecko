import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { DEFAULT_CATEGORIES, BUNDLE_ID_MAPPINGS } from "../../lib/default-categories";

// ---------------------------------------------------------------------------
// seed-categories tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = mock((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              results,
              success: true,
              meta: { changes: results.length, last_row_id: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

describe("seedDefaultCategories", () => {
  test("seeds 4 default categories when user has none", async () => {
    // Response 1: COUNT query returns 0
    // Response 2: INSERT categories
    // Responses 3+: INSERT mappings (batched)
    const mappingCount = BUNDLE_ID_MAPPINGS.size;
    const batchCount = Math.ceil(mappingCount / 25);
    const responses: unknown[][] = [
      [{ cnt: 0 }], // COUNT
      [],            // INSERT categories
      ...Array(batchCount).fill([]), // INSERT mapping batches
    ];

    const { calls } = mockD1(responses);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");

    const result = await seedDefaultCategories("user-123");
    expect(result).toBe(true);

    // First call: COUNT check
    expect(calls[0].sql).toContain("COUNT(*)");
    expect(calls[0].params).toEqual(["user-123"]);

    // Second call: INSERT 4 default categories
    expect(calls[1].sql).toContain("INSERT INTO categories");
    // 4 categories × 6 params = 24
    expect(calls[1].params).toHaveLength(24);

    // Verify is_default=1 is hardcoded in SQL, not in params
    expect(calls[1].sql).toContain("1, ?");

    // Verify all 4 slugs are in the params
    const slugsInParams = calls[1].params.filter((p) =>
      ["system-core", "system-app", "browser", "application"].includes(p as string),
    );
    expect(slugsInParams).toHaveLength(4);
  });

  test("skips seeding when user already has categories", async () => {
    // COUNT returns 2 — user already has categories
    const { calls } = mockD1([[{ cnt: 2 }]]);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");

    const result = await seedDefaultCategories("user-123");
    expect(result).toBe(false);

    // Only the COUNT query should have been executed
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("COUNT(*)");
  });

  test("auto-maps known bundle_ids to default categories", async () => {
    const mappingCount = BUNDLE_ID_MAPPINGS.size;
    const batchCount = Math.ceil(mappingCount / 25);
    const responses: unknown[][] = [
      [{ cnt: 0 }],
      [],
      ...Array(batchCount).fill([]),
    ];

    const { calls } = mockD1(responses);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");

    await seedDefaultCategories("user-123");

    // Mapping batch calls start at index 2
    const mappingCalls = calls.slice(2);
    expect(mappingCalls.length).toBe(batchCount);

    // Each mapping call should be an INSERT OR IGNORE
    for (const call of mappingCalls) {
      expect(call.sql).toContain("INSERT OR IGNORE INTO app_category_mappings");
    }

    // Total params across all mapping batches: mappingCount * 3 (user_id, bundle_id, category_id)
    const totalParams = mappingCalls.reduce((sum, c) => sum + c.params.length, 0);
    expect(totalParams).toBe(mappingCount * 3);

    // Every mapping call should include the user_id
    for (const call of mappingCalls) {
      expect(call.params[0]).toBe("user-123");
    }
  });

  test("respects D1 batch size limit of 25 rows per INSERT", async () => {
    const mappingCount = BUNDLE_ID_MAPPINGS.size;
    const batchCount = Math.ceil(mappingCount / 25);
    const responses: unknown[][] = [
      [{ cnt: 0 }],
      [],
      ...Array(batchCount).fill([]),
    ];

    const { calls } = mockD1(responses);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");

    await seedDefaultCategories("user-123");

    const mappingCalls = calls.slice(2);

    // All batches except possibly the last should have exactly 25 × 3 = 75 params
    for (let i = 0; i < mappingCalls.length - 1; i++) {
      expect(mappingCalls[i].params.length).toBe(75);
    }

    // Last batch should have the remainder
    const lastBatchRows = mappingCount % 25 || 25;
    const lastCall = mappingCalls[mappingCalls.length - 1];
    expect(lastCall.params.length).toBe(lastBatchRows * 3);
  });

  test("each default category gets a unique UUID", async () => {
    const mappingCount = BUNDLE_ID_MAPPINGS.size;
    const batchCount = Math.ceil(mappingCount / 25);
    const responses: unknown[][] = [
      [{ cnt: 0 }],
      [],
      ...Array(batchCount).fill([]),
    ];

    const { calls } = mockD1(responses);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");

    await seedDefaultCategories("user-123");

    // Extract the UUIDs from the INSERT params (every 6th param starting at index 0)
    const insertParams = calls[1].params;
    const uuids: string[] = [];
    for (let i = 0; i < insertParams.length; i += 6) {
      uuids.push(insertParams[i] as string);
    }

    expect(uuids).toHaveLength(4);
    // All should be unique
    expect(new Set(uuids).size).toBe(4);
    // All should look like UUIDs
    for (const uuid of uuids) {
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  test("all default categories use the same user_id", async () => {
    const mappingCount = BUNDLE_ID_MAPPINGS.size;
    const batchCount = Math.ceil(mappingCount / 25);
    const responses: unknown[][] = [
      [{ cnt: 0 }],
      [],
      ...Array(batchCount).fill([]),
    ];

    const { calls } = mockD1(responses);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");

    await seedDefaultCategories("user-abc");

    // user_id is every 6th param starting at index 1 in the INSERT categories call
    const insertParams = calls[1].params;
    for (let i = 1; i < insertParams.length; i += 6) {
      expect(insertParams[i]).toBe("user-abc");
    }
  });

  test("is idempotent — second call is a no-op", async () => {
    // First call: user has 0 categories → seed
    const mappingCount = BUNDLE_ID_MAPPINGS.size;
    const batchCount = Math.ceil(mappingCount / 25);
    const responsesFirst: unknown[][] = [
      [{ cnt: 0 }],
      [],
      ...Array(batchCount).fill([]),
    ];
    const { calls: calls1 } = mockD1(responsesFirst);
    const { seedDefaultCategories } = await import("../../lib/seed-categories");
    await seedDefaultCategories("user-123");
    const firstCallCount = calls1.length;
    expect(firstCallCount).toBeGreaterThan(1);

    // Second call: user now has 4 categories → skip
    const { calls: calls2 } = mockD1([[{ cnt: 4 }]]);
    const result = await seedDefaultCategories("user-123");
    expect(result).toBe(false);
    expect(calls2).toHaveLength(1); // Only the COUNT query
  });
});
