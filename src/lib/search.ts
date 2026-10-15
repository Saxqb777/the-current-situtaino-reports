import type { VesselLite } from "./client";
import { PORTS, type Port } from "./geo";

/**
 * The chart's search: ships on our feeds and ports by name, best match
 * first. Reports are searched by the Log's own text filter, which shares
 * the same box.
 */

export interface ChartHits {
  ships: VesselLite[];
  ports: Port[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** 0 the whole name, 1 the start of it, 2 the start of a later word, 3 anywhere in it; -1 not at all. */
function rank(name: string, q: string): number {
  const n = norm(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 3 : -1;
}

/** Ships and ports for what has been typed. An MMSI finds its ship where the feed gives one; "unifeeder" lists Unifeeder's ships. */
export function findOnChart(query: string, vessels: VesselLite[], max = { ships: 6, ports: 3 }): ChartHits {
  const q = norm(query);
  if (q.length < 2) return { ships: [], ports: [] };
  const mmsi = /^\d{5,9}$/.test(q);

  const ships = vessels
    .map((v) => {
      if (mmsi) return { v, r: v.id.startsWith("m") && v.id.slice(1).startsWith(q) ? 1 : -1 };
      if (q === "unifeeder" && v.unifeeder) return { v, r: 1 };
      return { v, r: v.name && v.name !== "Unnamed" ? rank(v.name, q) : -1 };
    })
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.v.name.localeCompare(b.v.name))
    .slice(0, max.ships)
    .map((x) => x.v);

  const ports = PORTS
    .map((p) => ({ p, r: Math.min(...[p.name, ...p.keywords].map((n) => rank(n, q)).map((r) => (r < 0 ? 9 : r))) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name))
    .slice(0, max.ports)
    .map((x) => x.p);

  return { ships, ports };
}

/** True when the text names the ship as a whole name, so "ADA" is not found in "Adana". */
export function namesShip(text: string, name: string): boolean {
  const n = norm(name);
  if (!n) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(norm(text));
}
