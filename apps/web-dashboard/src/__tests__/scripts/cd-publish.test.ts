import { describe, expect, test } from "vitest";
import {
  assertPublishConfig,
  main,
  parsePublishStage,
  runPublish,
} from "../../../scripts/cd-publish";
import { CRON_SCHEDULE, PRODUCTION_DOMAIN } from "../../../scripts/worker-stage";

const prodHttp = {
  CLOUDFLARE_DEPLOY: "production",
  GECKO_DEPLOY_STAGE: "http",
};

describe("cd-publish", () => {
  test("parsePublishStage accepts http and cron only", () => {
    expect(parsePublishStage("http")).toBe("http");
    expect(parsePublishStage("cron")).toBe("cron");
    expect(() => parsePublishStage("prep")).toThrow(/http or cron/);
    expect(() => parsePublishStage(undefined)).toThrow(/http or cron/);
  });

  test("assertPublishConfig refuses test env, local, and missing production flag", () => {
    expect(() => assertPublishConfig({ ...prodHttp, GECKO_TEST_STATE: "x" })).toThrow(
      /GECKO_TEST_STATE/,
    );
    expect(() => assertPublishConfig({ ...prodHttp, TEST_AUTH_MODE: "stub" })).toThrow(
      /TEST_AUTH_MODE/,
    );
    expect(() => assertPublishConfig({ GECKO_DEPLOY_STAGE: "http" })).toThrow(
      /CLOUDFLARE_DEPLOY=production/,
    );
    expect(() => assertPublishConfig({ ...prodHttp, ENVIRONMENT: "local" })).toThrow(
      /ENVIRONMENT=local/,
    );
  });

  test("http publish keeps the domain and empty triggers", () => {
    const { stage, config } = assertPublishConfig(prodHttp);
    expect(stage).toBe("http");
    expect(config.domains).toEqual([PRODUCTION_DOMAIN]);
    expect(config.triggers).toEqual([]);
    expect(config.vars).toEqual({ ENVIRONMENT: "production", RESOURCE_ENV: "production" });
  });

  test("cron publish uses the locked schedule", () => {
    const { stage, config } = assertPublishConfig({
      CLOUDFLARE_DEPLOY: "production",
      GECKO_DEPLOY_STAGE: "cron",
    });
    expect(stage).toBe("cron");
    expect(config.domains).toEqual([PRODUCTION_DOMAIN]);
    expect(config.triggers).toEqual([{ cron: CRON_SCHEDULE }]);
  });

  test("runPublish returns the vinext deployment id", async () => {
    const report = await runPublish(prodHttp, {
      vinextDeploy: async () => ({ id: "deploy-ci-1" }),
    });
    expect(report.deployedId).toBe("deploy-ci-1");
    expect(report.stage).toBe("http");
    expect(report.config.triggers).toEqual([]);
  });

  test("main writes the report and surfaces deploy failures", async () => {
    const chunks: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const report = await main(prodHttp, {
        vinextDeploy: async () => ({ id: "deploy-ci-2" }),
      });
      expect(report.deployedId).toBe("deploy-ci-2");
      expect(chunks.join("")).toContain("deploy-ci-2");
    } finally {
      process.stdout.write = write;
    }
    await expect(
      runPublish(prodHttp, {
        vinextDeploy: async () => {
          throw new Error("vinext-cloudflare deploy exited 1");
        },
      }),
    ).rejects.toThrow(/exited 1/);
  });
});
