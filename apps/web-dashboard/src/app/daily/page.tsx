/**
 * /daily — redirects to today's daily review page.
 *
 * Uses the user's configured timezone (from settings) to determine
 * what "today" means, instead of the server's local clock.
 */

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserTimezone } from "@/lib/api-helpers";
import { todayInTz } from "@/lib/timezone";

export default async function DailyIndexPage() {
  const session = await auth();
  const userId = session?.user?.id;

  // Unauthenticated users will be caught by middleware/layout,
  // but fall back to default timezone just in case.
  const tz = userId ? await getUserTimezone(userId) : "Asia/Shanghai";

  redirect(`/daily/${todayInTz(tz)}`);
}
