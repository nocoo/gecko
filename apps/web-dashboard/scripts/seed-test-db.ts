import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { PRODUCTION_DB_ID, verifyTestBindings } from "./verify-test-bindings";

export const TEST_API_KEY = `gk_${"ab".repeat(32)}`;
export const TEST_EMAIL = "e2e@test.local";
export const TEST_USER_ID = TEST_EMAIL;
export const SECOND_USER_EMAIL = "other@test.local";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function markerSql(runId: string): string {
  return `CREATE TABLE IF NOT EXISTS _test_marker(key TEXT PRIMARY KEY, value TEXT);
INSERT OR REPLACE INTO _test_marker(key, value) VALUES ('env', 'test');
INSERT OR REPLACE INTO _test_marker(key, value) VALUES ('run_id', '${runId.replace(/'/g, "''")}');`;
}

export function seedSql(): string {
  const keyHash = hashKey(TEST_API_KEY);
  return `INSERT OR REPLACE INTO api_keys (id, user_id, device_id, name, key_hash, created_at)
VALUES ('seed-key', '${TEST_USER_ID}', 'e2e-test-device', 'e2e', '${keyHash}', datetime('now'));
INSERT OR REPLACE INTO settings (user_id, key, value, updated_at)
VALUES ('${TEST_USER_ID}', 'timezone', 'Asia/Shanghai', strftime('%s','now'));`;
}

function firstJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function d1MigrationsComplete(stdout: string): boolean {
  const rows = firstJsonArray(stdout);
  if (!rows) return false;
  return rows.every(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "status" in row &&
      (row as { status: unknown }).status === "✅",
  );
}

export function d1RawComplete(stdout: string): boolean {
  const rows = firstJsonArray(stdout);
  if (!rows || rows.length === 0) return false;
  return rows.every(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "success" in row &&
      (row as { success: unknown }).success === true,
  );
}

export function cfLocalOutputComplete(args: string[], stdout: string): boolean {
  if (args[0] === "d1" && args[1] === "migrations" && args[2] === "apply") {
    return d1MigrationsComplete(stdout);
  }
  if (args[0] === "d1" && args[1] === "raw") {
    return d1RawComplete(stdout);
  }
  return false;
}

function stopChild(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function forceKill(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export async function runCf(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    command?: string[];
  },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const argv = options.command ?? ["node", "node_modules/cf/bin/cf", ...args];
    const child = spawn(argv[0] ?? "node", argv.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let sawSuccess = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (code: number, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (error) reject(error);
      else resolve({ stdout, stderr, code });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      stopChild(child);
      killTimer = setTimeout(() => {
        forceKill(child);
        if (sawSuccess) finish(0);
        else finish(1, new Error(`cf ${args.join(" ")} timed out`));
      }, 1000);
    }, options.timeoutMs);

    const maybeComplete = () => {
      if (sawSuccess || settled) return;
      if (!cfLocalOutputComplete(args, stdout)) return;
      sawSuccess = true;
      clearTimeout(timer);
      stopChild(child);
      killTimer = setTimeout(() => {
        forceKill(child);
        finish(0);
      }, 1000);
    };

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      maybeComplete();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("exit", (code) => {
      if (sawSuccess) finish(0);
      else if (timedOut) finish(1, new Error(`cf ${args.join(" ")} timed out`));
      else finish(code ?? 1);
    });
    child.on("error", (err) => finish(1, err));
  });
}

export async function applyMigrations(options: {
  cwd: string;
  state: string;
  dbId: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  if (options.dbId === PRODUCTION_DB_ID) {
    throw new Error("Refusing to apply migrations to production D1");
  }
  verifyTestBindings(options.state, options.cwd, options.env);
  const result = await runCf(
    [
      "d1",
      "migrations",
      "apply",
      options.dbId,
      "--local",
      "--persist-to",
      options.state,
      "--dir",
      "migrations",
    ],
    { cwd: options.cwd, env: options.env, timeoutMs: 60_000 },
  );
  if (result.code !== 0 || !d1MigrationsComplete(result.stdout)) {
    throw new Error(`migrations apply failed: ${result.stderr || result.stdout}`);
  }
}

export async function executeLocalSql(options: {
  cwd: string;
  state: string;
  dbId: string;
  env: NodeJS.ProcessEnv;
  sql: string;
}): Promise<void> {
  if (options.dbId === PRODUCTION_DB_ID) {
    throw new Error("Refusing to execute SQL against production D1");
  }
  verifyTestBindings(options.state, options.cwd, options.env);
  const result = await runCf(
    ["d1", "raw", options.dbId, "--local", "--persist-to", options.state, "--sql", options.sql],
    { cwd: options.cwd, env: options.env, timeoutMs: 20_000 },
  );
  if (result.code !== 0 || !d1RawComplete(result.stdout)) {
    throw new Error(`d1 raw failed: ${result.stderr || result.stdout}`);
  }
}
