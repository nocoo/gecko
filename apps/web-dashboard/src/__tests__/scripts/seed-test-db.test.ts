import { describe, expect, test } from "vitest";
import {
  cfLocalOutputComplete,
  d1MigrationsComplete,
  d1RawComplete,
  markerSql,
  runCf,
  seedSql,
  TEST_API_KEY,
} from "../../../scripts/seed-test-db";
import { PRODUCTION_DB_ID as BINDING_PROD } from "../../../scripts/verify-test-bindings";

const MIGRATION_OK = `[
  { "name": "0001_cloud_init.sql", "status": "✅" },
  { "name": "0009_add_analysis_claim.sql", "status": "✅" }
]`;
const RAW_OK = `[
  {
    "success": true,
    "results": { "columns": [], "rows": [] },
    "meta": { "served_by": "miniflare.db", "changes": 1 }
  }
]`;

describe("seed-test-db", () => {
  test("marker sql records env and run id", () => {
    const sql = markerSql("run-1");
    expect(sql).toContain("_test_marker");
    expect(sql).toContain("'test'");
    expect(sql).toContain("run-1");
  });

  test("seed sql uses hashed API key and never the production db id", () => {
    const sql = seedSql();
    expect(sql).toContain("api_keys");
    expect(sql).not.toContain(TEST_API_KEY.slice(3));
    expect(sql).not.toContain(BINDING_PROD);
  });

  test("migration output is complete when every row succeeded or none remain", () => {
    expect(d1MigrationsComplete("still running")).toBe(false);
    expect(d1MigrationsComplete('[{ "name": "0001.sql", "status": "❌" }]')).toBe(false);
    expect(d1MigrationsComplete(MIGRATION_OK)).toBe(true);
    expect(d1MigrationsComplete("[]")).toBe(true);
    expect(cfLocalOutputComplete(["d1", "migrations", "apply", "id"], MIGRATION_OK)).toBe(true);
  });

  test("raw output is complete only after a successful result array", () => {
    expect(d1RawComplete("[]")).toBe(false);
    expect(d1RawComplete('[{ "success": false }]')).toBe(false);
    expect(d1RawComplete(RAW_OK)).toBe(true);
    expect(cfLocalOutputComplete(["d1", "raw", "id"], RAW_OK)).toBe(true);
    expect(cfLocalOutputComplete(["d1", "query", "id"], RAW_OK)).toBe(true);
  });

  test("runCf treats hung-but-successful local output as done", async () => {
    const script = `process.stdout.write(${JSON.stringify(`${MIGRATION_OK}\n`)}); setInterval(() => {}, 10000);`;
    const result = await runCf(["d1", "migrations", "apply", "id"], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 5000,
      command: ["node", "-e", script],
    });
    expect(result.code).toBe(0);
    expect(d1MigrationsComplete(result.stdout)).toBe(true);
  });

  test("runCf times out when local output never completes", async () => {
    await expect(
      runCf(["d1", "raw", "id"], {
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 200,
        command: ["node", "-e", "setInterval(() => {}, 10000)"],
      }),
    ).rejects.toThrow(/timed out/);
  });
});
