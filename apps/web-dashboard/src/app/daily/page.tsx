/**
 * /daily — redirects to yesterday's daily review page.
 */

import { redirect } from "next/navigation";

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DailyIndexPage() {
  redirect(`/daily/${yesterdayStr()}`);
}
