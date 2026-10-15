import { SEVERITIES, type Severity, type ZoneId, type ZoneSummary } from "./types";

/**
 * Our own reading of the picture: one verdict across the five sea lanes, the
 * bottom line in three sentences, and what changed since the reader last
 * looked. Built from our graded reports first; strait and port figures only
 * add the numbers.
 */

/** The way in from Europe: Suez, down the Red Sea, round Arabia, through Hormuz into the Gulf. */
export const ROUTE: ZoneId[] = ["redsea", "aden", "somalia", "hormuz", "gulf"];

/** Names as a sentence uses them. */
export const LANE_NAME: Record<ZoneId, string> = {
  redsea: "Red Sea",
  aden: "Bab el-Mandeb",
  somalia: "Somali coast",
  hormuz: "Hormuz",
  gulf: "Arabian Gulf",
};

const LEVEL_WORD: Record<Severity, string> = { low: "normal", elevated: "elevated", high: "high", critical: "critical" };
const COUNT = ["No", "One", "Two", "Three", "Four", "Five"];

/** A run of headline text; `level` colours it. */
export interface Segment {
  text: string;
  level?: Severity;
}

const rank = (s: Severity) => SEVERITIES.indexOf(s);

const names = (ids: ZoneId[]) => {
  const n = ids.map((id) => LANE_NAME[id]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};

export function worstLevel(zones: ZoneSummary[]): Severity {
  return zones.reduce<Severity>((w, z) => (rank(z.level) > rank(w) ? z.level : w), "low");
}

/**
 * The headline, in up to three short sentences:
 * "Bab el-Mandeb critical. Three more lanes high. Hormuz traffic at 10% of normal."
 */
export function verdict(zones: ZoneSummary[], hormuzPct: number | null): Segment[] {
  const byLevel = (l: Severity) => ROUTE.filter((id) => zones.find((z) => z.zone === id)?.level === l);
  const critical = byLevel("critical");
  const high = byLevel("high");
  const elevated = byLevel("elevated");
  const out: Segment[] = [];
  const sentence = (lead: string, level: Severity, tail = ".") => {
    out.push({ text: lead ? `${lead} ` : "" }, { text: LEVEL_WORD[level], level }, { text: `${tail} ` });
  };

  if (critical.length) {
    sentence(names(critical), "critical");
    if (high.length) sentence(`${COUNT[high.length] ?? high.length} more ${high.length === 1 ? "lane" : "lanes"}`, "high");
  } else if (high.length >= 3) {
    sentence(`${COUNT[high.length]} of five sea lanes`, "high");
  } else if (high.length) {
    sentence(names(high), "high");
    if (elevated.length) sentence(names(elevated), "elevated");
  } else if (elevated.length) {
    sentence(names(elevated), "elevated");
  } else {
    sentence("All five sea lanes", "low");
  }

  if (hormuzPct !== null) {
    const pct = Math.round(hormuzPct);
    out.push({ text: pct >= 90 ? "Hormuz traffic near normal." : `Hormuz traffic at ${pct}% of normal.` });
  }
  return out;
}

export const verdictText = (segs: Segment[]) => segs.map((s) => s.text).join("").trim();

export interface BottomLine {
  label: string;
  text: string;
  level?: Severity;
}

export interface BottomInput {
  zones: ZoneSummary[];
  strait: { ais7: number; baseline: number; waiting: number | null } | null;
  /** Ports with a weekly wait, any order. */
  waits: { name: string; days: number; longer: boolean }[];
}

/** Three plain sentences an executive can read out: the strait, the worst lane elsewhere, the ports. */
export function bottomLine({ zones, strait, waits }: BottomInput): BottomLine[] {
  const out: BottomLine[] = [];
  if (strait) {
    const waiting = strait.waiting !== null ? `${strait.waiting.toLocaleString("en-GB")} ships are waiting at anchor near the strait. ` : "";
    out.push({
      label: "Hormuz",
      text: `${waiting}This week ${strait.ais7.toFixed(1)} a day are crossing, against ${strait.baseline.toFixed(1)} before the crisis.`,
      level: zones.find((z) => z.zone === "hormuz")?.level,
    });
  }
  const elsewhere = zones
    .filter((z) => z.zone !== "hormuz" && z.headline && rank(z.level) >= rank("high"))
    .sort((a, b) => rank(b.level) - rank(a.level) || ROUTE.indexOf(a.zone) - ROUTE.indexOf(b.zone))
    .slice(0, 1);
  for (const z of elsewhere) out.push({ label: LANE_NAME[z.zone], text: z.headline!.replace(/\s*[.!]?$/, "."), level: z.level });
  if (waits.length) {
    const longer = waits.filter((w) => w.longer).length;
    const top = [...waits].sort((a, b) => b.days - a.days)[0];
    const d = top.days < 1 ? `${Math.max(1, Math.round(top.days * 24))} hours` : `${top.days.toFixed(1)} days`;
    out.push({ label: "Ports", text: `${longer} of ${waits.length} have longer waits than usual. The longest is ${top.name}, at ${d}.` });
  }
  return out;
}

/** What a reader saw last time, kept in their browser. */
export interface Seen {
  t: number;
  levels: Partial<Record<ZoneId, Severity>>;
  /** Ids of the high and critical reports on screen. */
  serious: string[];
}

export interface Change {
  text: string;
  level?: Severity;
  up?: boolean;
}

/** Level moves and new serious reports since `prev`, worst news first. */
export function changesSince(prev: Seen, cur: Seen): Change[] {
  const moves: Change[] = [];
  for (const id of ROUTE) {
    const a = prev.levels[id];
    const b = cur.levels[id];
    if (!a || !b || a === b) continue;
    const up = rank(b) > rank(a);
    moves.push({ text: `${LANE_NAME[id]} ${up ? "up" : "down"} to ${LEVEL_WORD[b]}, from ${LEVEL_WORD[a]}`, level: b, up });
  }
  moves.sort((x, y) => Number(y.up) - Number(x.up) || rank(y.level!) - rank(x.level!));
  const seen = new Set(prev.serious);
  const fresh = cur.serious.filter((id) => !seen.has(id)).length;
  if (fresh) moves.push({ text: `${fresh} new serious ${fresh === 1 ? "report" : "reports"}`, level: "high", up: true });
  return moves;
}
