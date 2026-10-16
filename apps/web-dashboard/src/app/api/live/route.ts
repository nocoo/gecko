import { query } from "@/lib/d1";
import { textBinding } from "@/lib/runtime-env";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

const COMPONENT = "gecko-dashboard";
const HEADERS = { "Cache-Control": "no-store" } as const;

function sanitise(msg: string): string {
  return msg.replace(/\bok\b/gi, "***");
}

async function probeDatabase(): Promise<{ connected: boolean; error?: string }> {
  try {
    await query("SELECT 1 AS probe");
    return { connected: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return { connected: false, error: sanitise(msg) };
  }
}

export async function GET(): Promise<Response> {
  try {
    const db = await probeDatabase();
    const healthy = db.connected;
    const runId = textBinding("RESOURCE_ENV") === "test" ? textBinding("TEST_RUN_ID") : "";
    return Response.json(
      {
        status: healthy ? "ok" : "error",
        version: APP_VERSION,
        component: COMPONENT,
        timestamp: new Date().toISOString(),
        storage: "d1",
        database: db,
        ...(runId ? { runId } : {}),
      },
      { status: healthy ? 200 : 503, headers: HEADERS },
    );
  } catch (err) {
    const message = sanitise(err instanceof Error ? err.message : "unexpected failure");
    return Response.json(
      {
        status: "error",
        version: APP_VERSION,
        component: COMPONENT,
        timestamp: new Date().toISOString(),
        storage: "d1",
        reason: message,
      },
      { status: 503, headers: HEADERS },
    );
  }
}
