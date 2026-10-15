import { SAMPLE, loadVessels } from "@/lib/snapshot";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "private, no-cache" };

/**
 * Compact vessel list: [mmsi, name, lon, lat, course, sog, type, flags, lastSeen, destination].
 * Tracks are left out to keep this small on phones; /api/vessel/[mmsi] has them.
 * Positions only change when the feed is sampled, so repeat polls get a 304.
 */
export async function GET(req: Request) {
  const meta = SAMPLE ? null : await store().meta();
  const etag = meta ? `"${meta.lastAisSample ?? "none"}"` : null;
  if (etag && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...HEADERS, etag } });

  const { vessels } = await loadVessels();
  const rows = vessels.map((v) => [
    v.mmsi, v.name, +v.lon.toFixed(4), +v.lat.toFixed(4), Math.round(v.heading ?? v.cog), +v.sog.toFixed(1),
    v.shipType ?? 0, (v.dark ? 1 : 0) | (v.unifeeder ? 2 : 0), v.lastSeen, v.destination ?? "",
  ]);
  return Response.json({ rows }, { headers: etag ? { ...HEADERS, etag } : HEADERS });
}
