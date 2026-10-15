import type { HzAreas } from "./hormuz";

/**
 * Port congestion as the screens show it: how long ships wait, week by week
 * (MarineTraffic), and how many are waiting right now (hormuz.now). Safe to
 * use in the browser; the fetching lives in congestion.ts.
 */

/** One ISO week at one port: median days at anchor and in port, and how many ships and calls those medians cover. */
export interface CongestionWeek {
  year: number;
  week: number;
  /** Monday the week starts, "2026-10-05". */
  start: string;
  anchorDays: number | null;
  portDays: number | null;
  ships: number | null;
  calls: number | null;
}

export interface PortCongestionDoc {
  /** When MarineTraffic was last asked about this port. */
  at: string;
  weeks: CongestionWeek[];
  error?: string;
}

export interface CongestionDoc {
  at: string | null;
  ports: Record<string, PortCongestionDoc>;
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
  weeks: CongestionWeek[];
  /** The newest week with a figure. */
  latest: CongestionWeek | null;
  /** Days at anchor in the newest week, or days in port where the port has no anchorage figure. */
  days: number | null;
  /** What `days` measures. */
  measure: "anchor" | "port" | null;
  /** The middle of the weeks before the newest one, for comparison. */
  typical: number | null;
  level: WaitLevel | null;
  live: LiveWait | null;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * High when the newest week's wait is half as long again as usual and at
 * least a day longer; elevated when it is a fifth longer and half a day.
 * Small changes on short waits stay normal.
 */
export function waitLevel(days: number | null, typical: number | null): WaitLevel | null {
  if (days === null) return null;
  if (typical === null) return "normal";
  if (days >= typical * 1.5 && days - typical >= 1) return "high";
  if (days >= typical * 1.2 && days - typical >= 0.5) return "elevated";
  return "normal";
}

const WEEK_MS = 7 * 86_400_000;

/** A port's waits: the newest finished week against the weeks before it, and what hormuz.now sees off it now. */
export function portWait(id: string, doc: CongestionDoc | null | undefined, areas: HzAreas | null | undefined, now: number): PortWait {
  const weeks = [...(doc?.ports[id]?.weeks ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  const hasAnchor = weeks.some((w) => w.anchorDays !== null);
  const measure = weeks.length ? (hasAnchor ? "anchor" : "port") : null;
  const value = (w: CongestionWeek) => (measure === "anchor" ? w.anchorDays : w.portDays);
  // The week under way is still filling up; compare finished weeks.
  const withFigure = weeks.filter((w) => value(w) !== null && Date.parse(w.start) + WEEK_MS <= now);
  const latest = withFigure.at(-1) ?? null;
  const days = latest ? value(latest) : null;
  const typical = median(withFigure.slice(0, -1).map((w) => value(w) as number));

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

  return { id, weeks, latest, days, measure, typical, level: waitLevel(days, typical), live };
}

/** "0.4 days" → "10 h"; "2.35" → "2.4 days". */
/** Waits for every port that has any figure, keyed by port id. */
export function allWaits(ids: string[], doc: CongestionDoc | null | undefined, areas: HzAreas | null | undefined, now: number): Record<string, PortWait> {
  const out: Record<string, PortWait> = {};
  for (const id of ids) {
    const w = portWait(id, doc, areas, now);
    if (w.days !== null || w.live) out[id] = w;
  }
  return out;
}

export function daysWord(d: number | null): string {
  if (d === null) return "–";
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  return `${d.toFixed(1)} ${d === 1 ? "day" : "days"}`;
}

/** The same, short enough for a table column: "2.4 d", "10 h". */
export function daysShort(d: number | null): string {
  if (d === null) return "–";
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  return `${d.toFixed(1)} d`;
}

export function hoursWord(h: number | null): string {
  if (h === null) return "–";
  return h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;
}

export const LEVEL_WORD: Record<WaitLevel, string> = { high: "Congested", elevated: "Busier", normal: "Usual" };

/** ISO week of a moment: the year and week number used by MarineTraffic. */
export function isoWeek(t: number): { year: number; week: number } {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - y0) / 86_400_000 + 1) / 7) };
}

/** The Monday an ISO week starts, as "2026-10-05". */
export function weekStart(year: number, week: number): string {
  const jan4 = Date.UTC(year, 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * 86_400_000;
  return new Date(monday + (week - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
}
