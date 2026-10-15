import { refresh } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Called by the GitHub Actions timer and the daily Vercel cron so the data
 * stays fresh when nobody has the page open. Safe to call often: a refresh
 * runs at most once every two minutes whoever asks.
 */
export async function GET() {
  const result = await refresh();
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
