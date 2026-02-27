import { describe, test, expect } from "bun:test";

describe("auth", () => {
  // ---------------------------------------------------------------------------
  // Email allowlist parsing
  // ---------------------------------------------------------------------------

  describe("email allowlist", () => {
    test("parses comma-separated emails from ALLOWED_EMAILS", () => {
      const allowedEmails = "alice@example.com, BOB@example.com ,charlie@example.com"
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      expect(allowedEmails).toEqual([
        "alice@example.com",
        "bob@example.com",
        "charlie@example.com",
      ]);
    });

    test("handles empty ALLOWED_EMAILS", () => {
      const allowedEmails = ""
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      expect(allowedEmails).toEqual([]);
    });

    test("handles whitespace-only entries", () => {
      const allowedEmails = "alice@example.com, , ,bob@example.com"
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      expect(allowedEmails).toEqual(["alice@example.com", "bob@example.com"]);
    });
  });

  // ---------------------------------------------------------------------------
  // signIn callback logic
  // ---------------------------------------------------------------------------

  describe("signIn callback", () => {
    function signInCallback(
      email: string | undefined | null,
      allowedEmails: string[],
      skipAuth: boolean
    ): boolean {
      if (skipAuth) return true;
      const normalizedEmail = email?.toLowerCase();
      if (!normalizedEmail || !allowedEmails.includes(normalizedEmail)) {
        return false;
      }
      return true;
    }

    test("allows user with email in allowlist", () => {
      const result = signInCallback(
        "alice@example.com",
        ["alice@example.com", "bob@example.com"],
        false
      );
      expect(result).toBe(true);
    });

    test("rejects user with email not in allowlist", () => {
      const result = signInCallback(
        "hacker@evil.com",
        ["alice@example.com"],
        false
      );
      expect(result).toBe(false);
    });

    test("case-insensitive email matching", () => {
      const result = signInCallback(
        "ALICE@EXAMPLE.COM",
        ["alice@example.com"],
        false
      );
      expect(result).toBe(true);
    });

    test("rejects when email is undefined", () => {
      const result = signInCallback(undefined, ["alice@example.com"], false);
      expect(result).toBe(false);
    });

    test("rejects when email is null", () => {
      const result = signInCallback(null, ["alice@example.com"], false);
      expect(result).toBe(false);
    });

    test("rejects when allowlist is empty", () => {
      const result = signInCallback("alice@example.com", [], false);
      expect(result).toBe(false);
    });

    test("bypasses check when E2E_SKIP_AUTH is true", () => {
      const result = signInCallback("anyone@example.com", [], true);
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // JWT callback logic
  // ---------------------------------------------------------------------------

  describe("jwt callback", () => {
    // Mirrors auth.ts: token.id = account.providerAccountId (stable OIDC sub),
    // NOT user.id or token.sub — both are random UUIDs in JWT mode (no adapter).
    function jwtCallback(
      token: Record<string, unknown>,
      user?: { id?: string; email?: string; name?: string; image?: string },
      account?: { providerAccountId?: string }
    ): Record<string, unknown> {
      if (user) {
        token.id = account?.providerAccountId ?? token.sub;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    }

    test("uses stable account.providerAccountId (Google sub) instead of user.id", () => {
      const token = { sub: "random-uuid-also" }; // token.sub is also random in JWT mode
      const user = {
        id: "random-uuid-per-login", // NextAuth generates this fresh each login
        email: "alice@example.com",
        name: "Alice",
        image: "https://avatar.url/alice.jpg",
      };
      const account = { providerAccountId: "104834567890" }; // stable Google sub

      const result = jwtCallback(token, user, account);
      // token.id should be the stable providerAccountId, NOT the random user.id
      expect(result.id).toBe("104834567890");
      expect(result.id).not.toBe("random-uuid-per-login");
      expect(result.id).not.toBe("random-uuid-also");
      expect(result.email).toBe("alice@example.com");
      expect(result.name).toBe("Alice");
      expect(result.picture).toBe("https://avatar.url/alice.jpg");
    });

    test("falls back to token.sub when account is missing", () => {
      const token = { sub: "fallback-sub" };
      const user = {
        id: "random-uuid",
        email: "alice@example.com",
        name: "Alice",
        image: "https://avatar.url/alice.jpg",
      };

      const result = jwtCallback(token, user, undefined);
      expect(result.id).toBe("fallback-sub");
    });

    test("preserves existing token when no user (subsequent calls)", () => {
      const token = {
        sub: "104834567890",
        id: "104834567890",
        email: "alice@example.com",
        name: "Alice",
        picture: "https://avatar.url/alice.jpg",
      };

      const result = jwtCallback(token);
      expect(result.id).toBe("104834567890");
      expect(result.email).toBe("alice@example.com");
    });
  });

  // ---------------------------------------------------------------------------
  // Session callback logic
  // ---------------------------------------------------------------------------

  describe("session callback", () => {
    function sessionCallback(
      session: { user?: { id?: string } },
      token: { id?: string }
    ): { user?: { id?: string } } {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    }

    test("exposes user id from token in session", () => {
      const session = { user: { id: undefined as string | undefined } };
      const token = { id: "u1" };

      const result = sessionCallback(session, token);
      expect(result.user?.id).toBe("u1");
    });

    test("does not set id when token has no id", () => {
      const session = { user: {} };
      const token = {};

      const result = sessionCallback(session, token);
      expect(result.user?.id).toBeUndefined();
    });

    test("handles missing session.user gracefully", () => {
      const session = {};
      const token = { id: "u1" };

      const result = sessionCallback(session, token);
      expect(result.user).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Proxy (middleware) logic
  // ---------------------------------------------------------------------------

  describe("proxy logic", () => {
    function routeDecision(
      pathname: string,
      isLoggedIn: boolean,
      skipAuth: boolean
    ): "next" | "redirect-home" | "redirect-login" {
      if (skipAuth) return "next";
      if (pathname.startsWith("/api/auth")) return "next";
      if (pathname === "/login" && isLoggedIn) return "redirect-home";
      if (pathname !== "/login" && !isLoggedIn) return "redirect-login";
      return "next";
    }

    test("skips auth check when E2E_SKIP_AUTH", () => {
      expect(routeDecision("/dashboard", false, true)).toBe("next");
    });

    test("allows auth routes through", () => {
      expect(routeDecision("/api/auth/callback/google", false, false)).toBe("next");
    });

    test("redirects logged-in user from /login to /", () => {
      expect(routeDecision("/login", true, false)).toBe("redirect-home");
    });

    test("redirects unauthenticated user to /login", () => {
      expect(routeDecision("/", false, false)).toBe("redirect-login");
      expect(routeDecision("/settings", false, false)).toBe("redirect-login");
    });

    test("allows authenticated user to access protected pages", () => {
      expect(routeDecision("/", true, false)).toBe("next");
      expect(routeDecision("/settings", true, false)).toBe("next");
    });

    test("allows unauthenticated user to view /login", () => {
      expect(routeDecision("/login", false, false)).toBe("next");
    });
  });
});
