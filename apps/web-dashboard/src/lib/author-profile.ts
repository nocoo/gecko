export const AUTHOR_PROFILE_URL = "https://lizheng.blog/api/authors/profile";
const FETCH_TIMEOUT_MS = 2500;

export interface AuthorProfile {
  name: string | null;
  avatar: string | null;
}

const EMPTY_PROFILE: AuthorProfile = { name: null, avatar: null };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseAuthorProfile(data: unknown): AuthorProfile {
  if (!data || typeof data !== "object") {
    return EMPTY_PROFILE;
  }
  const rec = data as Record<string, unknown>;
  const name = typeof rec.name === "string" && rec.name.length > 0 ? rec.name : null;
  const avatar = typeof rec.avatar === "string" && rec.avatar.length > 0 ? rec.avatar : null;
  return { name, avatar };
}

export async function fetchAuthorProfile(
  email: string,
  endpoint = AUTHOR_PROFILE_URL,
): Promise<AuthorProfile> {
  const hash = await hashEmail(email);
  const url = `${endpoint}?hash=${hash}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      return EMPTY_PROFILE;
    }
    return parseAuthorProfile(await res.json());
  } catch {
    return EMPTY_PROFILE;
  }
}
