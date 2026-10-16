import { bindings, defineConfig, defineWorker, triggers } from "cf/config";
import {
  ACCESS_AUD,
  COMPATIBILITY_DATE,
  CRON_SCHEDULE,
  databaseId,
  databaseName,
  deployStage,
  productionDomains,
  productionTriggers,
  resourceEnv,
} from "./scripts/worker-stage.ts";
import * as entrypoint from "./worker-entry.ts" with { type: "cf-worker" };

const RUN_WORKER_FIRST = ["/*", "!/_next/static/*", "!/*/_next/static/*"];

export default defineConfig(() => {
  const resource = resourceEnv();
  const stage = deployStage();
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

  const scheduled = productionTriggers(stage).map((item) =>
    triggers.scheduled({ schedule: item.cron || CRON_SCHEDULE }),
  );

  return {
    worker: defineWorker({
      name: "gecko",
      entrypoint,
      compatibilityDate: COMPATIBILITY_DATE,
      compatibilityFlags: ["nodejs_compat"],
      workersDev: false,
      previewUrls: false,
      domains: isProd ? productionDomains(stage) : undefined,
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
      triggers: isProd ? scheduled : [],
    }),
  };
});
