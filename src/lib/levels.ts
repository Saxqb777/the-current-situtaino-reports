import { severityRank } from "./classify";
import type { Severity, WatchEvent } from "./types";
import { SEVERITIES } from "./types";

/** An event's weight on its zone: full for 24h, one step lower until 72h, then nothing. */
function weight(e: WatchEvent, now: number): number {
  const age = now - Date.parse(e.lastSeen);
  if (age < 24 * 3600_000) return severityRank(e.severity);
  if (age < 72 * 3600_000) return severityRank(e.severity) - 1;
  return -1;
}

/** The event that sets a zone's level: heaviest weight, newest on a tie. */
export function leadEvent(events: WatchEvent[], now = Date.now()): WatchEvent | undefined {
  return events
    .filter((e) => weight(e, now) >= 0)
    .sort((a, b) => weight(b, now) - weight(a, now) || b.lastSeen.localeCompare(a.lastSeen))[0];
}

/** A zone's level is the worst event in the last 24h, or one step below the worst in the last 72h. */
export function zoneLevel(events: WatchEvent[], now = Date.now()): Severity {
  const lead = leadEvent(events, now);
  return SEVERITIES[Math.max(0, lead ? weight(lead, now) : 0)];
}
