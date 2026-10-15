import { readFile } from "node:fs/promises";
import path from "node:path";
import { store } from "./store";

/**
 * Ships in the western Gulf (Kuwait to Abu Dhabi), from VesselAPI. hormuz.now
 * covers the strait itself from 54° E; this fills in the Saudi, Bahraini,
 * Qatari and Kuwaiti coasts. VesselAPI has no coverage in the Red Sea or the
 * Gulf of Aden, so nothing is asked there.
 *
 * The free plan allows 150 calls a month, so calls are spread evenly over
 * what is left of the month: each run spends a few calls, and the next run
 * waits until its share of the remaining time has passed.
 */
const BASE = "https://api.vesselapi.com/v1/location/vessels/bounding-box";
/** Each box keeps |Δlat| + |Δlon| ≤ 4, VesselAPI's limit. [lonLeft, lonRight, latBottom, latTop] */
export const WEST_GULF_BOXES = [
  { id: "north", fixture: "va-kuwait", box: [47.8, 49.8, 28.2, 30.2] },
  { id: "saudi", fixture: "va-dammam", box: [49.5, 51.0, 25.7, 28.2] },
  { id: "qatar", fixture: "va-qatar", box: [50.8, 52.6, 24.6, 26.8] },
  { id: "uae-west", fixture: null, box: [52.6, 54.0, 23.9, 26.5] },
] as const;
const PAGES_PER_BOX = 2;
/** Calls kept back so the key still answers a manual check late in the month. */
const RESERVE = 6;
const MIN_INTERVAL_MS = 2 * 3600_000;
const DOC = "westgulf";

export interface WestGulfShip {
  mmsi: number; imo: number | null; name: string; lat: number; lon: number;
  sog: number; cog: number; heading: number | null; navStatus: number | null; at: string;
}

export interface WestGulfDoc {
  /** When the last run finished. */
  at: string | null;
  ships: WestGulfShip[];
  /** Calls the provider says are left this month, after the last run. */
  remaining: number | null;
  resetAt: string | null;
  callsLastRun: number;
  nextAt: string | null;
  error?: string;
}

const EMPTY: WestGulfDoc = { at: null, ships: [], remaining: null, resetAt: null, callsLastRun: 0, nextAt: null };

interface ApiVessel {
  mmsi: number; imo?: number; vessel_name?: string; latitude: number; longitude: number; timestamp: string;
  cog?: number; sog?: number; heading?: number; nav_status?: number; suspected_glitch?: boolean;
}

export async function westGulf(): Promise<WestGulfDoc> {
  const doc = await store().doc<WestGulfDoc>(DOC);
  // Local work from saved responses: take the first picture straight away.
  if (!doc && process.env.FIXTURE_DIR) {
    await refreshWestGulf();
    return (await store().doc<WestGulfDoc>(DOC)) ?? EMPTY;
  }
  return doc ?? EMPTY;
}

/** First moment of next month, UTC: when the free allowance is assumed to reset. */
export function nextMonthStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * How long to wait after a run so the remaining calls last until the reset.
 * Returns null when there are not enough calls left for another run.
 */
export function spacing(remaining: number, callsPerRun: number, now: number, resetAt: number): number | null {
  const runs = Math.floor((remaining - RESERVE) / Math.max(1, callsPerRun));
  if (runs < 1) return null;
  return Math.max(MIN_INTERVAL_MS, (resetAt - now) / runs);
}

function parseReset(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n > 1e9 ? n * 1000 : Date.now() + n * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Latest report per ship, dropping positions the provider marks as glitches. */
export function latestPerShip(rows: ApiVessel[]): WestGulfShip[] {
  const best = new Map<number, ApiVessel>();
  for (const r of rows) {
    if (r.suspected_glitch || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    const prev = best.get(r.mmsi);
    if (!prev || Date.parse(r.timestamp) > Date.parse(prev.timestamp)) best.set(r.mmsi, r);
  }
  return [...best.values()].map((r) => ({
    mmsi: r.mmsi,
    imo: r.imo || null,
    name: (r.vessel_name ?? "").trim() || `MMSI ${r.mmsi}`,
    lat: r.latitude,
    lon: r.longitude,
    sog: r.sog ?? 0,
    cog: r.cog ?? 0,
    heading: r.heading != null && r.heading < 360 ? r.heading : null,
    navStatus: r.nav_status ?? null,
    at: r.timestamp,
  }));
}

/**
 * Takes a new west-Gulf picture when its turn has come. Safe to call on every
 * refresh: it returns at once when it is not yet time, or when no key is set.
 */
export async function refreshWestGulf(now = Date.now()): Promise<{ ran: boolean; ships?: number; calls?: number; remaining?: number | null; error?: string }> {
  const key = process.env.VESSELAPI_KEY;
  const fixtures = process.env.FIXTURE_DIR;
  if (!key && !fixtures) return { ran: false };
  const s = store();
  const prev = (await s.doc<WestGulfDoc>(DOC)) ?? EMPTY;
  if (prev.nextAt && now < Date.parse(prev.nextAt)) return { ran: false };

  const rows: ApiVessel[] = [];
  let calls = 0;
  let remaining: number | null = prev.remaining;
  let resetAt: number | null = prev.resetAt ? Date.parse(prev.resetAt) : null;
  let error: string | undefined;

  try {
    for (const b of WEST_GULF_BOXES) {
      if (fixtures) {
        if (b.fixture) rows.push(...(JSON.parse(await readFile(path.join(fixtures, `${b.fixture}.json`), "utf8")) as { vessels: ApiVessel[] }).vessels);
        continue;
      }
      let token: string | undefined;
      for (let page = 0; page < PAGES_PER_BOX; page++) {
        if (remaining !== null && remaining <= RESERVE) break;
        const [l, r, bottom, top] = b.box;
        const q = new URLSearchParams({
          "filter.lonLeft": String(l), "filter.lonRight": String(r), "filter.latBottom": String(bottom), "filter.latTop": String(top),
          "pagination.limit": "50",
        });
        if (token) q.set("pagination.nextToken", token);
        const res = await fetch(`${BASE}?${q}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
        calls++;
        const left = Number(res.headers.get("x-ratelimit-remaining"));
        if (Number.isFinite(left) && res.headers.has("x-ratelimit-remaining")) remaining = left;
        resetAt = parseReset(res.headers.get("x-ratelimit-reset")) ?? resetAt;
        if (res.status === 429) { remaining = 0; throw new Error("monthly allowance used up"); }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { vessels?: ApiVessel[]; nextToken?: string };
        rows.push(...(body.vessels ?? []));
        token = body.nextToken || undefined;
        if (!token) break;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const reset = resetAt && resetAt > now ? resetAt : nextMonthStart(now);
  const gap = spacing(remaining ?? 150, calls || prev.callsLastRun || 7, now, reset);
  const ships = latestPerShip(rows);
  const doc: WestGulfDoc = {
    // A failed run keeps the last good ships so the chart does not empty.
    at: ships.length ? new Date(now).toISOString() : prev.at,
    ships: ships.length ? ships : prev.ships,
    remaining,
    resetAt: new Date(reset).toISOString(),
    callsLastRun: calls,
    nextAt: new Date(gap === null ? reset : now + gap).toISOString(),
    ...(error ? { error } : {}),
  };
  await s.putDoc(DOC, doc);
  return { ran: true, ships: ships.length, calls, remaining, error };
}
