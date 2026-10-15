export type ZoneId = "gulf" | "hormuz" | "redsea" | "aden" | "somalia";

/** Ordered from calm to worst. The index doubles as a numeric rank. */
export const SEVERITIES = ["low", "elevated", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type SourceKind = "official" | "wire" | "broadcaster" | "trade" | "regional" | "aggregator";

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  /** "rss" covers RSS 2.0 and Atom. */
  format: "rss" | "gdelt";
  /** True for feeds that are already about shipping, so every item counts as maritime. */
  maritime?: boolean;
}

export interface SourceHealth {
  id: string;
  name: string;
  kind: SourceKind;
  ok: boolean;
  lastChecked: string | null;
  lastOk: string | null;
  items: number;
  error?: string;
}

/** One article as it came out of one feed. */
export interface RawItem {
  sourceId: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  /** The outlet behind an aggregated item, such as Reuters inside Google News. */
  publisher?: string;
}

/** One article after it was matched to zones, ports and a severity. */
export interface ClassifiedItem extends RawItem {
  zones: ZoneId[];
  ports: string[];
  severity: Severity;
  tags: string[];
  /** Official bodies (UKMTO, JMIC, navies) named as the origin of the report. */
  citesOfficial: string[];
}

export interface EventSource {
  sourceId: string;
  name: string;
  publisher?: string;
  kind: SourceKind;
  url: string;
  title: string;
  publishedAt: string;
}

/** A real-world happening, merged from every article that reports it. */
export interface WatchEvent {
  id: string;
  title: string;
  summary: string;
  zones: ZoneId[];
  ports: string[];
  severity: Severity;
  tags: string[];
  citesOfficial: string[];
  official: boolean;
  firstSeen: string;
  lastSeen: string;
  /** [lon, lat] of the best-matching port or zone. */
  position: [number, number];
  sources: EventSource[];
}

export interface Vessel {
  mmsi: number;
  name: string;
  callSign?: string;
  shipType?: number;
  destination?: string;
  lon: number;
  lat: number;
  sog: number;
  cog: number;
  heading?: number;
  lastSeen: string;
  zone: ZoneId | null;
  /** Last report was inside a watch zone, at sea, and is now older than the dark threshold. */
  dark: boolean;
  track: [number, number][];
}

export interface ZoneSummary {
  zone: ZoneId;
  level: Severity;
  events24h: number;
  vessels: number;
  dark: number;
  transits24h: number | null;
  headline: string | null;
}

export interface Snapshot {
  generatedAt: string;
  sample: boolean;
  ais: { connected: boolean; configured: boolean; vessels: number; lastMessage: string | null };
  zones: ZoneSummary[];
  events: WatchEvent[];
  sources: SourceHealth[];
}
