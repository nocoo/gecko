import { existsSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export const PRODUCTION_DB_ID = "f66490d2-e7b3-43e8-a30c-2b34111141d7";

export function testStateRoot(projectRoot: string): string {
  return resolve(projectRoot, ".cloudflare/tests");
}

export function verifyTestBindings(
  statePath: string,
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.CLOUDFLARE_DEPLOY === "production") {
    throw new Error("Tests cannot run with CLOUDFLARE_DEPLOY=production");
  }
  if (env.GECKO_TEST_DB_ID === PRODUCTION_DB_ID) {
    throw new Error("Test database id must differ from production");
  }
  if (!existsSync(statePath)) {
    throw new Error(`Test persist path does not exist: ${statePath}`);
  }
  const root = realpathSync(projectRoot);
  const state = realpathSync(statePath);
  const allowed = testStateRoot(root) + sep;
  if (!state.startsWith(allowed)) {
    throw new Error("Tests require a dedicated .cloudflare/tests/<run> directory");
  }
  if (env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Test env must not inherit Cloudflare API tokens");
  }
}

export function isRemoteFallback(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_DEPLOY === "production",
  );
}
