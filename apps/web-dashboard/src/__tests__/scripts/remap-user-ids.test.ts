import { describe, expect, test } from "vitest";
import { USER_ID_TABLES, type UserIdTable } from "../../../scripts/cutover-schema";
import {
  main,
  parseMapping,
  planRemap,
  type RemapStore,
  runRemap,
  type StoredRow,
} from "../../../scripts/remap-user-ids";
import { PRODUCTION_DB_ID } from "../../../scripts/worker-stage";

function memoryStore(
  rows: Partial<Record<UserIdTable, StoredRow[]>>,
  extra: string[] = [],
): { store: RemapStore; applied: string[] } {
  const applied: string[] = [];
  return {
    applied,
    store: {
      async tablesWithUserId() {
        return [...USER_ID_TABLES, ...extra];
      },
      async loadTable(table) {
        return rows[table] ?? [];
      },
      async applyStatements(sql) {
        applied.push(...sql);
      },
    },
  };
}

const mapping = { "old-google-1": "Architie@gmail.com" };

describe("remap-user-ids", () => {
  test("mapping emails are lowercased and invalid values are rejected", () => {
    const parsed = parseMapping(mapping);
    expect(parsed.get("old-google-1")).toBe("architie@gmail.com");
    expect(() => parseMapping({ a: "not-an-email" })).toThrow(/emails/);
    expect(() => parseMapping([])).toThrow(/object/);
  });

  test("dry-run reports redacted ids and does not apply SQL", async () => {
    const { store, applied } = memoryStore({
      settings: [{ user_id: "old-google-1", key: "timezone", value: "Asia/Shanghai" }],
    });
    const report = await runRemap([], { store, mapping });
    expect(report.ok).toBe(true);
    expect(report.moves[0]?.from).toMatch(/^id:/);
    expect(JSON.stringify(report.moves)).not.toContain("old-google-1");
    expect(JSON.stringify(report.moves)).not.toContain("architie@gmail.com");
    expect(applied).toHaveLength(0);
    expect(report.statements.some((sql) => sql.includes("OR IGNORE"))).toBe(false);
  });

  test("many-to-one mappings and unique key collisions block by default", async () => {
    const { store: mergeStore } = memoryStore({
      settings: [{ user_id: "old-a", key: "timezone", value: "UTC" }],
    });
    const many = await planRemap(
      parseMapping({ "old-a": "a@b.com", "old-b": "a@b.com" }),
      mergeStore,
    );
    expect(many.ok).toBe(false);
    expect(many.blocked.join(" ")).toMatch(/many-to-one/);
    const { store } = memoryStore({
      settings: [
        { user_id: "old-google-1", key: "timezone", value: "UTC" },
        { user_id: "architie@gmail.com", key: "timezone", value: "Asia/Shanghai" },
      ],
    });
    const conflict = await runRemap([], { store, mapping });
    expect(conflict.ok).toBe(false);
    expect(conflict.conflicts[0]?.table).toBe("settings");
  });

  test("explicit conflict resolution emits a delete then update", async () => {
    const { store } = memoryStore({
      settings: [
        { user_id: "old-google-1", key: "timezone", value: "UTC" },
        { user_id: "architie@gmail.com", key: "timezone", value: "Asia/Shanghai" },
      ],
    });
    const report = await planRemap(parseMapping(mapping), store, {
      resolutions: [{ table: "settings", key: "timezone", keep: "target" }],
    });
    expect(report.ok).toBe(true);
    expect(report.statements[0]).toMatch(/^DELETE FROM settings/);
    expect(report.statements[0]).toContain("old-google-1");
    expect(report.statements.at(-1)).toMatch(/^UPDATE settings SET user_id/);
  });

  test("extra user_id tables block remap", async () => {
    const { store } = memoryStore({}, ["mystery"]);
    const report = await planRemap(parseMapping(mapping), store);
    expect(report.ok).toBe(false);
    expect(report.blocked.join(" ")).toMatch(/mystery/);
  });

  test("statement budget leaves remaining ids for resume", async () => {
    const { store } = memoryStore({
      settings: [
        { user_id: "old-a", key: "timezone", value: "UTC" },
        { user_id: "old-b", key: "ai", value: "x" },
      ],
    });
    const map = parseMapping({ "old-a": "a@b.com", "old-b": "c@d.com" });
    const first = await planRemap(map, store, { statementBudget: 1 });
    expect(first.ok).toBe(true);
    expect(first.statements).toHaveLength(1);
    expect(first.remainingOldIds).toEqual(["old-b"]);
    const second = await planRemap(map, store, {
      statementBudget: 1,
      completedOldIds: ["old-a"],
    });
    expect(second.remainingOldIds).toEqual([]);
    expect(second.statements[0]).toContain("old-b");
  });

  test("production apply requires approval, silence, and a recovery checkpoint", async () => {
    const { store, applied } = memoryStore({
      settings: [{ user_id: "old-google-1", key: "timezone", value: "UTC" }],
    });
    await expect(
      runRemap(["--apply", "--database-id", PRODUCTION_DB_ID], { store, mapping }),
    ).rejects.toThrow(/approve gecko-remap/);
    await expect(
      runRemap(["--apply", "--database-id", PRODUCTION_DB_ID, "--approve", "gecko-remap"], {
        store,
        mapping,
      }),
    ).rejects.toThrow(/silence-confirmed/);
    await expect(
      runRemap(
        [
          "--apply",
          "--database-id",
          PRODUCTION_DB_ID,
          "--approve",
          "gecko-remap",
          "--silence-confirmed",
        ],
        { store, mapping },
      ),
    ).rejects.toThrow(/recovery-checkpoint/);
    const report = await runRemap(
      [
        "--apply",
        "--database-id",
        PRODUCTION_DB_ID,
        "--approve",
        "gecko-remap",
        "--silence-confirmed",
        "--recovery-checkpoint",
        "bookmark-1",
      ],
      { store, mapping },
    );
    expect(report.ok).toBe(true);
    expect(applied).toHaveLength(1);
  });

  test("main without an injected store refuses implicit remote remap", async () => {
    await expect(main([])).rejects.toThrow(/injected store/);
  });

  test("main with a store dry-runs and local apply uses the local token", async () => {
    const { store, applied } = memoryStore({
      settings: [{ user_id: "old-google-1", key: "timezone", value: "UTC" }],
    });
    const report = await main([], { store, mapping });
    expect(report.ok).toBe(true);
    expect(applied).toHaveLength(0);
    await runRemap(["--apply", "--approve", "gecko-remap-local"], { store, mapping });
    expect(applied).toHaveLength(1);
  });

  test("empty mapping, empty ids, missing tables, and oversize single ids are blocked", async () => {
    expect(() => parseMapping({})).toThrow(/empty/);
    expect(() => parseMapping({ "": "a@b.com" })).toThrow(/empty id/);
    const { store: missing } = memoryStore({});
    missing.tablesWithUserId = async () => ["focus_sessions"];
    const missingReport = await planRemap(parseMapping(mapping), missing);
    expect(missingReport.blocked.join(" ")).toMatch(/missing user_id tables/);
    const { store } = memoryStore({
      settings: [{ user_id: "old-google-1", key: "timezone", value: "UTC" }],
    });
    const oversize = await planRemap(parseMapping(mapping), store, { statementBudget: 0 });
    expect(oversize.blocked.join(" ")).toMatch(/exceeds statement budget/);
  });

  test("allow-merges, keep-source, and empty-statement apply succeed", async () => {
    const { store } = memoryStore({
      settings: [{ user_id: "old-a", key: "timezone", value: "UTC" }],
    });
    const merged = await planRemap(
      parseMapping({ "old-a": "a@b.com", "old-b": "a@b.com" }),
      store,
      { allowMerges: true },
    );
    expect(merged.ok).toBe(true);
    const { store: conflictStore } = memoryStore({
      api_keys: [
        { user_id: "old-google-1", id: "k1", key_hash: "h1", device_id: "d1" },
        { user_id: "architie@gmail.com", id: "k2", key_hash: "h2", device_id: "d1" },
      ],
    });
    const resolved = await planRemap(parseMapping(mapping), conflictStore, {
      resolutions: [{ table: "api_keys", key: "d1", keep: "source" }],
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.statements[0]).toContain("architie@gmail.com");
    const { store: empty } = memoryStore({});
    const applied = await runRemap(["--apply", "--approve", "gecko-remap-local"], {
      store: empty,
      mapping,
    });
    expect(applied.statements).toHaveLength(0);
    await expect(
      runRemap(["--apply", "--approve", "gecko-remap-local"], {
        store,
        mapping: { "old-a": "a@b.com", "old-b": "a@b.com" },
      }),
    ).rejects.toThrow(/remap blocked/);
  });
});
