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

/**
 * Every time on screen and in the PDF is Gulf Standard Time, Dubai's clock:
 * UTC+4 all year, no daylight saving. Data stays in UTC; only what people
 * read is shifted. A fixed offset read with the UTC getters gives the same
 * text on the server and in any browser, whatever its own time zone.
 */
export const GST_MS = 4 * 3600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const gst = (t: string | number) => new Date((typeof t === "number" ? t : Date.parse(t)) + GST_MS);
const two = (n: number) => String(n).padStart(2, "0");

/** "14:16", Dubai time. */
export function gstTime(t: string | number): string {
  const d = gst(t);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** "14:00", Dubai time, for hourly charts. */
export function gstHour(t: string | number): string {
  return `${two(gst(t).getUTCHours())}:00`;
}

/** "15 Oct", the day in Dubai. */
export function gstDate(t: string | number): string {
  const d = gst(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "15 Oct 2026", the day in Dubai. */
export function gstLongDate(t: string | number): string {
  return `${gstDate(t)} ${gst(t).getUTCFullYear()}`;
}

/** Midnight in Dubai at the start of the moment's day, as a timestamp. */
export function gstMidnight(t: number): number {
  return Math.floor((t + GST_MS) / 86_400_000) * 86_400_000 - GST_MS;
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

/** Minutes old, written the same way as `ago`. */
export function agoMin(min: number): string {
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

let regionNames: Intl.DisplayNames | null = null;
/** "PA" → "Panama"; falls back to the code. */
export function flagName(code: string): string {
  if (!code || code.length !== 2) return code;
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** 321735 → "321,735 t". */
export const tonnes = (n: number) => `${Math.round(n).toLocaleString("en-GB")} t`;
