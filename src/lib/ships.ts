import type { TrackedVessel } from "./ais";
import { type HzAreas, type HzSnapshot, hzGet, readSnapshot } from "./hormuz";
import { westGulf } from "./westgulf";

/**
 * One list of ships from every feed, as compact rows for the chart:
 * [id, name, lon, lat, course, speed, group, flags, ageMin, destination, category, flag, type, length, dwt, source]
 *
 * group: 0 tanker, 1 cargo, 2 other. flags: 1 AIS silent, 2 Unifeeder, 4 under way, 8 commercial.
 * source: 0 hormuz.now, 1 VesselAPI (west Gulf), 2 aisstream.
 */
export type ShipRow = [string, string, number, number, number, number, 0 | 1 | 2, number, number, string, string, string, string, number, number, 0 | 1 | 2];

export interface ShipsPayload {
  rows: ShipRow[];
  sources: {
    hormuz: { ships: number; at: string | null };
    westGulf: { ships: number; at: string | null; nextAt: string | null };
    ais: { ships: number };
  };
}

/** A ship moving slower than this is treated as stopped: at anchor, moored or drifting. */
export const UNDER_WAY_KN = 1;

const UNIFEEDER = /^(UNIFEEDER|UNI[- ]?FEEDER)\b/i;

export function groupOf(category: string): 0 | 1 | 2 {
  if (category === "tanker") return 0;
  if (category === "cargo") return 1;
  return 2;
}

/** AIS ship-type code to the same groups. */
function groupOfAisType(type: number | undefined): 0 | 1 | 2 {
  if (type !== undefined && type >= 80 && type <= 89) return 0;
  if (type !== undefined && type >= 70 && type <= 79) return 1;
  return 2;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export async function buildShips(aisVessels: TrackedVessel[] = []): Promise<ShipsPayload> {
  const [snap, areas, west] = await Promise.all([
    hzGet<HzSnapshot>("/api/snapshot?format=compact", 30_000),
    hzGet<HzAreas>("/api/areas", 120_000),
    westGulf(),
  ]);
  const silent = new Set((areas?.aisSilent ?? []).map((s) => s.id));
  const rows: ShipRow[] = [];
  const seenMmsi = new Set<number>();

  const hz = readSnapshot(snap);
  for (const v of hz) {
    const flags = (silent.has(v.id) ? 1 : 0) | (UNIFEEDER.test(v.name) ? 2 : 0) | (v.speed >= UNDER_WAY_KN ? 4 : 0) | (v.commercial ? 8 : 0);
    rows.push([
      `h${v.id}`, v.name || "Unnamed", round(v.lon), round(v.lat), Math.round(v.speed >= UNDER_WAY_KN ? v.course : v.heading || v.course),
      round(v.speed, 1), groupOf(v.category), flags, v.ageMin, v.destination, v.category, v.flag === "--" ? "" : v.flag, v.type, v.length, v.dwt, 0,
    ]);
  }

  const westAge = (at: string) => Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  for (const v of west.ships) {
    seenMmsi.add(v.mmsi);
    // Nav status 1 is at anchor and 5 is moored, whatever the reported speed.
    const moving = v.sog >= UNDER_WAY_KN && v.navStatus !== 1 && v.navStatus !== 5;
    const flags = (UNIFEEDER.test(v.name) ? 2 : 0) | (moving ? 4 : 0);
    rows.push([
      `m${v.mmsi}`, v.name, round(v.lon), round(v.lat), Math.round(v.heading ?? v.cog), round(v.sog, 1), 2, flags, westAge(v.at), "", "", "", "", 0, 0, 1,
    ]);
  }

  for (const v of aisVessels) {
    if (seenMmsi.has(v.mmsi)) continue;
    const flags = (v.dark ? 1 : 0) | (v.unifeeder ? 2 : 0) | (v.sog >= UNDER_WAY_KN ? 4 : 0);
    rows.push([
      `m${v.mmsi}`, v.name, round(v.lon), round(v.lat), Math.round(v.heading ?? v.cog), round(v.sog, 1), groupOfAisType(v.shipType), flags,
      westAge(v.lastSeen), v.destination ?? "", "", "", "", v.length ?? 0, 0, 2,
    ]);
  }

  return {
    rows,
    sources: {
      hormuz: { ships: hz.length, at: snap?.t ? new Date(snap.t).toISOString() : null },
      westGulf: { ships: west.ships.length, at: west.at, nextAt: west.nextAt },
      ais: { ships: aisVessels.length },
    },
  };
}
