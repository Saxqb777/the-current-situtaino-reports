import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One ship's recent track, fetched when it is picked on the chart. */
export async function GET(_req: Request, { params }: { params: Promise<{ mmsi: string }> }) {
  const mmsi = Number((await params).mmsi);
  if (!Number.isInteger(mmsi) || mmsi <= 0) return Response.json({ error: "bad mmsi" }, { status: 400 });
  const v = await store().vessel(mmsi);
  if (!v) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ mmsi, track: v.track.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]) }, { headers: { "cache-control": "no-store" } });
}
