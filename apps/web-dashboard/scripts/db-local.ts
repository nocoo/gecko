import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { d1MigrationsComplete, runCf } from "./seed-test-db";

export const LOCAL_DB_ID = "aaaaaaaa-0000-4000-8000-000000000001";

export function localPersistPath(cwd = process.cwd()): string {
  return resolve(cwd, ".cloudflare/local");
}

export async function applyLocalMigrations(cwd = process.cwd()): Promise<number> {
  const persist = localPersistPath(cwd);
  mkdirSync(persist, { recursive: true });
  const result = await runCf(
    [
      "d1",
      "migrations",
      "apply",
      LOCAL_DB_ID,
      "--local",
      "--persist-to",
      persist,
      "--dir",
      "migrations",
    ],
    {
      cwd,
      env: { ...process.env, GECKO_RESOURCE_ENV: "local" },
      timeoutMs: 60_000,
    },
  );
  if (result.code !== 0 || !d1MigrationsComplete(result.stdout)) {
    throw new Error(`local migrations failed: ${result.stderr || result.stdout}`);
  }
  return 0;
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("db-local.ts") || entry.endsWith("db-local")) {
  applyLocalMigrations().then((code) => process.exit(code));
}
