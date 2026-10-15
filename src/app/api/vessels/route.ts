import { SAMPLE, loadVessels } from "@/lib/snapshot";
import { buildShips } from "@/lib/ships";

export const dynamic = "force-dynamic";

/**
 * Every ship we can see, as compact rows (see ShipRow): hormuz.now around the
 * strait, VesselAPI along the western Gulf, and the AIS stream if it ever has
 * anything. The edge keeps a copy for half a minute, so however many phones
 * poll, the feeds are asked at most a few times a minute.
 */
export async function GET() {
  // Sample mode's made-up ships would sit on top of the real ones when saved feeds are loaded.
  const ais = SAMPLE && process.env.FIXTURE_DIR ? [] : (await loadVessels()).vessels;
  const payload = await buildShips(ais);
  return Response.json(payload, {
    headers: { "cache-control": "public, max-age=20, s-maxage=30, stale-while-revalidate=120" },
  });
}
