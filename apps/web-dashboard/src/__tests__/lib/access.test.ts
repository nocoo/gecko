import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, test } from "vitest";
import {
  AccessError,
  allowedOrigins,
  assertHumanOrigin,
  identityTag,
  localIdentityAllowed,
  resolveHumanUser,
  setAccessJwksForTest,
  verifyAccessJwt,
} from "../../lib/access";
import { patchTestEnv } from "../../lib/runtime-env";
import {
  humanRequest,
  installHumanTestEnv,
  mockExternalFetch,
  TEST_AUD,
  TEST_EMAIL,
} from "../test-env";

async function mintJwt(options?: {
  email?: string;
  sub?: string;
  aud?: string;
  iss?: string;
  expired?: boolean;
  alg?: "RS256";
}): Promise<{ token: string }> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  jwk.alg = "RS256";
  setAccessJwksForTest(createLocalJWKSet({ keys: [jwk] }));
  const email = options?.email ?? TEST_EMAIL;
  const jwt = new SignJWT({ email, name: "Pat" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(options?.iss ?? "https://nocoo.cloudflareaccess.com")
    .setAudience(options?.aud ?? TEST_AUD)
    .setSubject(options?.sub ?? email)
    .setIssuedAt()
    .setExpirationTime(options?.expired ? "0s" : "2h");
  return { token: await jwt.sign(privateKey) };
}

afterEach(() => {
  setAccessJwksForTest(undefined);
});

describe("localIdentityAllowed", () => {
  test("allows loopback in local test env", () => {
    expect(localIdentityAllowed(humanRequest("http://127.0.0.1:17018/api/me"))).toBe(true);
    expect(localIdentityAllowed(humanRequest("http://localhost:7018/api/me"))).toBe(true);
  });

  test("allows gecko.dev.hexly.ai from loopback peer", () => {
    const req = new Request("https://gecko.dev.hexly.ai/daily");
    expect(localIdentityAllowed(req)).toBe(true);
  });

  test("rejects production environment", () => {
    patchTestEnv({ ENVIRONMENT: "production", RESOURCE_ENV: "production" });
    expect(localIdentityAllowed(humanRequest("http://127.0.0.1:7018/api/me"))).toBe(false);
  });
});

describe("resolveHumanUser local", () => {
  test("uses LOCAL_USER_EMAIL when RESOURCE_ENV is local", async () => {
    patchTestEnv({
      RESOURCE_ENV: "local",
      LOCAL_USER_EMAIL: "Dev@Gecko.local",
      LOCAL_USER_NAME: "Dev",
    });
    const user = await resolveHumanUser(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(user.id).toBe("dev@gecko.local");
    expect(user.email).toBe("dev@gecko.local");
    expect(user.name).toBe("Dev");
  });
});

describe("resolveHumanUser stub", () => {
  test("returns stub user in test stub mode", async () => {
    const user = await resolveHumanUser(humanRequest("http://127.0.0.1:17018/api/me"));
    expect(user.id).toBe("e2e-test-user");
    expect(user.email).toBe(TEST_EMAIL);
  });

  test("does not stub when TEST_AUTH_MODE is jwt", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    await expect(
      resolveHumanUser(humanRequest("http://127.0.0.1:17018/api/me")),
    ).rejects.toBeInstanceOf(AccessError);
  });
});

describe("verifyAccessJwt", () => {
  test("accepts a valid Access JWT and lowercases email as id", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const { token } = await mintJwt({ email: "Pat.User@Example.COM" });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": token },
    });
    const user = await verifyAccessJwt(req);
    expect(user.id).toBe("pat.user@example.com");
    expect(user.email).toBe("pat.user@example.com");
  });

  test("rejects when Access team domain is invalid", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    setAccessJwksForTest(undefined);
    patchTestEnv({ CF_ACCESS_TEAM_DOMAIN: "NOPE" });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": "token" },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 503 });
  });

  test("builds the team JWKS URL when no override is set", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    setAccessJwksForTest(undefined);
    patchTestEnv({ CF_ACCESS_JWKS_URL: "" });
    mockExternalFetch(() => new Response(JSON.stringify({ keys: [] }), { status: 200 }));
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": "token" },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 401 });
  });

  test("uses CF_ACCESS_JWKS_URL in the test resource env", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    setAccessJwksForTest(undefined);
    patchTestEnv({ CF_ACCESS_JWKS_URL: "https://jwks.test/certs" });
    mockExternalFetch(() => new Response(JSON.stringify({ keys: [] }), { status: 200 }));
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": "token" },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 401 });
  });

  test("rejects when Access audience is missing", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    setAccessJwksForTest(undefined);
    patchTestEnv({ CF_ACCESS_AUD: "" });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": "token" },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 503 });
  });

  test("rejects missing token", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    await expect(
      verifyAccessJwt(humanRequest("http://127.0.0.1:17018/api/me")),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  test("rejects wrong audience", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const { token } = await mintJwt({ aud: "other-aud" });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": token },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 401 });
  });

  test("rejects wrong issuer", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const { token } = await mintJwt({ iss: "https://evil.example" });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": token },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 401 });
  });

  test("rejects email without @", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const { token } = await mintJwt({ email: "not-an-email" });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": token },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 401 });
  });

  test("rejects expired token", async () => {
    installHumanTestEnv({ authMode: "jwt" });
    const { token } = await mintJwt({ expired: true });
    const req = humanRequest("http://127.0.0.1:17018/api/me", {
      headers: { "cf-access-jwt-assertion": token },
    });
    await expect(verifyAccessJwt(req)).rejects.toMatchObject({ status: 401 });
  });
});

describe("assertHumanOrigin", () => {
  test("allows listed origins on writes", () => {
    expect(() =>
      assertHumanOrigin(
        humanRequest("http://127.0.0.1:17018/api/tags", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:17018" },
        }),
      ),
    ).not.toThrow();
  });

  test("rejects missing origin on writes", () => {
    const req = new Request("http://127.0.0.1:17018/api/tags", { method: "POST" });
    expect(() => assertHumanOrigin(req)).toThrow(AccessError);
  });

  test("rejects cross-site fetch", () => {
    expect(() =>
      assertHumanOrigin(
        humanRequest("http://127.0.0.1:17018/api/tags", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:17018", "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toThrow(AccessError);
  });

  test("skips GET", () => {
    expect(() => assertHumanOrigin(humanRequest("http://127.0.0.1:17018/api/me"))).not.toThrow();
  });

  test("production origins are only gecko.hexly.ai", () => {
    patchTestEnv({ RESOURCE_ENV: "production", ENVIRONMENT: "production" });
    expect(allowedOrigins()).toEqual(["https://gecko.hexly.ai"]);
  });

  test("local origins include the daily-dev host", () => {
    patchTestEnv({ RESOURCE_ENV: "local", ENVIRONMENT: "local" });
    expect(allowedOrigins()).toEqual([
      "http://127.0.0.1:7018",
      "http://localhost:7018",
      "https://gecko.dev.hexly.ai",
    ]);
  });
});

describe("identityTag", () => {
  test("returns 8 hex chars and does not echo the user id", async () => {
    const tag = await identityTag("architie@gmail.com");
    expect(tag).toMatch(/^[0-9a-f]{8}$/);
    expect(tag.includes("architie")).toBe(false);
    expect(tag.includes("@")).toBe(false);
  });
});
