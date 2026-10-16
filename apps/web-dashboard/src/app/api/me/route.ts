import { jsonOk, requireSession } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession(req);
  if (error) return error;
  return jsonOk({
    user: {
      id: user.userId,
      email: user.email ?? "",
      name: user.name ?? "",
    },
  });
}
