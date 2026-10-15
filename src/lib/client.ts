export type ShipGroup = "tanker" | "cargo" | "other";
export type ShipSource = "hormuz" | "westGulf" | "ais";

export interface VesselLite {
  /** "h…" for hormuz.now ships, "m…" plus the MMSI for the other feeds. */
  id: string;
  name: string;
  lon: number;
  lat: number;
  course: number;
  sog: number;
  group: ShipGroup;
  /** hormuz.now's finer category: tanker, cargo, special, fishing, passenger… */
  category: string;
  /** No position for a long time while at sea: transponder off, or out of range. */
  dark: boolean;
  unifeeder: boolean;
  moving: boolean;
  commercial: boolean;
  /** Minutes since the position was reported, when the page loaded it. */
  ageMin: number;
  destination: string;
  flag: string;
  type: string;
  length: number;
  dwt: number;
  source: ShipSource;
}

type Row = [string, string, number, number, number, number, 0 | 1 | 2, number, number, string, string, string, string, number, number, 0 | 1 | 2];

const GROUPS: ShipGroup[] = ["tanker", "cargo", "other"];
const SOURCES: ShipSource[] = ["hormuz", "westGulf", "ais"];

export function decodeVessels(rows: Row[]): VesselLite[] {
  return rows.map(([id, name, lon, lat, course, sog, group, flags, ageMin, destination, category, flag, type, length, dwt, source]) => ({
    id, name, lon, lat, course, sog, group: GROUPS[group] ?? "other", category: category || GROUPS[group] || "other",
    dark: Boolean(flags & 1), unifeeder: Boolean(flags & 2), moving: Boolean(flags & 4), commercial: Boolean(flags & 8),
    ageMin, destination, flag, type, length, dwt, source: SOURCES[source] ?? "ais",
  }));
}

export interface ShipFeeds {
  hormuz: { ships: number; at: string | null };
  westGulf: { ships: number; at: string | null; nextAt: string | null };
  ais: { ships: number };
}

export type Selection =
  | { kind: "event"; id: string }
  | { kind: "port"; id: string }
  | { kind: "vessel"; id: string }
  | null;

export interface Layers {
  ships: boolean;
  /** Ships stopped at anchor or moored, drawn as dots. */
  anchored: boolean;
  /** Ship density glow at wide zoom. */
  density: boolean;
  unifeeder: boolean;
  dark: boolean;
  ports: boolean;
  events: boolean;
  areas: boolean;
  /** hormuz.now's anchorages, counting line and lanes. */
  hormuz: boolean;
  /** The route in from Suez to the Gulf, each leg coloured by our level. */
  route: boolean;
}

/** Reads the current theme's colour tokens so the WebGL map can match the CSS. */
export function readTokens(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const names = [
    "paper", "ink", "ink-2", "ink-3", "rule", "olive", "olive-ink", "magenta", "sea-shallow", "sea-200", "sea-1000", "sea-3000",
    "land", "land-edge", "border-line", "sev-low", "sev-elevated", "sev-high", "sev-critical", "ship-tanker", "ship-cargo", "ship-other",
  ];
  return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()]));
}
