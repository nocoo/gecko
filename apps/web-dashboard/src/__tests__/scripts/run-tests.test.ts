import { createServer } from "node:net";
import { describe, expect, test } from "vitest";
import { assertPortFree, TEST_DB_ID } from "../../../scripts/run-tests";

describe("run-tests helpers", () => {
  test("assertPortFree resolves after a port is released", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const { port } = address;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(assertPortFree(port)).resolves.toBeUndefined();
  });

  test("assertPortFree rejects when bound", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    await expect(assertPortFree(address.port)).rejects.toThrow(/already in use/);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("test db id is not production", () => {
    expect(TEST_DB_ID).toBe("bbbbbbbb-0000-4000-8000-000000000001");
  });
});
