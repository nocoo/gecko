export const PRODUCTION_DB_ID = "f66490d2-e7b3-43e8-a30c-2b34111141d7";
export const PRODUCTION_DB_NAME = "gecko";
export const PRODUCTION_WORKER = "gecko";
export const PRODUCTION_DOMAIN = "gecko.hexly.ai";
export const PRODUCTION_ACCOUNT_ID = "d51a8fde361e4be31db17d8c56737c1f";
export const ACCESS_AUD = "bc4c0722bcd5e327e650d26a24358aa80ec6077782a1f484e9ec48d09bdaeb13";
export const LOCAL_DB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
export const TEST_DB_FALLBACK_ID = "bbbbbbbb-0000-4000-8000-000000000001";
export const CRON_SCHEDULE = "0 * * * *";
export const COMPATIBILITY_DATE = "2026-09-28";

export type ResourceEnv = "production" | "local" | "test";
export type DeployStage = "prep" | "http" | "cron";

export function resourceEnv(env: NodeJS.ProcessEnv = process.env): ResourceEnv {
  if (env.GECKO_TEST_STATE || env.GECKO_RESOURCE_ENV === "test") return "test";
  if (env.CLOUDFLARE_DEPLOY === "production") return "production";
  return "local";
}

export function deployStage(env: NodeJS.ProcessEnv = process.env): DeployStage | undefined {
  const raw = env.GECKO_DEPLOY_STAGE;
  if (raw === "prep" || raw === "http" || raw === "cron") return raw;
  return undefined;
}

export function parseDeployStage(raw: string | undefined): DeployStage {
  if (raw === "prep" || raw === "http" || raw === "cron") return raw;
  throw new Error("GECKO_DEPLOY_STAGE must be prep, http, or cron");
}

export function databaseId(resource: ResourceEnv, env: NodeJS.ProcessEnv = process.env): string {
  if (resource === "production") return PRODUCTION_DB_ID;
  if (resource === "test") return env.GECKO_TEST_DB_ID || TEST_DB_FALLBACK_ID;
  return LOCAL_DB_ID;
}

export function databaseName(resource: ResourceEnv): string {
  if (resource === "production") return PRODUCTION_DB_NAME;
  if (resource === "test") return "gecko-test";
  return "gecko-local";
}

export function productionDomains(stage: DeployStage | undefined): string[] | undefined {
  if (stage === "http" || stage === "cron") return [PRODUCTION_DOMAIN];
  return undefined;
}

export function productionTriggers(stage: DeployStage | undefined): { cron: string }[] {
  if (stage === "cron") return [{ cron: CRON_SCHEDULE }];
  return [];
}

export type GeneratedWorkerConfig = {
  name: string;
  compatibilityDate: string;
  workersDev: false;
  previewUrls: false;
  domains: string[] | undefined;
  triggers: { cron: string }[];
  d1: { id: string; name: string };
  vars: {
    ENVIRONMENT: "production" | "local";
    RESOURCE_ENV: ResourceEnv;
  };
};

export function inspectGeneratedWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): GeneratedWorkerConfig {
  const resource = resourceEnv(env);
  const stage = deployStage(env);
  const isProd = resource === "production";
  return {
    name: PRODUCTION_WORKER,
    compatibilityDate: COMPATIBILITY_DATE,
    workersDev: false,
    previewUrls: false,
    domains: isProd ? productionDomains(stage) : undefined,
    triggers: isProd ? productionTriggers(stage) : [],
    d1: { id: databaseId(resource, env), name: databaseName(resource) },
    vars: {
      ENVIRONMENT: isProd ? "production" : "local",
      RESOURCE_ENV: resource,
    },
  };
}
