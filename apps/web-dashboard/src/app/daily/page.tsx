/**
 * /daily — redirects to today's daily review page.
 *
 * Uses the user's configured timezone (from settings) to determine
 * what "today" means, instead of the server's local clock.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveHumanUser } from "@/lib/access";
import { getUserTimezone } from "@/lib/api-helpers";
import { todayInTz } from "@/lib/timezone";

function requestFromHeaders(headerList: Headers): Request {
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "127.0.0.1:7018";
  const scheme = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return new Request(`${scheme}://${host}/daily`, { headers: headerList });
}

export default async function DailyIndexPage() {
  const headerList = await headers();
  const req = requestFromHeaders(headerList);
  let userId: string | undefined;
  try {
    userId = (await resolveHumanUser(req)).id;
  } catch {
    userId = undefined;
  }
  const tz = userId ? await getUserTimezone(userId) : "Asia/Shanghai";
  redirect(`/daily/${todayInTz(tz)}`);
}
