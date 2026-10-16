import { bindings, defineConfig, defineWorker, triggers } from "cf/config";
import * as entrypoint from "./worker-entry.ts" with { type: "cf-worker" };

const PRODUCTION_DB_ID = "f66490d2-e7b3-43e8-a30c-2b34111141d7";
const LOCAL_DB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const TEST_DB_FALLBACK_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const ACCESS_AUD = "bc4c0722bcd5e327e650d26a24358aa80ec6077782a1f484e9ec48d09bdaeb13";
const RUN_WORKER_FIRST = ["/*", "!/_next/static/*", "!/*/_next/static/*"];

type ResourceEnv = "production" | "local" | "test";

function resourceEnv(): ResourceEnv {
  if (process.env.GECKO_TEST_STATE || process.env.GECKO_RESOURCE_ENV === "test") return "test";
  if (process.env.CLOUDFLARE_DEPLOY === "production") return "production";
  return "local";
}

function databaseId(resource: ResourceEnv): string {
  if (resource === "production") return PRODUCTION_DB_ID;
  if (resource === "test") return process.env.GECKO_TEST_DB_ID || TEST_DB_FALLBACK_ID;
  return LOCAL_DB_ID;
}

function databaseName(resource: ResourceEnv): string {
  if (resource === "production") return "gecko";
  if (resource === "test") return "gecko-test";
  return "gecko-local";
}

export default defineConfig(() => {
  const resource = resourceEnv();
  const isProd = resource === "production";
  const env: Record<
    string,
    | ReturnType<typeof bindings.d1>
    | ReturnType<typeof bindings.text>
    | ReturnType<typeof bindings.assets>
  > = {
    DB: bindings.d1({
      id: databaseId(resource),
      name: databaseName(resource),
      dev: { remote: false },
    }),
    ASSETS: bindings.assets(),
    ENVIRONMENT: bindings.text(isProd ? "production" : "local"),
    RESOURCE_ENV: bindings.text(resource),
    CF_ACCESS_TEAM_DOMAIN: bindings.text("nocoo"),
    CF_ACCESS_AUD: bindings.text(ACCESS_AUD),
    DASHBOARD_URL: bindings.text("https://gecko.hexly.ai"),
    DOVE_TEMPLATE_SLUG: bindings.text("daily-analysis"),
    DOVE_WEBHOOK_URL: bindings.text(process.env.DOVE_WEBHOOK_URL ?? ""),
    DOVE_WEBHOOK_TOKEN: bindings.text(process.env.DOVE_WEBHOOK_TOKEN ?? ""),
  };
  if (resource === "local") {
    env.LOCAL_USER_EMAIL = bindings.text(process.env.LOCAL_USER_EMAIL ?? "local@gecko.local");
    env.LOCAL_USER_NAME = bindings.text(process.env.LOCAL_USER_NAME ?? "Local");
  }
  if (resource === "test") {
    env.TEST_AUTH_MODE = bindings.text(process.env.TEST_AUTH_MODE ?? "stub");
    env.TEST_RUN_ID = bindings.text(process.env.GECKO_TEST_RUN_ID ?? "");
    env.TEST_STUB_USER_ID = bindings.text(process.env.TEST_STUB_USER_ID ?? "e2e-test-user");
    env.TEST_STUB_EMAIL = bindings.text(process.env.TEST_STUB_EMAIL ?? "e2e@test.local");
    env.TEST_STUB_NAME = bindings.text(process.env.TEST_STUB_NAME ?? "E2E");
    if (process.env.CF_ACCESS_JWKS_URL) {
      env.CF_ACCESS_JWKS_URL = bindings.text(process.env.CF_ACCESS_JWKS_URL);
    }
  }

  return {
    worker: defineWorker({
      name: "gecko",
      entrypoint,
      compatibilityDate: "2026-09-28",
      compatibilityFlags: ["nodejs_compat"],
      workersDev: false,
      previewUrls: false,
      domains: isProd ? ["gecko.hexly.ai"] : undefined,
      observability: {
        enabled: true,
        traces: { enabled: true },
        headSamplingRate: 1,
        redactQueryString: true,
      },
      assets: {
        htmlHandling: "none",
        notFoundHandling: "none",
        runWorkerFirst: RUN_WORKER_FIRST,
      },
      env,
      triggers: isProd ? [triggers.scheduled({ schedule: "0 * * * *" })] : [],
    }),
  };
});
