// GET /api/live — Surety-standard health probe.
// Returns process + database health for uptime monitors.
// No auth, no cache.

import { APP_VERSION } from "@/lib/version";
import { getD1Config, query } from "@/lib/d1";

export const dynamic = "force-dynamic";

const COMPONENT = "gecko-dashboard";
const HEADERS = { "Cache-Control": "no-store" } as const;

/** Sanitise error messages: strip the word "ok" to avoid false positives. */
function sanitise(msg: string): string {
  return msg.replace(/\bok\b/gi, "***");
}

/** Probe the D1 database. Returns connectivity status. */
async function probeDatabase(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    const cfg = getD1Config();
    if (!cfg.accountId || !cfg.apiToken || !cfg.databaseId) {
      return { connected: false, error: "database not configured" };
    }
    await query("SELECT 1 AS probe");
    return { connected: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return { connected: false, error: sanitise(msg) };
  }
}

/** GET /api/live */
export async function GET(): Promise<Response> {
  try {
    const db = await probeDatabase();
    const healthy = db.connected;

    return Response.json(
      {
        status: healthy ? "ok" : "error",
        version: APP_VERSION,
        component: COMPONENT,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        database: db,
      },
      {
        status: healthy ? 200 : 503,
        headers: HEADERS,
      },
    );
  } catch (err) {
    const message = sanitise(
      err instanceof Error ? err.message : "unexpected failure",
    );

    return Response.json(
      {
        status: "error",
        version: APP_VERSION,
        component: COMPONENT,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        reason: message,
      },
      {
        status: 503,
        headers: HEADERS,
      },
    );
  }
}
