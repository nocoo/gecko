import type { BaselineLedger } from "./baseline-d1";
import {
  approvalForDeploy,
  assertNotTestProcess,
  assertProductionDeployEnv,
  assertRemoteTriggers,
  assertStageConfig,
  flagString,
  maybeRunCli,
  mergeRemoteTriggers,
  parseFlags,
  requireApproval,
  requireProductionDatabaseId,
} from "./cutover-guard";
import { DESTRUCTIVE_MIGRATIONS, FORWARD_MIGRATION, HISTORICAL_MIGRATIONS } from "./cutover-schema";
import {
  type DeployStage,
  type GeneratedWorkerConfig,
  inspectGeneratedWorkerConfig,
  PRODUCTION_DB_ID,
  parseDeployStage,
} from "./worker-stage";

export type DeployAdapter = {
  generateConfig(env: NodeJS.ProcessEnv): GeneratedWorkerConfig | Record<string, unknown>;
  applyMigrations(databaseId: string, pending: string[]): Promise<void>;
  deploy(config: GeneratedWorkerConfig): Promise<{ id: string }>;
  remoteTriggers(): Promise<{ cron: string }[]>;
};

export type DeployReport = {
  stage: DeployStage;
  dryRun: boolean;
  config: GeneratedWorkerConfig;
  pending: string[];
  remoteTriggers: { cron: string }[];
  deployedId: string | null;
};

export function pendingMigrations(files: string[], ledger: BaselineLedger): string[] {
  const done = new Set([...ledger.historical, ...ledger.forwardApplied]);
  return files.filter((name) => name.endsWith(".sql") && !done.has(name)).sort();
}

export function assertPendingSafe(pending: string[]): void {
  const destructive = pending.filter((name) => DESTRUCTIVE_MIGRATIONS.has(name));
  if (destructive.length > 0) {
    throw new Error(`pending destructive historical migration: ${destructive.join(",")}`);
  }
  const unexpected = pending.filter((name) => name !== FORWARD_MIGRATION);
  if (unexpected.length > 0) {
    throw new Error(`unexpected pending migrations: ${unexpected.join(",")}`);
  }
}

export function assertBaselineReady(ledger: BaselineLedger, analyzingWithResult: number): void {
  if (ledger.databaseId !== PRODUCTION_DB_ID) {
    throw new Error("deploy requires a production baseline ledger");
  }
  if (ledger.historical.includes(FORWARD_MIGRATION)) {
    throw new Error("baseline registered 0009 as historical");
  }
  if (ledger.historical.length !== HISTORICAL_MIGRATIONS.length) {
    throw new Error("baseline must register proven 0001-0008");
  }
  if (analyzingWithResult > 0) {
    throw new Error("sentinel __analyzing__ rows still have results");
  }
}

export async function runDeploy(
  argv: string[],
  deps: {
    adapter: DeployAdapter;
    ledger: BaselineLedger;
    migrationFiles: string[];
    analyzingWithResult?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<DeployReport> {
  const flags = parseFlags(argv);
  const stage = parseDeployStage(flagString(flags, "stage"));
  const env: NodeJS.ProcessEnv = {
    ...(deps.env ?? {}),
    CLOUDFLARE_DEPLOY: "production",
    GECKO_DEPLOY_STAGE: stage,
  };
  assertNotTestProcess(deps.env ?? {});
  assertProductionDeployEnv(env);
  requireProductionDatabaseId(flagString(flags, "database-id"));
  assertBaselineReady(deps.ledger, deps.analyzingWithResult ?? 0);
  const pending = pendingMigrations(deps.migrationFiles, deps.ledger);
  assertPendingSafe(pending);
  const generated = deps.adapter.generateConfig(env);
  const config = assertStageConfig(generated as Record<string, unknown>, stage);
  const currentRemote = await deps.adapter.remoteTriggers();
  const projected = mergeRemoteTriggers(currentRemote, { triggers: config.triggers });
  if (!flags.apply) {
    return {
      stage,
      dryRun: true,
      config,
      pending,
      remoteTriggers: projected,
      deployedId: null,
    };
  }
  requireApproval(flagString(flags, "approve"), approvalForDeploy(stage));
  if (stage !== "prep" && !flags["silence-confirmed"]) {
    throw new Error("http/cron deploy requires --silence-confirmed");
  }
  if (pending.length > 0 && stage !== "prep") {
    await deps.adapter.applyMigrations(PRODUCTION_DB_ID, pending);
  }
  const deployed = await deps.adapter.deploy(config);
  const remote = await deps.adapter.remoteTriggers();
  assertRemoteTriggers(remote, stage);
  return {
    stage,
    dryRun: false,
    config,
    pending,
    remoteTriggers: remote,
    deployedId: deployed.id,
  };
}

export function memoryDeployAdapter(options?: {
  omitTriggers?: boolean;
  remote?: { cron: string }[];
}): {
  adapter: DeployAdapter;
  state: { remote: { cron: string }[]; deployed: GeneratedWorkerConfig[]; pending: string[] };
} {
  const state = {
    remote: options?.remote ?? [{ cron: "0 * * * *" }],
    deployed: [] as GeneratedWorkerConfig[],
    pending: [] as string[],
  };
  return {
    state,
    adapter: {
      generateConfig(env) {
        const config = inspectGeneratedWorkerConfig(env);
        if (!options?.omitTriggers) return config;
        const rest: Record<string, unknown> = { ...config };
        delete rest.triggers;
        return rest;
      },
      async applyMigrations(_databaseId, pending) {
        state.pending = pending;
      },
      async deploy(config) {
        state.remote = mergeRemoteTriggers(state.remote, config);
        state.deployed.push(config);
        return { id: "deploy-1" };
      },
      async remoteTriggers() {
        return state.remote;
      },
    },
  };
}

export async function main(
  argv = process.argv.slice(2),
  deps?: Parameters<typeof runDeploy>[1],
): Promise<DeployReport> {
  if (!deps)
    throw new Error("deploy requires an injected adapter; refusing implicit production deploy");
  return runDeploy(argv, deps);
}

maybeRunCli(process.argv[1], "deploy.ts", () => main());
