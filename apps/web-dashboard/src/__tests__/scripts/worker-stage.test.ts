import { describe, expect, test } from "vitest";
import {
  COMPATIBILITY_DATE,
  CRON_SCHEDULE,
  databaseId,
  databaseName,
  deployStage,
  inspectGeneratedWorkerConfig,
  PRODUCTION_DB_ID,
  PRODUCTION_DOMAIN,
  PRODUCTION_WORKER,
  parseDeployStage,
  productionDomains,
  productionTriggers,
  resourceEnv,
} from "../../../scripts/worker-stage";

describe("worker-stage", () => {
  test("resourceEnv prefers test, then production deploy, else local", () => {
    expect(resourceEnv({ GECKO_TEST_STATE: "/tmp/x" })).toBe("test");
    expect(resourceEnv({ GECKO_RESOURCE_ENV: "test" })).toBe("test");
    expect(resourceEnv({ CLOUDFLARE_DEPLOY: "production" })).toBe("production");
    expect(resourceEnv({})).toBe("local");
  });

  test("deployStage only accepts prep, http, or cron", () => {
    expect(deployStage({})).toBeUndefined();
    expect(deployStage({ GECKO_DEPLOY_STAGE: "http" })).toBe("http");
    expect(() => parseDeployStage("final")).toThrow(/prep, http, or cron/);
    expect(parseDeployStage("cron")).toBe("cron");
  });

  test("database bindings stay off the production id unless production", () => {
    expect(databaseId("production")).toBe(PRODUCTION_DB_ID);
    expect(databaseId("local")).not.toBe(PRODUCTION_DB_ID);
    expect(databaseId("test", { GECKO_TEST_DB_ID: "test-db" })).toBe("test-db");
    expect(databaseId("test", {})).toBe("bbbbbbbb-0000-4000-8000-000000000001");
    expect(databaseName("production")).toBe("gecko");
    expect(databaseName("local")).toBe("gecko-local");
    expect(databaseName("test")).toBe("gecko-test");
  });

  test("prep and missing stage omit domains and send empty triggers", () => {
    expect(productionDomains("prep")).toBeUndefined();
    expect(productionDomains(undefined)).toBeUndefined();
    expect(productionTriggers("prep")).toEqual([]);
    expect(productionTriggers(undefined)).toEqual([]);
  });

  test("http publishes the domain with empty triggers; cron enables the schedule", () => {
    expect(productionDomains("http")).toEqual([PRODUCTION_DOMAIN]);
    expect(productionTriggers("http")).toEqual([]);
    expect(productionDomains("cron")).toEqual([PRODUCTION_DOMAIN]);
    expect(productionTriggers("cron")).toEqual([{ cron: CRON_SCHEDULE }]);
  });

  test("generated production config always includes a triggers array", () => {
    const prep = inspectGeneratedWorkerConfig({
      CLOUDFLARE_DEPLOY: "production",
      GECKO_DEPLOY_STAGE: "prep",
    });
    expect(prep.name).toBe(PRODUCTION_WORKER);
    expect(prep.compatibilityDate).toBe(COMPATIBILITY_DATE);
    expect(prep.workersDev).toBe(false);
    expect(prep.previewUrls).toBe(false);
    expect(prep.domains).toBeUndefined();
    expect(Object.hasOwn(prep, "triggers")).toBe(true);
    expect(prep.triggers).toEqual([]);
    expect(prep.d1.id).toBe(PRODUCTION_DB_ID);
    expect(prep.vars).toEqual({ ENVIRONMENT: "production", RESOURCE_ENV: "production" });

    const http = inspectGeneratedWorkerConfig({
      CLOUDFLARE_DEPLOY: "production",
      GECKO_DEPLOY_STAGE: "http",
    });
    expect(http.domains).toEqual([PRODUCTION_DOMAIN]);
    expect(http.triggers).toEqual([]);

    const cron = inspectGeneratedWorkerConfig({
      CLOUDFLARE_DEPLOY: "production",
      GECKO_DEPLOY_STAGE: "cron",
    });
    expect(cron.triggers).toEqual([{ cron: CRON_SCHEDULE }]);
  });

  test("local generated config never binds production D1 or Cron", () => {
    const local = inspectGeneratedWorkerConfig({});
    expect(local.d1.id).not.toBe(PRODUCTION_DB_ID);
    expect(local.domains).toBeUndefined();
    expect(local.triggers).toEqual([]);
    expect(local.vars.ENVIRONMENT).toBe("local");
  });
});
