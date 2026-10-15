export interface VesselLite {
  mmsi: number;
  name: string;
  lon: number;
  lat: number;
  course: number;
  sog: number;
  type: number;
  dark: boolean;
  unifeeder: boolean;
  lastSeen: string;
  destination: string;
}

type Row = [number, string, number, number, number, number, number, number, string, string];

export function decodeVessels(rows: Row[]): VesselLite[] {
  return rows.map(([mmsi, name, lon, lat, course, sog, type, flags, lastSeen, destination]) => ({
    mmsi, name, lon, lat, course, sog, type, dark: Boolean(flags & 1), unifeeder: Boolean(flags & 2), lastSeen, destination,
  }));
}

export type Selection =
  | { kind: "event"; id: string }
  | { kind: "port"; id: string }
  | { kind: "vessel"; id: number }
  | null;

export interface Layers {
  ships: boolean;
  unifeeder: boolean;
  dark: boolean;
  ports: boolean;
  events: boolean;
  areas: boolean;
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
