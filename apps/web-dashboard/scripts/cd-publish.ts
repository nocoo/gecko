import { defaultVinextDeploy, type VinextDeploy } from "./cutover-cf";
import { assertProductionDeployEnv, assertStageConfig, maybeRunCli } from "./cutover-guard";
import { type GeneratedWorkerConfig, inspectGeneratedWorkerConfig } from "./worker-stage";

export type PublishStage = "http" | "cron";

export type PublishReport = {
  stage: PublishStage;
  config: GeneratedWorkerConfig;
  deployedId: string;
};

export function parsePublishStage(raw: string | undefined): PublishStage {
  if (raw === "http" || raw === "cron") return raw;
  throw new Error("GECKO_DEPLOY_STAGE must be http or cron");
}

export function assertPublishConfig(env: NodeJS.ProcessEnv = process.env): {
  stage: PublishStage;
  config: GeneratedWorkerConfig;
} {
  assertProductionDeployEnv(env);
  const stage = parsePublishStage(env.GECKO_DEPLOY_STAGE);
  const generated = inspectGeneratedWorkerConfig({
    ...env,
    CLOUDFLARE_DEPLOY: "production",
    GECKO_DEPLOY_STAGE: stage,
  });
  return { stage, config: assertStageConfig(generated, stage) };
}

export async function runPublish(
  env: NodeJS.ProcessEnv = process.env,
  deps: { cwd?: string; vinextDeploy?: VinextDeploy } = {},
): Promise<PublishReport> {
  const { stage, config } = assertPublishConfig(env);
  const deployed = await (deps.vinextDeploy ?? defaultVinextDeploy)(env, deps.cwd ?? process.cwd());
  return { stage, config, deployedId: deployed.id };
}

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  deps?: Parameters<typeof runPublish>[1],
): Promise<PublishReport> {
  const report = await runPublish(env, deps);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

maybeRunCli(process.argv[1], "cd-publish.ts", () => main());
