import { createHash } from "node:crypto";
import {
  CRON_SCHEDULE,
  type DeployStage,
  type GeneratedWorkerConfig,
  PRODUCTION_ACCOUNT_ID,
  PRODUCTION_DB_ID,
  PRODUCTION_DOMAIN,
  PRODUCTION_WORKER,
} from "./worker-stage";

export function isDirectRun(argv1: string | undefined, file: string): boolean {
  if (!argv1) return false;
  return argv1.endsWith(file) || argv1.endsWith(file.replace(/\.ts$/, ""));
}

export function maybeRunCli(
  argv1: string | undefined,
  file: string,
  start: () => Promise<unknown>,
): boolean {
  if (!isDirectRun(argv1, file)) return false;
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
  return true;
}

export function parseFlags(argv: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

export function flagString(flags: Record<string, string | true>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function redactId(value: string): string {
  return `id:${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
}

export function assertNotTestProcess(env: NodeJS.ProcessEnv): void {
  if (env.GECKO_TEST_STATE) throw new Error("cutover tooling refuses GECKO_TEST_STATE");
  if (env.GECKO_RESOURCE_ENV === "test" || env.RESOURCE_ENV === "test") {
    throw new Error("cutover tooling refuses test resource env");
  }
  if (env.TEST_AUTH_MODE) throw new Error("cutover tooling refuses TEST_AUTH_MODE");
}

export function assertProductionDeployEnv(env: NodeJS.ProcessEnv): void {
  assertNotTestProcess(env);
  if (env.ENVIRONMENT === "local") throw new Error("deploy refuses ENVIRONMENT=local");
  if (env.RESOURCE_ENV === "local") throw new Error("deploy refuses RESOURCE_ENV=local");
  if (env.CLOUDFLARE_DEPLOY !== "production") {
    throw new Error("CLOUDFLARE_DEPLOY=production required");
  }
}

export function requireApproval(got: string | undefined, expected: string): void {
  if (got !== expected) throw new Error(`requires --approve ${expected}`);
}

export function requireProductionDatabaseId(id: string | undefined): void {
  if (id !== PRODUCTION_DB_ID) {
    throw new Error(`explicit --database-id ${PRODUCTION_DB_ID} required`);
  }
}

export function requireProductionAccount(id: string | undefined): void {
  if (id !== PRODUCTION_ACCOUNT_ID) {
    throw new Error(`account id must be ${PRODUCTION_ACCOUNT_ID}`);
  }
}

export function approvalForDeploy(stage: DeployStage): string {
  return `gecko-deploy-${stage}`;
}

export function assertStageConfig(
  config: Record<string, unknown>,
  stage: DeployStage,
): GeneratedWorkerConfig {
  if (!Object.hasOwn(config, "triggers") || config.triggers === undefined) {
    throw new Error("generated config omitted triggers; remote Cron would remain");
  }
  if (!Array.isArray(config.triggers)) throw new Error("triggers must be an array");
  const typed = config as unknown as GeneratedWorkerConfig;
  if (typed.name !== PRODUCTION_WORKER) throw new Error("worker name must be gecko");
  if (typed.workersDev !== false) throw new Error("workersDev must be false");
  if (typed.previewUrls !== false) throw new Error("previewUrls must be false");
  if (typed.d1.id !== PRODUCTION_DB_ID) throw new Error("production D1 id mismatch");
  if (typed.vars.ENVIRONMENT !== "production" || typed.vars.RESOURCE_ENV !== "production") {
    throw new Error("generated config is not production");
  }
  if (stage === "prep") {
    if (typed.domains && typed.domains.length > 0) {
      throw new Error("prep stage must not publish domains");
    }
    if (typed.triggers.length > 0) throw new Error("prep stage must send empty triggers");
  }
  if (stage === "http") {
    if (!typed.domains?.includes(PRODUCTION_DOMAIN) || typed.domains.length !== 1) {
      throw new Error("http stage must publish only gecko.hexly.ai");
    }
    if (typed.triggers.length > 0) throw new Error("http stage must send empty triggers");
  }
  if (stage === "cron") {
    if (!typed.domains?.includes(PRODUCTION_DOMAIN)) {
      throw new Error("cron stage must publish gecko.hexly.ai");
    }
    if (!typed.triggers.some((item) => item.cron === CRON_SCHEDULE)) {
      throw new Error("cron stage must enable 0 * * * *");
    }
  }
  return typed;
}

export function mergeRemoteTriggers(
  remote: { cron: string }[],
  payload: { triggers?: { cron: string }[] },
): { cron: string }[] {
  if (!Object.hasOwn(payload, "triggers") || payload.triggers === undefined) return remote;
  return payload.triggers;
}

export function assertRemoteTriggers(remote: { cron: string }[], stage: DeployStage): void {
  if (stage === "cron") {
    if (!remote.some((item) => item.cron === CRON_SCHEDULE)) {
      throw new Error("remote Cron missing after cron stage");
    }
    return;
  }
  if (remote.length > 0) {
    throw new Error("remote Cron still present after empty triggers deploy");
  }
}
