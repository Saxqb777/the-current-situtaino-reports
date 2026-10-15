import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CongestionDoc } from "./waits";

/**
 * hormuz.now publishes free, open data (CC BY 4.0) on the Strait of Hormuz:
 * live ship positions, every counted crossing, ships waiting at anchor, and
 * IMF PortWatch figures for 25 Gulf ports. It asks users to cache, so every
 * response is kept here for a while and served stale if the site is down.
 */
export const HZ_BASE = "https://hormuz.now";
export const HZ_CREDIT = "hormuz.now (CC BY 4.0)";
export const PORTWATCH_CREDIT = "IMF PortWatch, via hormuz.now";
const USER_AGENT = "SeaLanesWatch/1.0 (+https://sea-lanes-watch.vercel.app)";

export interface HzWindow {
  in: number; out: number; total: number; tankers: number; cargo: number;
  crude: number; products: number; lng: number; lpg: number; container: number; bulk: number;
  dwt: number; since: number; until: number; allVessels: number;
}

export interface HzCrossing {
  id: number; vesselId: string; name: string; flag: string; flagName: string; type: string;
  category: string; segment: string; segmentLabel: string; sizeClass?: string;
  dir: "in" | "out"; dirLabel: string; t: number; length: number; dwt: number; speed: number;
  destination: string; corridor: string; commercial: boolean;
}

export interface HzStatusLine {
  level: "open" | "restricted" | "closed" | "unknown" | string;
  label: string; sublabel: string; reason: string; since: number; pct: number;
  ais24: number; ais7: number; baseline: number; estimated: boolean; health: string;
  dayCount: number; crisisStart: string; asOf: number;
}

export interface HzStatus {
  avg7d: number;
  baseline: { daily: number; tankers: number; label: string; url: string };
  feed: { health: string; lastGood: number; ageSec: number; vessels: number };
  fleet: { commercial: number; lng: number; tankers: number; vessels: number; waitingGulf: number; waitingOman: number };
  generatedAt: number;
  today: HzWindow; last24h: HzWindow; last7d: HzWindow;
  lastCrossing: HzCrossing | null;
  portwatch: { available: boolean; latestDate: string; latest: number; last7Avg: number; monthAvg: number; monthLabel: string; preCrisis: number };
  status: HzStatusLine;
}

export interface HzShare { key: string; label: string; count: number; share: number }

export interface HzTraffic {
  baseline: HzStatus["baseline"];
  daily: { date: string; in: number; out: number; total: number; tankers: number; source: string; portwatch: number; hasPortwatch: boolean; avg7: number; partial?: boolean }[];
  hourly: { t: number; in: number; out: number }[];
  monthly: { month: string; portwatchAvg: number; portwatchDays: number; oursAvg: number; oursDays: number }[];
  segments7d: HzShare[];
  flags7d: HzShare[];
  corridor7d: HzShare[];
  windows: { last24h: HzWindow; last7d: HzWindow; last30d: HzWindow; prev24h: HzWindow; today: HzWindow; yesterday: HzWindow };
}

/** A ship as hormuz.now lists it in the strait, waiting, or gone silent. */
export interface HzShip {
  id: string; name: string; flag: string; flagName: string; type: string; category: string;
  segment?: string; sizeClass?: string; destination: string; length: number; dwt: number;
  speed: number; course: number; lat: number; lon: number; posAt: number; side?: string; area?: string;
  hours?: number; since?: number; areaName?: string;
  /** The wait started before tracking did, so it is at least this long. */
  atLeast?: boolean;
}

export interface HzAreas {
  generatedAt: number;
  areas: { id: string; name: string; side: string; note?: string; waiting: number; moving: number; tankers: number; lng: number; total: number; trend: number[] }[];
  aisSilent: HzShip[];
  inStrait: HzShip[];
  signals: { signal: string; label: string; count: number; vessels: HzShip[] | null }[];
  fleet: {
    vessels: number; commercial: number; tankers: number; cargo: number; lng: number; lpg: number; vlcc: number;
    moving: number; stationary: number; waitingGulf: number; waitingOman: number; nearStrait: number; tankerDwt: number;
    topFlags: HzShare[]; segments: HzShare[];
  };
  destinationRegions: Record<string, number>;
  destinations: (HzShare & { country: string; region: string })[];
  waiting: {
    trackingSince: number; total: number; dwt: number;
    areas: { id: string; name: string; side: string; count: number; medianHours: number; over24h: number; over7d: number; dwt: number }[];
    longest: HzShip[];
    buckets: HzShare[];
  };
}

export interface HzPort {
  slug: string; name: string; country: string; countryName: string;
  group: "gulf-energy" | "gulf-trade" | "bypass" | string; groupLabel: string; note: string;
  preCalls: number; nowCalls: number; pctCalls: number;
  preExport: number; nowExport: number; pctExport: number;
  preTankers: number; nowTankers: number; latestDate: string; shareExport: number;
  area: string; liveWaiting: number; lowBase: boolean; weekly: number[];
}

export interface HzPorts {
  generatedAt: number;
  ports: HzPort[];
  tonnage: { available: boolean; daily: { date: string; tankerDwt: number; totalDwt: number; tankers: number }[]; pct7: number; latestDate: string; preTankerDwt: number; last7TankerDwt: number };
}

export interface HzGeo {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { id?: string; kind: string; name?: string; side?: string }; geometry: { type: string; coordinates: unknown } }[];
}

export interface HzSnapshot {
  t: number;
  n: number;
  fields: string[];
  rows: (string | number)[][];
}

export interface HzVessel {
  id: string;
  side: string;
  track: { t: number; lat: number; lon: number; speed: number; course: number }[];
  crossings: HzCrossing[];
  vessel: HzShip & { heading?: number; mmsi?: string; width?: number; updatedAt?: number } | null;
}

/** Everything the Now, Hormuz and Ports screens need, in one response. */
export interface HormuzBundle {
  fetchedAt: string;
  status: HzStatus | null;
  traffic: HzTraffic | null;
  areas: HzAreas | null;
  crossings: HzCrossing[];
  ports: HzPorts | null;
  geo: HzGeo | null;
  /** Weekly waits per port from MarineTraffic, added by the route. */
  congestion?: CongestionDoc | null;
}

interface Entry { at: number; value: unknown }
const g = globalThis as unknown as { __hzCache?: Map<string, Entry> };
const cache = (g.__hzCache ??= new Map());

/** For local work where hormuz.now is out of reach: read saved responses from FIXTURE_DIR. */
const FIXTURES: Record<string, string> = {
  "/status.json": "hz-status", "/api/traffic": "hz-traffic", "/api/areas": "hz-areas", "/api/ports": "hz-ports",
  "/api/geo": "hz-geo", "/api/snapshot?format=compact": "hz-snapshot", "/api/crossings?hours=48&commercial=1&limit=60": "hz-crossings",
};

/**
 * GET a hormuz.now path, reusing the last answer for `ttlMs`. When the site
 * fails, the last good answer is returned however old it is, or null if
 * there has never been one.
 */
export async function hzGet<T>(p: string, ttlMs: number): Promise<T | null> {
  const hit = cache.get(p);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    const value = await load<T>(p);
    cache.set(p, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error("hormuz.now", p, err instanceof Error ? err.message : err);
    return (hit?.value as T) ?? null;
  }
}

async function load<T>(p: string): Promise<T> {
  const dir = process.env.FIXTURE_DIR;
  if (dir) {
    const name = FIXTURES[p] ?? (p.startsWith("/api/vessel/") ? "hz-vessel" : null);
    if (!name) throw new Error(`no fixture for ${p}`);
    return JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf8")) as T;
  }
  const res = await fetch(HZ_BASE + p, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function hormuzBundle(): Promise<HormuzBundle> {
  const [status, traffic, areas, crossings, ports, geo] = await Promise.all([
    hzGet<HzStatus>("/status.json", 60_000),
    hzGet<HzTraffic>("/api/traffic", 120_000),
    hzGet<HzAreas>("/api/areas", 120_000),
    hzGet<{ crossings: HzCrossing[] }>("/api/crossings?hours=48&commercial=1&limit=60", 120_000),
    hzGet<HzPorts>("/api/ports", 30 * 60_000),
    hzGet<HzGeo>("/api/geo", 6 * 3600_000),
  ]);
  return { fetchedAt: new Date().toISOString(), status, traffic, areas, crossings: crossings?.crossings ?? [], ports, geo };
}

/** One row per ship around the strait, as hormuz.now's compact snapshot gives them. */
export interface HzSnapshotShip {
  id: string; name: string; lat: number; lon: number; speed: number; course: number; heading: number;
  category: string; length: number; flag: string; type: string; destination: string; dwt: number;
  ageMin: number; commercial: boolean; side: number;
}

export function readSnapshot(s: HzSnapshot | null): HzSnapshotShip[] {
  if (!s?.rows?.length) return [];
  const at = Object.fromEntries(s.fields.map((f, i) => [f, i]));
  const col = (r: (string | number)[], f: string) => r[at[f]];
  return s.rows
    .map((r) => ({
      id: String(col(r, "id")),
      name: String(col(r, "name") ?? "").trim(),
      lat: Number(col(r, "lat")),
      lon: Number(col(r, "lon")),
      speed: Number(col(r, "speed")) || 0,
      course: Number(col(r, "course")) || 0,
      heading: Number(col(r, "heading")) || 0,
      category: String(col(r, "category") ?? "unknown"),
      length: Number(col(r, "length")) || 0,
      flag: String(col(r, "flag") ?? ""),
      type: String(col(r, "type") ?? ""),
      destination: String(col(r, "destination") ?? ""),
      dwt: Number(col(r, "dwt")) || 0,
      ageMin: Number(col(r, "ageMin")) || 0,
      commercial: Number(col(r, "commercial")) === 1,
      side: Number(col(r, "side")) || 0,
    }))
    // Buoys and other aids to navigation are not ships.
    .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon) && v.category !== "navaid");
}
