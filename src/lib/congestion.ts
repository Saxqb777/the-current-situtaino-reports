import { readFile } from "node:fs/promises";
import path from "node:path";
import { store } from "./store";
import { type CongestionDoc, type CongestionWeek, isoWeek, weekStart } from "./waits";

/**
 * How long ships wait at each port, week by week, from MarineTraffic's port
 * congestion service: median days at anchor and in port, over all ship
 * types. Reading it costs no credits on the owner's plan; MarineTraffic
 * allows 100 calls a minute. The figures are weekly, so each port is asked
 * about once a day, a few ports per refresh.
 *
 * The key travels in the URL path, so URLs are never logged.
 */
const BASE = "https://services.marinetraffic.com/api/port-congestion";
const DOC = "congestion";
const DAY = 24 * 3600_000;
/** The newest twelve full weeks and the one under way. */
const WEEKS = 13;
/** Ports asked about per refresh. Refreshes run every ten minutes, so every port comes round within a couple of hours. */
const PER_RUN = 8;
/** After a failure, try that port again sooner than a day. */
const RETRY_MS = 6 * 3600_000;

/**
 * MarineTraffic's id for each of our ports, from the port's page on
 * marinetraffic.com. Khasab, Juaymah, Eyl, Hobyo and Kismayo have no port
 * page there. Shuwaikh is MarineTraffic's "Kuwait", Zayed its "Abu Dhabi",
 * Khalid its "Sharjah", Bandar-e Pars its "Asaluyeh" and the Basra oil
 * terminal its "Al Basrah" (Mina al Bakr).
 */
export const MT_PORT: Record<string, number> = {
  "jebel-ali": 102, "mina-rashid": 104, khalifa: 18611, zayed: 254, ruwais: 1695, "das-island": 1697,
  saqr: 958, khalid: 103, "khor-fakkan": 18560, fujairah: 790, sohar: 18567, muscat: 18585,
  duqm: 18596, salalah: 2732, dammam: 1662, jubail: 956, "ras-tanura": 1665, jeddah: 807,
  "king-abdullah": 21718, yanbu: 2803, neom: 21717, jizan: 19506, hamad: 21901, "ras-laffan": 954,
  mesaieed: 957, sitrah: 5014, "khalifa-bin-salman": 3168, shuwaikh: 252, shuaiba: 253, "mina-al-ahmadi": 3191,
  "umm-qasr": 1008, "basra-terminal": 19795, "bandar-abbas": 1614, bushehr: 1615, kharg: 1616, "bandar-e-pars": 18911,
  chabahar: 19788, "port-said": 2175, suez: 22721, "ain-sokhna": 3203, safaga: 19494, aqaba: 3197,
  eilat: 5051, "port-sudan": 1679, massawa: 19476, assab: 19475, hodeidah: 19502, "ras-isa": 26103,
  mocha: 19501, aden: 19504, mukalla: 3036, djibouti: 18544, berbera: 19473, bosaso: 19474,
  mogadishu: 19472,
};

const EMPTY: CongestionDoc = { at: null, ports: {} };

export async function congestion(): Promise<CongestionDoc> {
  const doc = await store().doc<CongestionDoc>(DOC);
  // Local work from saved responses: fill every port straight away.
  if (!doc && process.env.FIXTURE_DIR) {
    await refreshCongestion();
    return (await store().doc<CongestionDoc>(DOC)) ?? EMPTY;
  }
  return doc ?? EMPTY;
}

/** The (year, first week, last week) ranges covering the last WEEKS weeks: two of them early in January. */
export function weekRanges(now: number): { year: number; from: number; to: number }[] {
  const { year, week } = isoWeek(now);
  if (week >= WEEKS) return [{ year, from: week - WEEKS + 1, to: week }];
  // 28 December always falls in a year's last ISO week.
  const last = isoWeek(Date.UTC(year - 1, 11, 28)).week;
  return [{ year: year - 1, from: last - (WEEKS - week) + 1, to: last }, { year, from: 1, to: week }];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Column order when MarineTraffic answers with arrays rather than objects. */
const FIELDS = ["PORT_ID", "YEAR", "WEEK", "MARKET", "SHIPCLASS", "TIME_ANCH", "TIME_PORT", "VESSELS", "CALLS"];

/** MarineTraffic's rows, as objects or as arrays, to weeks. */
export function readWeeks(body: unknown): CongestionWeek[] {
  const rows: unknown[] = Array.isArray(body) ? body : Array.isArray((body as { DATA?: unknown })?.DATA) ? (body as { DATA: unknown[] }).DATA : [];
  return rows.flatMap((r) => {
    const o = Array.isArray(r) ? Object.fromEntries(FIELDS.map((f, i) => [f, r[i]])) : ((r ?? {}) as Record<string, unknown>);
    const year = num(o.YEAR);
    const week = num(o.WEEK);
    if (year === null || week === null) return [];
    return [{ year, week, start: weekStart(year, week), anchorDays: num(o.TIME_ANCH), portDays: num(o.TIME_PORT), ships: num(o.VESSELS), calls: num(o.CALLS) }];
  });
}

/** A failure that will repeat for every port (a bad key, no access), so the run stops at the first. */
const FATAL = /key|auth|credit|permission|subscri|access|forbidden|401|403/i;

/**
 * Asks MarineTraffic about the ports whose turn has come. Safe to call on
 * every refresh: it returns at once when no port is due or no key is set.
 */
export async function refreshCongestion(now = Date.now()): Promise<{ ran: boolean; ports?: number; calls?: number; errors?: number; error?: string }> {
  const key = process.env.MARINETRAFFIC_API_KEY;
  const fixtures = process.env.FIXTURE_DIR;
  if (!key && !fixtures) return { ran: false };
  const s = store();
  const prev = (await s.doc<CongestionDoc>(DOC)) ?? EMPTY;
  const dueAt = (id: string) => {
    const p = prev.ports[id];
    return p ? Date.parse(p.at) + (p.error ? RETRY_MS : DAY) : 0;
  };
  const due = Object.keys(MT_PORT).filter((id) => dueAt(id) <= now).sort((a, b) => dueAt(a) - dueAt(b));
  if (!due.length) return { ran: false };

  const sample = fixtures ? await readFixture(fixtures) : null;
  if (fixtures && !sample) return { ran: false };
  const batch = sample ? due : due.slice(0, PER_RUN);
  const ports = { ...prev.ports };
  let calls = 0;
  let errors = 0;
  let fatal: string | undefined;

  for (const id of batch) {
    try {
      const weeks: CongestionWeek[] = [];
      if (sample) weeks.push(...readWeeks(sample[id] ?? []));
      else {
        for (const r of weekRanges(now)) {
          const q = new URLSearchParams({
            portid: String(MT_PORT[id]), year: String(r.year), week: `${r.from},${r.to}`,
            agg_market: "1", agg_shipclass: "1", protocol: "jsono",
          });
          const res = await fetch(`${BASE}/${key}?${q}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
          calls++;
          const body: unknown = await res.json().catch(() => null);
          const err = (body as { errors?: { code?: string; detail?: string }[] } | null)?.errors?.[0];
          if (res.status === 429) throw new Error("too many calls");
          if (!res.ok || err) throw new Error(err?.detail ?? `HTTP ${res.status}`);
          weeks.push(...readWeeks(body));
        }
      }
      ports[id] = { at: new Date(now).toISOString(), weeks };
    } catch (e) {
      errors++;
      const message = e instanceof Error ? e.message : String(e);
      // Keep the last good weeks so the page does not empty.
      ports[id] = { weeks: prev.ports[id]?.weeks ?? [], at: new Date(now).toISOString(), error: message };
      if (FATAL.test(message)) { fatal = message; break; }
    }
  }

  await s.putDoc(DOC, { at: new Date(now).toISOString(), ports } satisfies CongestionDoc);
  return { ran: true, ports: batch.length, calls, errors, ...(fatal ? { error: fatal } : {}) };
}

async function readFixture(dir: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, "mt-congestion.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** What the browser gets: the weeks per port, without error text. */
export function publicCongestion(doc: CongestionDoc): CongestionDoc {
  return { at: doc.at, ports: Object.fromEntries(Object.entries(doc.ports).map(([id, p]) => [id, { at: p.at, weeks: p.weeks }])) };
}
