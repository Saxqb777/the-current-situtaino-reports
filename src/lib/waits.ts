import type { HzAreas } from "./hormuz";

/**
 * Port congestion as the screens show it: how long ships are queuing at each
 * GCC port's container terminals right now and how busy the terminals are
 * (Kpler, read hourly), with how many ships of any kind wait off the port
 * (hormuz.now). Safe to use in the browser; the fetching lives in
 * congestion.ts.
 */

/** The GCC ports we ask Kpler about, our id to UN/LOCODE. Container terminals only. */
export const GCC_PORTS: Record<string, string> = {
  "jebel-ali": "AEJEA",
  khalifa: "AEKHL",
  "khor-fakkan": "AEKLF",
  fujairah: "AEFJR",
  khalid: "AESHJ",
  dammam: "SADMM",
  jubail: "SAJUB",
  jeddah: "SAJED",
  "king-abdullah": "SAKAC",
  hamad: "QAHMD",
  "khalifa-bin-salman": "BHKBS",
  shuwaikh: "KWSWK",
  shuaiba: "KWSAA",
  sohar: "OMSOH",
  salalah: "OMSLL",
  duqm: "OMDQM",
};

/** One container terminal's reading. Times are in hours. */
export interface TerminalReading {
  id: string;
  name: string;
  /** Kpler's congestion index, 0 to 10. */
  index: number | null;
  /** Ships queuing for a berth now. */
  waiting: number | null;
  /** How long the ships queuing now have waited, on average. */
  waitHours: number | null;
  /** The terminal's usual wait. */
  usualHours: number | null;
  /** Ships alongside now. */
  alongside: number | null;
  stayHours: number | null;
  usualStayHours: number | null;
  /** Lines calling, by name. */
  carriers: string[];
  /** When Kpler last updated the reading. */
  at: string | null;
}

export interface PortCongestion {
  /** UN/LOCODE asked about. */
  code: string;
  /** When we last read this port. */
  at: string;
  terminals: TerminalReading[];
}

/** One point of our own record: hours since 1970, index, ships waiting, average wait in hours. */
export type HistoryPoint = [hour: number, index: number | null, waiting: number, waitHours: number | null];

export interface CongestionDoc {
  v: 2;
  /** When Kpler was last asked. */
  at: string | null;
  ports: Record<string, PortCongestion>;
  /** A point every few hours per port, the last 30 days. */
  history: Record<string, HistoryPoint[]>;
  error?: string;
}

/** Our port id to hormuz.now's anchorage, for ships waiting off it right now. */
export const PORT_AREA: Record<string, string> = {
  fujairah: "fujairah",
  "khor-fakkan": "khor-fakkan",
  sohar: "sohar",
  khalid: "sharjah",
  "bandar-abbas": "bandar-abbas",
  "jebel-ali": "dubai",
  "mina-rashid": "dubai",
  khalifa: "abu-dhabi",
  zayed: "abu-dhabi",
  saqr: "rak",
};

export type WaitLevel = "high" | "elevated" | "normal";

export interface LiveWait {
  area: string;
  areaName: string;
  waiting: number;
  medianHours: number | null;
  over24h: number | null;
  over7d: number | null;
  /** Ships waiting each day, oldest first, days without a reading left out. */
  trend: number[];
}

export interface PortWait {
  id: string;
  /** The busiest terminal's congestion index, 0 to 10. */
  index: number | null;
  /** From the index: 7 or more busy, 4 to 7 moderate, under 4 normal. */
  level: WaitLevel | null;
  /** Ships queuing at the port's container terminals now. */
  waiting: number;
  /** Ships alongside now. */
  alongside: number | null;
  /** How long the ships queuing now have waited, in days; 0 when none are queuing. */
  days: number | null;
  /** The port's usual wait, in days. */
  typical: number | null;
  /** Clearly longer than usual: a quarter longer and six hours more. */
  longer: boolean;
  terminals: TerminalReading[];
  history: HistoryPoint[];
  /** When we last read the port. */
  at: string | null;
  live: LiveWait | null;
}

/** Waits longer than a month are a terminal's stale record, not a queue; Kpler shows a few. */
export const MAX_WAIT_HOURS = 720;

/** The owner's rule: 7 or more busy, 4 to 7 moderate, under 4 normal. */
export function indexLevel(index: number | null): WaitLevel | null {
  if (index === null) return null;
  if (index >= 7) return "high";
  if (index >= 4) return "elevated";
  return "normal";
}

/** A quarter longer than usual and at least six hours more; small changes on short waits do not count. */
export function isLonger(days: number | null, typical: number | null): boolean {
  if (days === null || typical === null) return false;
  return days >= typical * 1.25 && days - typical >= 0.25;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/**
 * A port from its terminals: the busiest terminal's index, ships waiting
 * summed, and the average wait weighted by how many queue at each terminal.
 */
export function portFigures(terminals: TerminalReading[]): { index: number | null; waiting: number; alongside: number | null; waitHours: number | null; usualHours: number | null } {
  const indexes = terminals.map((t) => t.index).filter((v): v is number => v !== null);
  const waiting = sum(terminals.map((t) => t.waiting));
  const queued = terminals.filter((t) => (t.waiting ?? 0) > 0 && t.waitHours !== null && t.waitHours <= MAX_WAIT_HOURS);
  const n = sum(queued.map((t) => t.waiting));
  const waitHours = waiting === 0 ? 0 : n > 0 ? sum(queued.map((t) => t.waitHours! * t.waiting!)) / n : null;
  const usual = terminals.map((t) => t.usualHours).filter((v): v is number => v !== null && v <= MAX_WAIT_HOURS);
  const along = terminals.map((t) => t.alongside).filter((v): v is number => v !== null);
  return {
    index: indexes.length ? Math.max(...indexes) : null,
    waiting,
    alongside: along.length ? sum(along) : null,
    waitHours,
    usualHours: usual.length ? sum(usual) / usual.length : null,
  };
}

/** A port's waits now, its own record, and what hormuz.now sees off it. */
export function portWait(id: string, doc: CongestionDoc | null | undefined, areas: HzAreas | null | undefined): PortWait {
  const p = doc?.v === 2 ? doc.ports[id] : undefined;
  const terminals = p?.terminals ?? [];
  const f = portFigures(terminals);
  const days = terminals.length && f.waitHours !== null ? f.waitHours / 24 : null;
  const typical = f.usualHours !== null ? f.usualHours / 24 : null;

  const areaId = PORT_AREA[id];
  const a = areaId ? areas?.areas.find((x) => x.id === areaId) : undefined;
  const w = areaId ? areas?.waiting.areas.find((x) => x.id === areaId) : undefined;
  const live: LiveWait | null = a || w
    ? {
      area: areaId,
      areaName: (a?.name ?? w?.name ?? "").replace(/ anchorage$/i, ""),
      waiting: w?.count ?? a?.waiting ?? 0,
      medianHours: w?.medianHours ?? null,
      over24h: w?.over24h ?? null,
      over7d: w?.over7d ?? null,
      trend: (a?.trend ?? []).filter((n) => n >= 0),
    }
    : null;

  return {
    id,
    index: f.index,
    level: indexLevel(f.index),
    waiting: f.waiting,
    alongside: f.alongside,
    days,
    typical,
    longer: isLonger(days, typical),
    terminals,
    history: doc?.v === 2 ? doc.history[id] ?? [] : [],
    at: p?.at ?? null,
    live,
  };
}

/** Waits for every port that has any figure, keyed by port id. */
export function allWaits(ids: string[], doc: CongestionDoc | null | undefined, areas: HzAreas | null | undefined): Record<string, PortWait> {
  const out: Record<string, PortWait> = {};
  for (const id of ids) {
    const w = portWait(id, doc, areas);
    if (w.terminals.length || w.live) out[id] = w;
  }
  return out;
}

/** The GCC ports with terminal figures. */
export function gccWaits(doc: CongestionDoc | null | undefined, areas: HzAreas | null | undefined): PortWait[] {
  return Object.keys(GCC_PORTS).map((id) => portWait(id, doc, areas)).filter((w) => w.terminals.length > 0);
}

/** The record as one figure a day, the day's average wait in days, oldest first: calm enough for a sparkline. */
export function dailyWait(history: HistoryPoint[]): number[] {
  const days = new Map<number, number[]>();
  for (const [h, , , wh] of history) {
    if (wh === null) continue;
    const d = Math.floor(h / 24);
    days.set(d, [...(days.get(d) ?? []), wh]);
  }
  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.reduce((x, y) => x + y, 0) / v.length / 24);
}

/** "0.4 days" → "10 h"; "2.35" → "2.4 days"; nobody queuing → "No queue". */
export function daysWord(d: number | null): string {
  if (d === null) return "–";
  if (d === 0) return "No queue";
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  return `${d.toFixed(1)} ${d === 1 ? "day" : "days"}`;
}

/** The same, short enough for a table column: "2.4 d", "10 h", "0". */
export function daysShort(d: number | null): string {
  if (d === null) return "–";
  if (d === 0) return "0";
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  return `${d.toFixed(1)} d`;
}

/** A change in days, signed and short: "+2.1 d", "−5 h", "same". */
export function diffShort(d: number | null): string {
  if (d === null) return "–";
  const h = Math.round(Math.abs(d) * 24);
  if (h === 0) return "same";
  const sign = d > 0 ? "+" : "−";
  return h < 24 ? `${sign}${h} h` : `${sign}${Math.abs(d).toFixed(1)} d`;
}

export function hoursWord(h: number | null): string {
  if (h === null) return "–";
  return h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;
}

export const LEVEL_WORD: Record<WaitLevel, string> = { high: "Busy", elevated: "Moderate", normal: "Normal" };
