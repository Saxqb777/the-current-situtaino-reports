import type { Severity, SourceKind, WatchEvent, ZoneId } from "./types";

/** Severity colours follow IALA buoyage: yellow caution, red port-hand, magenta for chart hazards. */
export const SEVERITY_META: Record<Severity, { label: string; color: string; word: string }> = {
  low: { label: "Low", color: "var(--sev-low)", word: "Normal" },
  elevated: { label: "Elevated", color: "var(--sev-elevated)", word: "Elevated" },
  high: { label: "High", color: "var(--sev-high)", word: "High" },
  critical: { label: "Critical", color: "var(--sev-critical)", word: "Critical" },
};

export const KIND_LABEL: Record<SourceKind, string> = {
  official: "Official",
  wire: "Wire",
  broadcaster: "Broadcaster",
  trade: "Shipping press",
  regional: "Regional press",
  aggregator: "News search",
};

export function utcTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function utcDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Degrees and decimal minutes, the way positions are written on a chart. */
export function dm(value: number, axis: "lat" | "lon"): string {
  const hemi = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${String(deg).padStart(axis === "lat" ? 2 : 3, "0")}°${min.toFixed(1).padStart(4, "0")}′${hemi}`;
}

export function sourceLine(e: WatchEvent): string {
  const names = [...new Set(e.sources.map((s) => s.publisher || s.name))];
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

export const ZONE_ORDER: ZoneId[] = ["hormuz", "gulf", "redsea", "aden", "somalia"];

/** AIS ship type code to the three groups the chart colours. */
export function shipGroup(type: number): "tanker" | "cargo" | "other" {
  if (type >= 80 && type <= 89) return "tanker";
  if (type >= 70 && type <= 79) return "cargo";
  return "other";
}
