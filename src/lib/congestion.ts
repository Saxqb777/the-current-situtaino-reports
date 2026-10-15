import { readFile } from "node:fs/promises";
import path from "node:path";
import { store } from "./store";
import { type CongestionDoc, GCC_PORTS, type HistoryPoint, type PortCongestion, type TerminalReading, portFigures } from "./waits";

/**
 * Container-terminal congestion at the GCC ports, from Kpler's terminal
 * congestion API: ships queuing and alongside, how long they have waited,
 * the terminal's usual wait and a 0–10 congestion index. Reads cost no
 * credits. Kpler takes five ports a call, so the sixteen ports are four
 * calls, made once an hour.
 *
 * The key goes in a header and is never logged; error text keeps only the
 * status and Kpler's error code.
 */
const BASE = "https://api.kpler.com/v1/logistics/containers/terminal-congestions";
const ORIGIN = new URL(BASE).origin;
const DOC = "congestion";
const HOUR = 3600_000;
/** Refreshes run every ten minutes; asking after 55 lands each read close to the hour. */
const EVERY_MS = 55 * 60_000;
const PER_CALL = 5;
const MAX_PAGES = 3;
/** A point in our own record every three hours, kept thirty days. */
const HISTORY_STEP_H = 3;
const HISTORY_DAYS = 30;

const EMPTY: CongestionDoc = { v: 2, at: null, ports: {}, history: {} };

/** The stored doc, or empty when it is missing or from the old weekly source. */
async function stored(): Promise<CongestionDoc | null> {
  const doc = await store().doc<CongestionDoc>(DOC);
  return doc?.v === 2 ? doc : null;
}

export async function congestion(): Promise<CongestionDoc> {
  const doc = await stored();
  // Local work from a saved response: fill every port straight away.
  if (!doc && process.env.FIXTURE_DIR) {
    await refreshCongestion();
    return (await stored()) ?? EMPTY;
  }
  return doc ?? EMPTY;
}

interface ApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

interface ApiPage {
  data?: ApiResource[];
  included?: ApiResource[];
  links?: { next?: string | null };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Kpler's pages to terminal readings, grouped by UN/LOCODE. */
export function readTerminals(pages: ApiPage[]): Record<string, TerminalReading[]> {
  const included = new Map<string, ApiResource>();
  for (const page of pages) for (const r of page.included ?? []) included.set(`${r.type}:${r.id}`, r);
  const find = (rel: { data?: { id: string; type: string } | null } | undefined) =>
    rel?.data ? included.get(`${rel.data.type}:${rel.data.id}`) : undefined;

  const out: Record<string, TerminalReading[]> = {};
  const seen = new Set<string>();
  for (const page of pages) {
    for (const item of page.data ?? []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const port = find(item.relationships?.port);
      const terminal = find(item.relationships?.terminal);
      const code = str(port?.attributes?.unlocode)?.toUpperCase();
      if (!code) continue;
      const a = obj(item.attributes);
      const live = obj(a.liveMetrics);
      const perf = obj(a.performanceInsights);
      const carriers = Array.isArray(a.carriers) ? a.carriers.map((c) => str(obj(c).name)).filter((n): n is string => Boolean(n)) : [];
      (out[code] ??= []).push({
        id: terminal?.id ?? item.id,
        name: str(terminal?.attributes?.name) ?? "Container terminal",
        index: num(live.congestionIndex),
        waiting: num(live.vesselsWaiting),
        waitHours: num(live.vesselsWaitingAvgTime),
        usualHours: num(perf.avgWaitingTime),
        alongside: num(live.vesselsStay),
        stayHours: num(live.vesselsStayAvgTime),
        usualStayHours: num(perf.avgStayTime),
        carriers: [...new Set(carriers)].slice(0, 12),
        at: str(live.lastUpdatedAt),
      });
    }
  }
  for (const list of Object.values(out)) list.sort((x, y) => (y.index ?? -1) - (x.index ?? -1) || x.name.localeCompare(y.name));
  return out;
}

/** A failure that will repeat for every call (a bad key, no access), so the run stops at the first. */
const FATAL = new Set([401, 403]);

class KplerError extends Error {
  constructor(readonly status: number, code: string | null) {
    super(`HTTP ${status}${code ? ` ${code}` : ""}`);
  }
}

/** The first page's URL, written the way BMB Tracker writes it: one filter entry per port, brackets and comma as they are. */
export function groupUrl(codes: string[]): string {
  return `${BASE}?${codes.map((c) => `filter[port.unlocode][]=${encodeURIComponent(c)}`).join("&")}&include=terminals,ports`;
}

/** One group of up to five ports, following Kpler's next links a few pages. */
async function fetchGroup(codes: string[], key: string): Promise<{ pages: ApiPage[]; calls: number }> {
  let url: string | null = groupUrl(codes);
  const pages: ApiPage[] = [];
  let calls = 0;
  while (url && pages.length < MAX_PAGES) {
    const res = await fetch(url, {
      headers: { "X-Container-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    calls++;
    const body = (await res.json().catch(() => null)) as (ApiPage & { errors?: { code?: unknown }[] }) | null;
    if (!res.ok) {
      const code = str(body?.errors?.[0]?.code);
      throw new KplerError(res.status, code && /^[\w.-]{1,40}$/.test(code) ? code : null);
    }
    pages.push(body ?? {});
    const next = str(body?.links?.next);
    // Only ever send the key back to Kpler.
    url = next && new URL(next, BASE).origin === ORIGIN ? new URL(next, BASE).toString() : null;
  }
  return { pages, calls };
}

/** Adds a point to each freshly read port's record when its last one is old enough, and drops points past thirty days. */
export function addHistory(history: CongestionDoc["history"], ports: Record<string, PortCongestion>, fresh: string[], now: number): CongestionDoc["history"] {
  const hour = Math.floor(now / HOUR);
  const cutoff = hour - HISTORY_DAYS * 24;
  const out: CongestionDoc["history"] = {};
  for (const [id, pts] of Object.entries(history)) out[id] = pts.filter((p) => p[0] > cutoff);
  for (const id of fresh) {
    const f = portFigures(ports[id]?.terminals ?? []);
    const pts = out[id] ?? [];
    const last = pts.at(-1);
    if (last && hour - last[0] < HISTORY_STEP_H) continue;
    const point: HistoryPoint = [hour, f.index === null ? null : Math.round(f.index * 10) / 10, f.waiting, f.waitHours === null ? null : Math.round(f.waitHours)];
    out[id] = [...pts, point];
  }
  return out;
}

export interface CongestionRun {
  ran: boolean;
  calls?: number;
  ports?: number;
  terminals?: number;
  /** Ports Kpler returned nothing for. */
  missing?: string[];
  error?: string;
}

/**
 * Asks Kpler about all sixteen GCC ports when the last read is about an hour
 * old. Safe to call on every refresh: it returns at once when it is not due
 * or no key is set.
 */
export async function refreshCongestion(now = Date.now()): Promise<CongestionRun> {
  // A pasted key can carry a space or line break.
  const key = process.env.MARINETRAFFIC_API_KEY?.trim();
  const fixtures = process.env.FIXTURE_DIR;
  if (!key && !fixtures) return { ran: false };
  const s = store();
  const prev = (await stored()) ?? EMPTY;
  if (prev.at && now - Date.parse(prev.at) < EVERY_MS) return { ran: false };

  const ids = Object.keys(GCC_PORTS);
  const idByCode = Object.fromEntries(ids.map((id) => [GCC_PORTS[id], id]));
  const read: Record<string, TerminalReading[]> = {};
  let calls = 0;
  let error: string | undefined;
  let history = prev.history;

  if (fixtures) {
    const sample = await readFixture(fixtures);
    if (!sample) return { ran: false };
    Object.assign(read, readTerminals(sample.pages));
    history = sample.history ?? {};
  } else {
    const codes = ids.map((id) => GCC_PORTS[id]);
    for (let i = 0; i < codes.length; i += PER_CALL) {
      try {
        const r = await fetchGroup(codes.slice(i, i + PER_CALL), key!);
        calls += r.calls;
        Object.assign(read, readTerminals(r.pages));
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (e instanceof KplerError && FATAL.has(e.status)) break;
        if (e instanceof Error && e.name === "TimeoutError") error = "timed out";
      }
    }
  }

  const at = new Date(now).toISOString();
  const ports = { ...prev.ports };
  const fresh: string[] = [];
  for (const [code, terminals] of Object.entries(read)) {
    const id = idByCode[code];
    if (!id) continue;
    ports[id] = { code, at, terminals };
    fresh.push(id);
  }
  if (!fixtures) history = addHistory(history, ports, fresh, now);

  await s.putDoc(DOC, { v: 2, at, ports, history, ...(error ? { error } : {}) } satisfies CongestionDoc);
  return {
    ran: true,
    calls,
    ports: fresh.length,
    terminals: fresh.reduce((n, id) => n + ports[id].terminals.length, 0),
    missing: ids.filter((id) => !fresh.includes(id)),
    ...(error ? { error } : {}),
  };
}

async function readFixture(dir: string): Promise<{ pages: ApiPage[]; history?: CongestionDoc["history"] } | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, "kpler-congestion.json"), "utf8"));
  } catch {
    return null;
  }
}

/** What the browser gets: the readings and the record, without error text. */
export function publicCongestion(doc: CongestionDoc): CongestionDoc {
  return { v: 2, at: doc.at, ports: doc.ports, history: doc.history };
}
