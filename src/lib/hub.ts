import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AisTracker } from "./ais";
import { classify, severityRank } from "./classify";
import { clusterItems } from "./cluster";
import { fetchSource } from "./feeds";
import { ZONES, zoneAt } from "./geo";
import { SOURCES, SOURCE_BY_ID } from "./sources";
import type { ClassifiedItem, Severity, Snapshot, SourceHealth, WatchEvent, ZoneSummary } from "./types";
import { SEVERITIES } from "./types";

const KEEP_MS = 7 * 24 * 3600_000;
const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "state.json");

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

class Hub extends EventEmitter {
  items = new Map<string, ClassifiedItem>();
  events: WatchEvent[] = [];
  health = new Map<string, SourceHealth>(
    SOURCES.map((s) => [s.id, { id: s.id, name: s.name, kind: s.kind, ok: false, lastChecked: null, lastOk: null, items: 0 }]),
  );
  ais = new AisTracker(process.env.AISSTREAM_API_KEY || undefined);
  sample = process.env.SAMPLE_DATA === "1";
  private started = false;
  private polling = false;

  start() {
    if (this.started) return;
    this.started = true;
    this.setMaxListeners(500);
    if (this.sample) {
      this.loadSample();
      return;
    }
    this.restore();
    this.ais.start();
    const every = Math.max(30, Number(process.env.NEWS_POLL_SECONDS) || 120) * 1000;
    void this.poll();
    setInterval(() => void this.poll(), every).unref();
    setInterval(() => { this.ais.sweep(); this.emit("vessels"); }, 30_000).unref();
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    const before = new Set(this.events.map((e) => `${e.id}:${e.severity}:${e.sources.length}`));
    await Promise.all(SOURCES.map(async (source) => {
      const h = this.health.get(source.id)!;
      h.lastChecked = new Date().toISOString();
      try {
        const raw = await fetchSource(source);
        let kept = 0;
        for (const item of raw) {
          if (Date.now() - Date.parse(item.publishedAt) > KEEP_MS) continue;
          const c = classify(item, source);
          if (c) { this.items.set(c.url, c); kept++; }
        }
        Object.assign(h, { ok: true, lastOk: h.lastChecked, items: kept, error: undefined });
      } catch (err) {
        const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
        Object.assign(h, { ok: false, error: err instanceof Error ? `${err.message}${cause}` : String(err) });
      }
    }));
    for (const [url, item] of this.items) if (Date.now() - Date.parse(item.publishedAt) > KEEP_MS) this.items.delete(url);
    this.events = clusterItems([...this.items.values()], SOURCE_BY_ID);
    const fresh = this.events.filter((e) => !before.has(`${e.id}:${e.severity}:${e.sources.length}`));
    this.persist();
    this.polling = false;
    this.emit("snapshot", fresh);
  }

  snapshot(): Snapshot {
    const now = Date.now();
    const vessels = this.ais.list();
    const zones: ZoneSummary[] = ZONES.map((z) => {
      const evs = this.events.filter((e) => e.zones.includes(z.id));
      const recent = evs.filter((e) => now - Date.parse(e.lastSeen) < 24 * 3600_000);
      const lead = leadEvent(evs, now);
      const inZone = vessels.filter((v) => v.zone === z.id);
      return {
        zone: z.id,
        level: zoneLevel(evs, now),
        events24h: recent.length,
        vessels: inZone.length,
        dark: inZone.filter((v) => v.dark).length,
        transits24h: this.ais.transits24h(z.id),
        headline: lead?.title ?? null,
      };
    });
    return {
      generatedAt: new Date(now).toISOString(),
      sample: this.sample,
      ais: { connected: this.ais.connected || this.sample, configured: this.ais.configured || this.sample, vessels: vessels.length, lastMessage: this.ais.lastMessage },
      zones,
      events: this.events,
      sources: [...this.health.values()],
    };
  }

  private persist() {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify({ items: [...this.items.values()] }));
    } catch { /* read-only disk: run from memory */ }
  }

  private restore() {
    try {
      const { items } = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { items: ClassifiedItem[] };
      for (const i of items) if (Date.now() - Date.parse(i.publishedAt) < KEEP_MS) this.items.set(i.url, i);
      this.events = clusterItems([...this.items.values()], SOURCE_BY_ID);
    } catch { /* first run */ }
  }

  private loadSample() {
    // Loaded lazily so the sample file never ships in normal mode's hot path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sampleItems, sampleVessels } = require("./sample") as typeof import("./sample");
    for (const raw of sampleItems()) {
      const c = classify(raw, SOURCE_BY_ID[raw.sourceId]);
      if (c) this.items.set(c.url, c);
    }
    this.events = clusterItems([...this.items.values()], SOURCE_BY_ID);
    for (const h of this.health.values()) Object.assign(h, { ok: true, lastChecked: new Date().toISOString(), lastOk: new Date().toISOString() });
    for (const v of sampleVessels()) this.ais.vessels.set(v.mmsi, { ...v, zone: zoneAt([v.lon, v.lat]) });
  }
}

const g = globalThis as unknown as { __seaLanesHub?: Hub };
export function hub(): Hub {
  if (!g.__seaLanesHub) {
    g.__seaLanesHub = new Hub();
    g.__seaLanesHub.start();
  }
  return g.__seaLanesHub;
}
