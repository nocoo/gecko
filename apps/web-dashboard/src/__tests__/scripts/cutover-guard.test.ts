import { describe, expect, test } from "vitest";
import {
  approvalForDeploy,
  assertNotTestProcess,
  assertProductionDeployEnv,
  assertRemoteTriggers,
  assertStageConfig,
  flagString,
  isDirectRun,
  maybeRunCli,
  mergeRemoteTriggers,
  parseFlags,
  redactId,
  requireApproval,
  requireProductionAccount,
  requireProductionDatabaseId,
} from "../../../scripts/cutover-guard";
import {
  inspectGeneratedWorkerConfig,
  PRODUCTION_ACCOUNT_ID,
  PRODUCTION_DB_ID,
} from "../../../scripts/worker-stage";

const prodEnv = { CLOUDFLARE_DEPLOY: "production", GECKO_DEPLOY_STAGE: "prep" };

describe("cutover-guard", () => {
  test("parseFlags reads values and boolean switches", () => {
    const flags = parseFlags(["--stage", "http", "--apply", "--approve", "gecko-deploy-http"]);
    expect(flagString(flags, "stage")).toBe("http");
    expect(flags.apply).toBe(true);
    expect(flagString(flags, "approve")).toBe("gecko-deploy-http");
  });

  test("redactId never returns the raw value", () => {
    const raw = "google-provider-id";
    expect(redactId(raw)).toMatch(/^id:[0-9a-f]{8}$/);
    expect(redactId(raw)).not.toContain(raw);
  });

  test("refuses test process env and local production deploy", () => {
    expect(() => assertNotTestProcess({ GECKO_TEST_STATE: "x" })).toThrow(/GECKO_TEST_STATE/);
    expect(() => assertNotTestProcess({ RESOURCE_ENV: "test" })).toThrow(/test resource/);
    expect(() => assertNotTestProcess({ TEST_AUTH_MODE: "stub" })).toThrow(/TEST_AUTH_MODE/);
    expect(() => assertProductionDeployEnv({})).toThrow(/CLOUDFLARE_DEPLOY/);
    expect(() =>
      assertProductionDeployEnv({ CLOUDFLARE_DEPLOY: "production", ENVIRONMENT: "local" }),
    ).toThrow(/ENVIRONMENT=local/);
  });

  test("production writes require the exact id, account, and approval token", () => {
    expect(() => requireProductionDatabaseId("other")).toThrow(/database-id/);
    expect(() => requireProductionAccount("other")).toThrow(/account id/);
    expect(() => requireApproval("nope", "gecko-baseline")).toThrow(/approve gecko-baseline/);
    requireProductionDatabaseId(PRODUCTION_DB_ID);
    requireProductionAccount(PRODUCTION_ACCOUNT_ID);
    requireApproval("gecko-baseline", "gecko-baseline");
    expect(approvalForDeploy("http")).toBe("gecko-deploy-http");
  });

  test("assertStageConfig accepts the three generated stages", () => {
    const prep = inspectGeneratedWorkerConfig({ ...prodEnv, GECKO_DEPLOY_STAGE: "prep" });
    expect(assertStageConfig({ ...prep }, "prep").triggers).toEqual([]);
    const http = inspectGeneratedWorkerConfig({ ...prodEnv, GECKO_DEPLOY_STAGE: "http" });
    expect(assertStageConfig({ ...http }, "http").domains).toEqual(["gecko.hexly.ai"]);
    const cron = inspectGeneratedWorkerConfig({ ...prodEnv, GECKO_DEPLOY_STAGE: "cron" });
    expect(assertStageConfig({ ...cron }, "cron").triggers[0]?.cron).toBe("0 * * * *");
  });

  test("omitting triggers is rejected because remote Cron would remain", () => {
    const prep = inspectGeneratedWorkerConfig(prodEnv);
    const omitted: Record<string, unknown> = { ...prep };
    delete omitted.triggers;
    expect(() => assertStageConfig(omitted, "prep")).toThrow(/omitted triggers/);
  });

  test("mergeRemoteTriggers keeps existing Cron when the payload omits the field", () => {
    const remote = [{ cron: "0 * * * *" }];
    expect(mergeRemoteTriggers(remote, {})).toEqual(remote);
    expect(mergeRemoteTriggers(remote, { triggers: [] })).toEqual([]);
    expect(() => assertRemoteTriggers(remote, "prep")).toThrow(/still present/);
    expect(() => assertRemoteTriggers([], "cron")).toThrow(/missing/);
    assertRemoteTriggers([], "http");
    assertRemoteTriggers([{ cron: "0 * * * *" }], "cron");
  });

  test("isDirectRun matches the script filename", () => {
    expect(isDirectRun("/tmp/baseline-d1.ts", "baseline-d1.ts")).toBe(true);
    expect(isDirectRun("/tmp/vitest", "baseline-d1.ts")).toBe(false);
    expect(isDirectRun(undefined, "baseline-d1.ts")).toBe(false);
  });

  test("maybeRunCli only starts when argv matches and records failures", async () => {
    expect(maybeRunCli("/tmp/vitest", "deploy.ts", async () => {})).toBe(false);
    const previous = process.exitCode;
    expect(maybeRunCli("/tmp/deploy.ts", "deploy.ts", async () => "ok")).toBe(true);
    expect(
      maybeRunCli("/tmp/deploy.ts", "deploy.ts", async () => {
        throw new Error("boom");
      }),
    ).toBe(true);
    expect(
      maybeRunCli("/tmp/deploy.ts", "deploy.ts", async () => {
        throw "nope";
      }),
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(process.exitCode).toBe(1);
    process.exitCode = previous;
  });

  test("assertStageConfig rejects wrong worker identity and stage fields", () => {
    const prep = inspectGeneratedWorkerConfig(prodEnv);
    expect(() => assertStageConfig({ ...prep, name: "other" }, "prep")).toThrow(/gecko/);
    expect(() => assertStageConfig({ ...prep, workersDev: true }, "prep")).toThrow(/workersDev/);
    expect(() => assertStageConfig({ ...prep, previewUrls: true }, "prep")).toThrow(/previewUrls/);
    expect(() =>
      assertStageConfig({ ...prep, d1: { id: "other", name: "gecko" } }, "prep"),
    ).toThrow(/D1 id/);
    expect(() =>
      assertStageConfig(
        { ...prep, vars: { ENVIRONMENT: "local", RESOURCE_ENV: "production" } },
        "prep",
      ),
    ).toThrow(/not production/);
    expect(() => assertStageConfig({ ...prep, triggers: "cron" }, "prep")).toThrow(/array/);
    expect(() => assertStageConfig({ ...prep, domains: ["gecko.hexly.ai"] }, "prep")).toThrow(
      /must not publish domains/,
    );
    expect(() => assertStageConfig({ ...prep, triggers: [{ cron: "0 * * * *" }] }, "prep")).toThrow(
      /empty triggers/,
    );
    const http = inspectGeneratedWorkerConfig({ ...prodEnv, GECKO_DEPLOY_STAGE: "http" });
    expect(() => assertStageConfig({ ...http, domains: ["other.example"] }, "http")).toThrow(
      /only gecko.hexly.ai/,
    );
    expect(() => assertStageConfig({ ...http, triggers: [{ cron: "0 * * * *" }] }, "http")).toThrow(
      /empty triggers/,
    );
    const cron = inspectGeneratedWorkerConfig({ ...prodEnv, GECKO_DEPLOY_STAGE: "cron" });
    expect(() => assertStageConfig({ ...cron, domains: [] }, "cron")).toThrow(/must publish/);
    expect(() => assertStageConfig({ ...cron, triggers: [{ cron: "1 * * * *" }] }, "cron")).toThrow(
      /0 \* \* \* \*/,
    );
  });
});
