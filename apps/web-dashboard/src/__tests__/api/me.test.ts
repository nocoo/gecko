import { describe, expect, test } from "vitest";
import { AUTHOR_PROFILE_URL, hashEmail } from "@/lib/author-profile";
import { humanRequest, installHumanTestEnv, mockExternalFetch, TEST_EMAIL } from "../test-env";

describe("GET /api/me", () => {
  test("prefers author profile name and avatar on a hit", async () => {
    const { calls } = mockExternalFetch(() => {
      return new Response(
        JSON.stringify({
          name: "Zheng Li",
          avatar: "https://cdn.example/avatar-80.jpg",
        }),
        { status: 200 },
      );
    });
    const { GET } = await import("../../app/api/me/route");
    const res = await GET(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: "e2e-test-user",
        email: TEST_EMAIL,
        name: "Zheng Li",
        avatar: "https://cdn.example/avatar-80.jpg",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${AUTHOR_PROFILE_URL}?hash=${await hashEmail(TEST_EMAIL)}`);
  });

  test("keeps session name when author profile misses", async () => {
    mockExternalFetch(
      () => new Response(JSON.stringify({ name: null, avatar: null }), { status: 200 }),
    );
    const { GET } = await import("../../app/api/me/route");
    const res = await GET(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(await res.json()).toEqual({
      user: {
        id: "e2e-test-user",
        email: TEST_EMAIL,
        name: "E2E",
        avatar: null,
      },
    });
  });

  test("keeps session name when author profile returns 429", async () => {
    mockExternalFetch(() => new Response("rate limited", { status: 429 }));
    const { GET } = await import("../../app/api/me/route");
    const res = await GET(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(await res.json()).toEqual({
      user: {
        id: "e2e-test-user",
        email: TEST_EMAIL,
        name: "E2E",
        avatar: null,
      },
    });
  });

  test("returns JSON 401 without a session", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const { GET } = await import("../../app/api/me/route");
    const res = await GET(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(res.status).toBe(401);
  });
});
