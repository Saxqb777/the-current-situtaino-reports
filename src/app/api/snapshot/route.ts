import { after } from "next/server";
import { STALE_MS, refresh } from "@/lib/refresh";
import { SAMPLE, buildSnapshot } from "@/lib/snapshot";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
/** Leaves room for a refresh started after the response is sent. */
export const maxDuration = 120;

const HEADERS = { "cache-control": "private, no-cache" };
/** Zone levels fade with time, so the picture is rebuilt at least this often. */
const LEVEL_TICK_MS = 5 * 60_000;

/**
 * The whole picture for the page. Phones poll this, so when nothing has
 * changed since their last copy it answers 304 with no body. When the data
 * is older than STALE_MS a refresh starts after the response goes out, so
 * the visitor never waits on it and a later poll picks up the new reports.
 */
export async function GET(req: Request) {
  if (SAMPLE) return Response.json(await buildSnapshot(), { headers: HEADERS });

  const meta = await store().meta();
  const age = meta.lastRefresh ? Date.now() - Date.parse(meta.lastRefresh) : Infinity;
  if (age > STALE_MS) after(() => refresh().catch((err) => console.error("refresh failed", err)));

  const etag = `"${meta.lastRefresh ?? "none"}~${Math.floor(Date.now() / LEVEL_TICK_MS)}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...HEADERS, etag } });
  return Response.json(await buildSnapshot(), { headers: { ...HEADERS, etag } });
}
