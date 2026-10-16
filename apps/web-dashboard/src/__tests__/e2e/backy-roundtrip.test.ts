import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { BackupEnvelope } from "@/lib/backy";
import { humanApi, jsonBody } from "./harness";

const MOCK_BACKY_PORT = 10799;
const MOCK_BACKY_URL = `http://127.0.0.1:${MOCK_BACKY_PORT}/webhook/gecko`;
const MOCK_BACKY_API_KEY = "test-backy-api-key-12345";

interface ReceivedBackup {
  authorization: string | null;
  tag: string | null;
  environment: string | null;
  fileName: string;
  envelope: BackupEnvelope;
}

const receivedBackups: ReceivedBackup[] = [];
let mockBacky: Server | undefined;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function startMockBacky(): Promise<void> {
  mockBacky = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${MOCK_BACKY_PORT}`);
      const auth = req.headers.authorization ?? null;
      if (req.method === "HEAD") {
        res.statusCode = auth === `Bearer ${MOCK_BACKY_API_KEY}` ? 200 : 401;
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname.includes("/webhook/")) {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            project_name: "gecko",
            total_backups: receivedBackups.length,
            recent_backups: receivedBackups.map((b) => ({
              tag: b.tag,
              file_name: b.fileName,
              created_at: new Date().toISOString(),
            })),
          }),
        );
        return;
      }
      if (req.method === "POST") {
        if (auth !== `Bearer ${MOCK_BACKY_API_KEY}`) {
          res.statusCode = 401;
          res.end("Unauthorized");
          return;
        }
        const raw = await readBody(req);
        const request = new Request(url, {
          method: "POST",
          headers: { "content-type": String(req.headers["content-type"] ?? "") },
          body: new Uint8Array(raw),
        });
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
          res.statusCode = 400;
          res.end("missing file");
          return;
        }
        const compressed = Buffer.from(await file.arrayBuffer());
        receivedBackups.push({
          authorization: auth,
          tag: String(formData.get("tag") ?? ""),
          environment: String(formData.get("environment") ?? ""),
          fileName: file.name,
          envelope: JSON.parse(gunzipSync(compressed).toString()) as BackupEnvelope,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, id: crypto.randomUUID() }));
        return;
      }
      res.statusCode = 404;
      res.end("Not Found");
    } catch {
      res.statusCode = 500;
      res.end("error");
    }
  });
  return new Promise((resolve) => {
    mockBacky?.listen(MOCK_BACKY_PORT, "127.0.0.1", () => resolve());
  });
}

beforeAll(async () => {
  await startMockBacky();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (!mockBacky) {
      resolve();
      return;
    }
    mockBacky.close(() => resolve());
  });
});

describe("E2E: Backy backup round-trip", () => {
  let pullKey = "";

  test("GET /api/backy/config returns a valid shape", async () => {
    const res = await humanApi("/api/backy/config");
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).configured).toBe("boolean");
  });

  test("PUT /api/backy/config persists webhook settings", async () => {
    const res = await humanApi(
      "/api/backy/config",
      jsonBody("PUT", { webhookUrl: MOCK_BACKY_URL, apiKey: MOCK_BACKY_API_KEY }),
    );
    expect(res.status).toBe(200);
    const config = await (await humanApi("/api/backy/config")).json();
    expect(config.configured).toBe(true);
    expect(config.webhookUrl).toBe(MOCK_BACKY_URL);
    expect(config.apiKey).toContain("•");
    expect(String(config.apiKey).endsWith("2345")).toBe(true);
  });

  test("POST /api/backy/test reaches the mock server", async () => {
    const res = await humanApi("/api/backy/test", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe(200);
  });

  test("POST /api/backy/push uploads a gzipped envelope", async () => {
    const before = receivedBackups.length;
    const res = await humanApi("/api/backy/push", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.tag).toMatch(/^v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}/);
    expect(data.fileName).toMatch(/\.json\.gz$/);
    expect(receivedBackups.length).toBe(before + 1);
    const received = receivedBackups.at(-1);
    expect(received?.authorization).toBe(`Bearer ${MOCK_BACKY_API_KEY}`);
    expect(received?.envelope.schemaVersion).toBe(1);
    expect(received?.envelope.settings.filter((s) => s.key.startsWith("backy."))).toHaveLength(0);
  });

  test("GET /api/backy/history returns mock history", async () => {
    const res = await humanApi("/api/backy/history");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.project_name).toBe("gecko");
    expect(data.total_backups).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/backy/pull-key starts unconfigured", async () => {
    const res = await humanApi("/api/backy/pull-key");
    expect(res.status).toBe(200);
    expect((await res.json()).exists).toBe(false);
  });

  test("POST /api/backy/pull-key generates a bpk_ key", async () => {
    const res = await humanApi("/api/backy/pull-key", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toMatch(/^bpk_[0-9a-f]{64}$/);
    pullKey = data.key;
    const status = await (await humanApi("/api/backy/pull-key")).json();
    expect(status.exists).toBe(true);
  });

  test("HEAD /api/backy/pull accepts the pull key", async () => {
    const res = await humanApi("/api/backy/pull", {
      method: "HEAD",
      headers: { "X-Webhook-Key": pullKey },
    });
    expect(res.status).toBe(200);
  });

  test("HEAD /api/backy/pull rejects an invalid key", async () => {
    const res = await humanApi("/api/backy/pull", {
      method: "HEAD",
      headers: { "X-Webhook-Key": "bpk_invalid" },
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/backy/pull triggers another push", async () => {
    const before = receivedBackups.length;
    const res = await humanApi("/api/backy/pull", {
      method: "POST",
      headers: { "X-Webhook-Key": pullKey },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(receivedBackups.length).toBe(before + 1);
  });

  test("DELETE /api/backy/pull-key revokes the key", async () => {
    const res = await humanApi("/api/backy/pull-key", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).revoked).toBe(true);
    const head = await humanApi("/api/backy/pull", {
      method: "HEAD",
      headers: { "X-Webhook-Key": pullKey },
    });
    expect(head.status).toBe(401);
  });

  test("POST /api/backy/pull without key returns 401", async () => {
    const res = await humanApi("/api/backy/pull", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("PUT /api/backy/config rejects invalid URL", async () => {
    const res = await humanApi(
      "/api/backy/config",
      jsonBody("PUT", { webhookUrl: "not-a-url", apiKey: "key" }),
    );
    expect(res.status).toBe(400);
  });

  test("PUT /api/backy/config rejects missing fields", async () => {
    const res = await humanApi("/api/backy/config", jsonBody("PUT", {}));
    expect(res.status).toBe(400);
  });
});
