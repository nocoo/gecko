import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { getEnv, textBinding } from "@/lib/runtime-env";

export interface AccessUser {
  id: string;
  email: string;
  name: string;
}

export class AccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

let jwksOverride: JWTVerifyGetKey | undefined;

export function setAccessJwksForTest(jwks: JWTVerifyGetKey | undefined): void {
  jwksOverride = jwks;
}

function teamDomain(): string {
  return textBinding("CF_ACCESS_TEAM_DOMAIN");
}

function audience(): string {
  return textBinding("CF_ACCESS_AUD");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function isLoopbackPeer(req: Request): boolean {
  const peer = req.headers.get("cf-connecting-ip");
  return !peer || peer === "127.0.0.1" || peer === "::1";
}

export function localIdentityAllowed(req: Request): boolean {
  const env = getEnv();
  if (env.ENVIRONMENT !== "local") return false;
  if (env.RESOURCE_ENV !== "local" && env.RESOURCE_ENV !== "test") return false;
  const hostname = new URL(req.url).hostname;
  const loopbackPeer = isLoopbackPeer(req);
  if (isLoopbackHost(hostname) && loopbackPeer) return true;
  return hostname === "gecko.dev.hexly.ai" && loopbackPeer;
}

function stubUser(): AccessUser {
  const email = (textBinding("TEST_STUB_EMAIL") || "e2e@test.local").toLowerCase();
  return {
    id: textBinding("TEST_STUB_USER_ID") || "e2e-test-user",
    email,
    name: textBinding("TEST_STUB_NAME") || email.split("@")[0] || email,
  };
}

function jwksUrl(): URL {
  const override = textBinding("CF_ACCESS_JWKS_URL");
  if (override && getEnv().RESOURCE_ENV === "test") return new URL(override);
  return new URL(`https://${teamDomain()}.cloudflareaccess.com/cdn-cgi/access/certs`);
}

export async function verifyAccessJwt(req: Request): Promise<AccessUser> {
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) throw new AccessError("Unauthorized", 401);
  const team = teamDomain();
  const aud = audience();
  if (!/^[a-z0-9-]+$/.test(team) || !aud) {
    throw new AccessError("Cloudflare Access is not configured", 503);
  }
  const issuer = `https://${team}.cloudflareaccess.com`;
  const key = jwksOverride ?? createRemoteJWKSet(jwksUrl());
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["RS256"],
      issuer,
      audience: aud,
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.email !== "string" ||
      !payload.email.includes("@")
    ) {
      throw new AccessError("Unauthorized", 401);
    }
    const email = payload.email.toLowerCase();
    return {
      id: email,
      email,
      name:
        typeof payload.name === "string" && payload.name
          ? payload.name
          : (email.split("@")[0] ?? email),
    };
  } catch (err) {
    if (err instanceof AccessError) throw err;
    throw new AccessError("Unauthorized", 401);
  }
}

export async function resolveHumanUser(req: Request): Promise<AccessUser> {
  if (localIdentityAllowed(req) && getEnv().RESOURCE_ENV === "test") {
    const mode = textBinding("TEST_AUTH_MODE");
    if (mode === "stub") return stubUser();
  }
  if (localIdentityAllowed(req) && getEnv().RESOURCE_ENV === "local") {
    const email = (textBinding("LOCAL_USER_EMAIL") || "local@gecko.local").toLowerCase();
    return {
      id: email,
      email,
      name: textBinding("LOCAL_USER_NAME") || "Local",
    };
  }
  return verifyAccessJwt(req);
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function allowedOrigins(): string[] {
  const resource = textBinding("RESOURCE_ENV");
  if (resource === "production" || textBinding("ENVIRONMENT") === "production") {
    return ["https://gecko.hexly.ai"];
  }
  if (resource === "test") {
    return ["http://127.0.0.1:17018", "http://127.0.0.1:27018", "http://localhost:17018"];
  }
  return ["http://127.0.0.1:7018", "http://localhost:7018", "https://gecko.dev.hexly.ai"];
}

export function assertHumanOrigin(req: Request): void {
  if (!WRITE_METHODS.has(req.method.toUpperCase())) return;
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError("Invalid request origin", 403);
  }
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) {
    throw new AccessError("Invalid request origin", 403);
  }
}

export async function identityTag(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest).slice(0, 4))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
