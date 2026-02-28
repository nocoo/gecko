// GET /api/live — Lightweight liveness probe.
// No auth, no DB, no cache. Returns process health for uptime monitors.

import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Process boot timestamp (ms). */
const bootedAt = Date.now();

/** GET /api/live */
export async function GET(): Promise<Response> {
  try {
    const now = Date.now();

    return Response.json(
      {
        status: "ok",
        version: APP_VERSION,
        uptime: now - bootedAt,
        timestamp: new Date(now).toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "unexpected failure";

    return Response.json(
      {
        status: "error",
        reason: message,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}
