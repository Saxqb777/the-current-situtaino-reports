import { type HzVessel, hzGet } from "@/lib/hormuz";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * One ship's details and recent track, fetched when it is picked on the chart.
 * Ids are "h…" for hormuz.now ships and "m…" (an MMSI) for the other feeds.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (/^h\d{1,12}$/.test(id)) {
    const v = await hzGet<HzVessel>(`/api/vessel/${id.slice(1)}`, 60_000);
    if (!v) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(
      {
        id,
        track: v.track.map((p) => [+p.lon.toFixed(4), +p.lat.toFixed(4)]),
        vessel: v.vessel,
        crossings: v.crossings.slice(0, 10),
      },
      { headers: { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
    );
  }
  const mmsi = Number(id.replace(/^m/, ""));
  if (!Number.isInteger(mmsi) || mmsi <= 0) return Response.json({ error: "bad id" }, { status: 400 });
  const v = await store().vessel(mmsi);
  return Response.json(
    { id, track: v ? v.track.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]) : [], vessel: null, crossings: [] },
    { headers: { "cache-control": "no-store" } },
  );
}
