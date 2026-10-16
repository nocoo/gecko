import { describe, expect, test } from "vitest";
import { setD1 } from "../../lib/d1";
import { mockD1 } from "../test-env";

async function callGET() {
  const { GET } = await import("../../app/api/live/route");
  return GET();
}

describe("/api/live", () => {
  test("returns 200 with surety fields when healthy", async () => {
    mockD1([[{ probe: 1 }]]);
    const res = await callGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.version).toBe("string");
    expect(data.component).toBe("gecko-dashboard");
    expect(data.storage).toBe("d1");
    expect(data.database).toEqual({ connected: true });
    expect(data.runId).toBe("l1");
    expect(Number.isNaN(new Date(data.timestamp).getTime())).toBe(false);
    expect(Object.keys(data).sort()).toEqual(
      ["component", "database", "runId", "status", "storage", "timestamp", "version"].sort(),
    );
  });

  test("sets Cache-Control: no-store", async () => {
    mockD1([[{ probe: 1 }]]);
    const res = await callGET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 503 when DB probe fails", async () => {
    const { db } = mockD1([[]]);
    db.throwOn = () => new Error("connection refused");
    const res = await callGET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("error");
    expect(data.database.connected).toBe(false);
    expect(typeof data.database.error).toBe("string");
  });

  test("returns 503 when D1 is missing", async () => {
    setD1(undefined);
    const res = await callGET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.database.connected).toBe(false);
  });

  test("sanitises ok from DB error messages", async () => {
    const { db } = mockD1([[]]);
    db.throwOn = () => new Error("something ok happened");
    const res = await callGET();
    const data = await res.json();
    expect(data.database.error).not.toMatch(/\bok\b/i);
    expect(data.database.error).toContain("***");
  });

  test("catastrophic error returns 503 with reason", async () => {
    mockD1([[{ probe: 1 }]]);
    const origJson = Response.json;
    let callCount = 0;
    Response.json = (...args: Parameters<typeof Response.json>) => {
      callCount += 1;
      if (callCount === 1) throw new Error("total failure");
      return origJson.apply(Response, args);
    };
    try {
      const res = await callGET();
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.status).toBe("error");
      expect(data.reason).toBeTruthy();
    } finally {
      Response.json = origJson;
    }
  });
});
