/**
 * Daily Review page — /daily/[date]
 *
 * Server Component wrapper that unwraps the route param and delegates
 * to the client-side DailyReviewClient component.
 */

import { DailyReviewClient } from "@/components/daily/daily-review-client";

export default async function DailyReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <DailyReviewClient date={date} />;
}
