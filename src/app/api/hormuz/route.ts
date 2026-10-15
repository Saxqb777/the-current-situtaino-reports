import { congestion, publicCongestion } from "@/lib/congestion";
import { hormuzBundle } from "@/lib/hormuz";

export const dynamic = "force-dynamic";

/**
 * Strait status, traffic history, ships waiting, recent crossings and the 25
 * Gulf ports, from hormuz.now, with the GCC ports' container-terminal waits
 * from Kpler. Cached at the edge for a minute, as hormuz.now asks; it
 * updates its own figures about once a minute.
 */
export async function GET() {
  const [hz, waits] = await Promise.all([hormuzBundle(), congestion().catch(() => null)]);
  const bundle = { ...hz, congestion: waits ? publicCongestion(waits) : null };
  const ok = Boolean(bundle.status || bundle.traffic || bundle.ports);
  return Response.json(bundle, {
    status: ok ? 200 : 503,
    headers: { "cache-control": ok ? "public, max-age=30, s-maxage=60, stale-while-revalidate=600" : "no-store" },
  });
}
