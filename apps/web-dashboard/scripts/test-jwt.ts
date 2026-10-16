import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const ACCESS_AUD = "bc4c0722bcd5e327e650d26a24358aa80ec6077782a1f484e9ec48d09bdaeb13";
export const ACCESS_ISS = "https://nocoo.cloudflareaccess.com";

export interface TestJwtIssuer {
  jwks: { keys: Record<string, unknown>[] };
  sign: (claims: { email: string; sub?: string; name?: string; exp?: string }) => Promise<string>;
}

export async function createTestJwtIssuer(): Promise<TestJwtIssuer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "gecko-test";
  jwk.use = "sig";
  jwk.alg = "RS256";
  return {
    jwks: { keys: [jwk] },
    sign: (claims) => signAccessJwt(privateKey, claims),
  };
}

export async function signAccessJwt(
  privateKey: CryptoKey,
  claims: { email: string; sub?: string; name?: string; exp?: string },
): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name ?? "Test" })
    .setProtectedHeader({ alg: "RS256", kid: "gecko-test" })
    .setIssuer(ACCESS_ISS)
    .setAudience(ACCESS_AUD)
    .setSubject(claims.sub ?? claims.email.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? "2h")
    .sign(privateKey);
}

export function startJwksServer(jwks: unknown): Promise<{ url: string; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === "/cdn-cgi/access/certs" || req.url === "/") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("JWKS server failed to bind"));
        return;
      }
      resolve({ url: `http://127.0.0.1:${address.port}/cdn-cgi/access/certs`, server });
    });
  });
}
