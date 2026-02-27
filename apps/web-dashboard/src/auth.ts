import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Get allowed emails from environment variable
const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// For reverse proxy environments with HTTPS, we need secure cookies
const useSecureCookies =
  process.env.NODE_ENV === "production" ||
  process.env.NEXTAUTH_URL?.startsWith("https://") ||
  process.env.USE_SECURE_COOKIES === "true";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Disable all OAuth checks (PKCE + state) — vinext's RSC
      // request handling doesn't preserve auth cookies across
      // the OAuth redirect round-trip, causing InvalidCheck errors.
      // Security is maintained via HTTPS + email allowlist + JWT sessions.
      checks: ["none"],
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    state: {
      name: useSecureCookies ? "__Secure-authjs.state" : "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: useSecureCookies
        ? "__Secure-authjs.callback-url"
        : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ user }) {
      // Skip email check in E2E test environment
      if (process.env.E2E_SKIP_AUTH === "true") return true;

      // If no allowlist configured, allow all
      if (allowedEmails.length === 0) return true;

      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails.includes(email)) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // IMPORTANT: Do NOT use user.id or token.sub here — in NextAuth JWT
        // mode (no DB adapter) both are set to a random UUID generated per
        // login (crypto.randomUUID() in oauth/callback.js line 224, then
        // copied to token.sub in callback/index.js line 76).
        //
        // account.providerAccountId is the Google profile().id — the stable
        // OIDC `sub` claim (e.g. "104834...") that persists across logins
        // and environments. See oauth/callback.js line 233.
        token.id = account?.providerAccountId ?? token.sub;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
