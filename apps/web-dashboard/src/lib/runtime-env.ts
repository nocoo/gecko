import { env as workerEnv } from "cloudflare:workers";

type EnvRecord = Record<string, unknown> & { DB?: D1Database };

let override: EnvRecord | undefined;

export function setTestEnv(next: EnvRecord | undefined): void {
  override = next;
}

export function patchTestEnv(partial: EnvRecord): void {
  override = { ...getEnv(), ...partial };
}

export function getEnv(): EnvRecord {
  const base = (override ?? workerEnv) as EnvRecord;
  return base;
}

export function getD1(): D1Database {
  const db = getEnv().DB;
  if (!db) {
    throw new Error("D1 binding missing");
  }
  return db;
}

export function textBinding(name: string): string {
  const value = getEnv()[name];
  return typeof value === "string" ? value : "";
}
