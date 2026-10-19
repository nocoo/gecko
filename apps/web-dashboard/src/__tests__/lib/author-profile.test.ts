import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  AUTHOR_PROFILE_URL,
  fetchAuthorProfile,
  hashEmail,
  normalizeEmail,
  parseAuthorProfile,
} from "@/lib/author-profile";

const KNOWN_EMAIL = "architie@gmail.com";
const KNOWN_HASH = "7ba563171c26fb9b82e9f7750840c0455602eb35025192027230bcb40aae1217";

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    expect(normalizeEmail("  Architie@Gmail.com  ")).toBe(KNOWN_EMAIL);
  });
});

describe("hashEmail", () => {
  test("matches the published SHA-256 vector", async () => {
    expect(await hashEmail(KNOWN_EMAIL)).toBe(KNOWN_HASH);
  });

  test("normalizes before hashing", async () => {
    expect(await hashEmail("  Architie@Gmail.com  ")).toBe(KNOWN_HASH);
  });

  test("returns 64 lowercase hex chars", async () => {
    const hash = await hashEmail("someone@example.com");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseAuthorProfile", () => {
  test("reads a hit", () => {
    expect(parseAuthorProfile({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" })).toEqual({
      name: "Zheng Li",
      avatar: "https://cdn.example/a.jpg",
    });
  });

  test("treats miss / unpublished as nulls", () => {
    expect(parseAuthorProfile({ name: null, avatar: null })).toEqual({ name: null, avatar: null });
  });

  test("rejects empty strings and non-objects", () => {
    expect(parseAuthorProfile({ name: "", avatar: "" })).toEqual({ name: null, avatar: null });
    expect(parseAuthorProfile(null)).toEqual({ name: null, avatar: null });
    expect(parseAuthorProfile("nope")).toEqual({ name: null, avatar: null });
  });
});

describe("fetchAuthorProfile", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("GETs the public profile URL with the email hash", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" }), {
        status: 200,
      }),
    );
    await expect(fetchAuthorProfile(KNOWN_EMAIL)).resolves.toEqual({
      name: "Zheng Li",
      avatar: "https://cdn.example/a.jpg",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${AUTHOR_PROFILE_URL}?hash=${KNOWN_HASH}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("returns nulls on 429", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(fetchAuthorProfile(KNOWN_EMAIL)).resolves.toEqual({ name: null, avatar: null });
  });

  test("returns nulls on network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(fetchAuthorProfile(KNOWN_EMAIL)).resolves.toEqual({ name: null, avatar: null });
  });
});
