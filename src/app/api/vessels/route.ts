import { hub } from "@/lib/hub";

export const dynamic = "force-dynamic";

/** Compact vessel list: [mmsi, name, lon, lat, cog, sog, type, flags, lastSeen, destination, track]. */
export function GET() {
  const rows = hub().ais.list().map((v) => [
    v.mmsi, v.name, +v.lon.toFixed(4), +v.lat.toFixed(4), Math.round(v.heading ?? v.cog), +v.sog.toFixed(1),
    v.shipType ?? 0, (v.dark ? 1 : 0) | (v.unifeeder ? 2 : 0), v.lastSeen, v.destination ?? "",
    v.track.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]),
  ]);
  return Response.json({ at: new Date().toISOString(), rows });
}
