import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { applyMigrations, executeLocalSql, markerSql, seedSql, TEST_API_KEY } from "./seed-test-db";
import { createTestJwtIssuer, startJwksServer } from "./test-jwt";
import { isRemoteFallback, testStateRoot, verifyTestBindings } from "./verify-test-bindings";

export const TEST_DB_ID = "bbbbbbbb-0000-4000-8000-000000000001";

export async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolveReady, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Test port ${port} is already in use`)));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolveReady());
    });
  });
}

export async function waitForLive(
  base: string,
  options: { timeoutMs: number; headers?: HeadersInit; runId: string },
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < options.timeoutMs) {
    try {
      const response = await fetch(`${base}/api/live`, {
        headers: options.headers,
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const body = (await response.json()) as {
          storage?: string;
          runId?: string;
          status?: string;
        };
        if (body.storage === "d1" && body.status === "ok" && body.runId === options.runId) return;
      }
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Local Worker did not become ready at ${base}`);
}

function stopProcess(child: ChildProcess | undefined): Promise<void> {
  const pid = child?.pid;
  if (!pid) return Promise.resolve();
  return new Promise((resolveDone) => {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    const timer = setTimeout(() => {
      try {
        if (pid) process.kill(-pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveDone();
    });
  });
}

export async function runLane(tier: "l2" | "l3"): Promise<number> {
  const port = tier === "l2" ? 17018 : 27018;
  await assertPortFree(port);
  try {
    await assertPortFree(7018);
  } catch {
    throw new Error("Daily dev server on 7018 is running; stop it before L2/L3");
  }

  const root = resolve(import.meta.dirname, "..");
  mkdirSync(testStateRoot(root), { recursive: true });
  mkdirSync(resolve(root, `test-results/${tier}`), { recursive: true });
  const state = mkdtempSync(resolve(testStateRoot(root), `${tier}-`));
  const runId = randomUUID();
  const dbId = process.env.GECKO_TEST_DB_ID || TEST_DB_ID;

  const issuer = await createTestJwtIssuer();
  const jwks = await startJwksServer(issuer.jwks);
  const jwt = await issuer.sign({ email: "e2e@test.local", name: "E2E" });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GECKO_TEST_STATE: state,
    GECKO_RESOURCE_ENV: "test",
    GECKO_TEST_RUN_ID: runId,
    GECKO_TEST_DB_ID: dbId,
    GECKO_TEST_URL: `http://127.0.0.1:${port}`,
    GECKO_TEST_JWT: jwt,
    GECKO_TEST_API_KEY: TEST_API_KEY,
    TEST_AUTH_MODE: tier === "l3" ? "stub" : "jwt",
    TEST_STUB_USER_ID: "e2e@test.local",
    TEST_STUB_EMAIL: "e2e@test.local",
    CF_ACCESS_JWKS_URL: jwks.url,
  };
  delete env.CF_API_TOKEN;
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CLOUDFLARE_API_KEY;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  delete env.CF_ACCOUNT_ID;
  delete env.CLOUDFLARE_DEPLOY;
  if (isRemoteFallback(env)) {
    throw new Error("Refusing to run tests with remote Cloudflare credentials");
  }
  verifyTestBindings(state, root, env);

  let server: ChildProcess | undefined;
  let marked = false;
  try {
    await applyMigrations({ cwd: root, state, dbId, env });
    await executeLocalSql({ cwd: root, state, dbId, env, sql: markerSql(runId) });
    marked = true;
    await executeLocalSql({ cwd: root, state, dbId, env, sql: seedSql() });

    const log = openSync(resolve(root, `test-results/${tier}/server.log`), "w");
    server = spawn(
      "node",
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)],
      {
        cwd: root,
        env,
        stdio: ["ignore", log, log],
        detached: true,
      },
    );
    const readyHeaders = tier === "l2" ? { "cf-access-jwt-assertion": jwt } : undefined;
    await waitForLive(`http://127.0.0.1:${port}`, {
      timeoutMs: 60_000,
      runId,
      headers: readyHeaders,
    });

    const testArgs =
      tier === "l2"
        ? ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.l2.config.ts"]
        : ["node_modules/@playwright/test/cli.js", "test"];
    const test = spawn("node", testArgs, { cwd: root, env, stdio: "inherit" });
    const code = await new Promise<number>((resolveCode) => {
      test.on("exit", (exitCode) => resolveCode(exitCode ?? 1));
    });
    if (code) throw new Error(`${tier.toUpperCase()} failed with exit ${code}`);
    return 0;
  } finally {
    await stopProcess(server);
    jwks.server.close();
    if (marked) {
      verifyTestBindings(state, root, env);
      rmSync(state, { recursive: true, force: true });
    }
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("run-tests.ts") || entry.endsWith("run-tests")) {
  const tier = process.argv[2];
  if (tier !== "l2" && tier !== "l3") {
    console.error("Use run-tests.ts l2|l3");
    process.exit(1);
  }
  runLane(tier).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
