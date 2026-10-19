import { jsonOk, requireSession } from "@/lib/api-helpers";
import { fetchAuthorProfile } from "@/lib/author-profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession(req);
  if (error) return error;
  const email = user.email ?? "";
  const profile = email ? await fetchAuthorProfile(email) : { name: null, avatar: null };
  return jsonOk({
    user: {
      id: user.userId,
      email,
      name: profile.name ?? user.name ?? email.split("@")[0] ?? "",
      avatar: profile.avatar,
    },
  });
}
