import { describe, expect, test } from "vitest";
import { exposeOwnAccessors, exposeOwnAccessorsSync } from "@/lib/vinext-request-shim";

describe("exposeOwnAccessors", () => {
  test("pins method/headers/redirect as own enumerable properties for GET", async () => {
    const req = new Request("https://example.com/login", {
      method: "GET",
      headers: { cookie: "session=abc", accept: "text/html" },
    });

    const pinned = await exposeOwnAccessors(req);

    expect(Object.hasOwn(pinned, "method")).toBe(true);
    expect(Object.hasOwn(pinned, "headers")).toBe(true);
    expect(Object.hasOwn(pinned, "redirect")).toBe(true);
    expect(pinned.method).toBe("GET");
    expect(pinned.headers.get("cookie")).toBe("session=abc");
    // GET does not pin body
    expect(Object.hasOwn(pinned, "body")).toBe(false);
  });

  test("drains and pins body for POST so a rebuild can re-read it", async () => {
    const req = new Request("https://example.com/api/auth/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csrfToken: "tok" }),
    });

    const pinned = await exposeOwnAccessors(req);

    expect(Object.hasOwn(pinned, "method")).toBe(true);
    expect(Object.hasOwn(pinned, "body")).toBe(true);
    expect(pinned.method).toBe("POST");
    // Own enumerable body is the drained string
    const ownBody = Object.getOwnPropertyDescriptor(pinned, "body")?.value;
    expect(ownBody).toBe(JSON.stringify({ csrfToken: "tok" }));
  });

  test("skips body pin for HEAD", async () => {
    const req = new Request("https://example.com/", { method: "HEAD" });
    const pinned = await exposeOwnAccessors(req);
    expect(pinned.method).toBe("HEAD");
    expect(Object.hasOwn(pinned, "body")).toBe(false);
  });

  test("leaves body unpinned when clone().text() fails", async () => {
    const req = new Request("https://example.com/upload", {
      method: "POST",
      body: "payload",
    });
    // Force clone to fail so the drain catch path is exercised
    const originalClone = req.clone.bind(req);
    req.clone = () => {
      throw new Error("clone failed");
    };

    const pinned = await exposeOwnAccessors(req);

    expect(pinned.method).toBe("POST");
    expect(Object.hasOwn(pinned, "body")).toBe(false);
    // restore for hygiene (though req is local)
    req.clone = originalClone;
  });

  test("pins signal when present", async () => {
    const controller = new AbortController();
    const req = new Request("https://example.com/", {
      method: "GET",
      signal: controller.signal,
    });
    const pinned = await exposeOwnAccessors(req);
    expect(Object.hasOwn(pinned, "signal")).toBe(true);
    expect(pinned.signal.aborted).toBe(false);
  });
});

describe("exposeOwnAccessorsSync", () => {
  test("pins method/headers/redirect without draining body", () => {
    const req = new Request("https://example.com/dashboard", {
      method: "GET",
      headers: { cookie: "sid=1" },
    }) as import("next/server").NextRequest;

    const pinned = exposeOwnAccessorsSync(req);

    expect(Object.hasOwn(pinned, "method")).toBe(true);
    expect(Object.hasOwn(pinned, "headers")).toBe(true);
    expect(Object.hasOwn(pinned, "redirect")).toBe(true);
    expect(Object.hasOwn(pinned, "body")).toBe(false);
    expect(pinned.method).toBe("GET");
    expect(pinned.headers.get("cookie")).toBe("sid=1");
  });

  test("pins signal when present", () => {
    const controller = new AbortController();
    const req = new Request("https://example.com/", {
      method: "GET",
      signal: controller.signal,
    }) as import("next/server").NextRequest;

    const pinned = exposeOwnAccessorsSync(req);
    expect(Object.hasOwn(pinned, "signal")).toBe(true);
    expect(pinned.signal.aborted).toBe(false);
  });
});
