import { isDark, type TrackedVessel } from "./ais";
import { clusterItems } from "./cluster";
import { CHOKEPOINTS, ZONES } from "./geo";
import { leadEvent, zoneLevel } from "./levels";
import { KEEP_MS } from "./refresh";
import { SOURCE_BY_ID } from "./sources";
import { store } from "./store";
import type { Snapshot, ZoneSummary } from "./types";

export const SAMPLE = process.env.SAMPLE_DATA === "1";
let seeded = false;

/** Loads the made-up review data into the in-memory store, once. */
async function seedSample() {
  if (seeded) return;
  seeded = true;
  const { sampleItems, sampleVessels } = await import("./sample");
  const { classify } = await import("./classify");
  const { zoneAt } = await import("./geo");
  const s = store();
  await s.putItems(sampleItems().map((r) => classify(r, SOURCE_BY_ID[r.sourceId])).filter((x) => x !== null));
  await s.putVessels(sampleVessels().map((v) => ({ ...v, zone: zoneAt([v.lon, v.lat]) })));
  await s.putHealth(Object.values(SOURCE_BY_ID).map((x) => ({
    id: x.id, name: x.name, kind: x.kind, ok: true, lastChecked: new Date().toISOString(), lastOk: new Date().toISOString(), items: 0,
  })));
  await s.putMeta({ lastRefresh: new Date().toISOString(), lastAisSample: new Date().toISOString(), aisConnected: true });
}

export async function loadVessels(): Promise<{ vessels: TrackedVessel[]; lastSample: number }> {
  if (SAMPLE) await seedSample();
  const s = store();
  const [vessels, meta] = await Promise.all([s.vessels(Date.now() - 24 * 3600_000), s.meta()]);
  const lastSample = meta.lastAisSample ? Date.parse(meta.lastAisSample) : 0;
  if (SAMPLE) return { vessels, lastSample: Date.now() };
  return { vessels: vessels.map((v) => ({ ...v, dark: isDark(v, lastSample) })), lastSample };
}

export async function buildSnapshot(): Promise<Snapshot> {
  if (SAMPLE) await seedSample();
  const s = store();
  const now = Date.now();
  const [items, health, meta, transits, { vessels, lastSample }] = await Promise.all([
    s.items(now - KEEP_MS), s.health(), s.meta(), s.transitsSince(now - 24 * 3600_000), loadVessels(),
  ]);
  const events = clusterItems(items, SOURCE_BY_ID);
  const configured = SAMPLE || Boolean(process.env.AISSTREAM_API_KEY);
  // Transit counts mean something only once the feed has been sampled for a while.
  const transitsKnown = configured && !SAMPLE && lastSample > 0;

  const zones: ZoneSummary[] = ZONES.map((z) => {
    const evs = events.filter((e) => e.zones.includes(z.id));
    const inZone = vessels.filter((v) => v.zone === z.id);
    const choke = CHOKEPOINTS.find((c) => c.zone === z.id);
    return {
      zone: z.id,
      level: zoneLevel(evs, now),
      events24h: evs.filter((e) => now - Date.parse(e.lastSeen) < 24 * 3600_000).length,
      vessels: inZone.length,
      dark: inZone.filter((v) => v.dark).length,
      transits24h: choke && transitsKnown ? transits[choke.id] ?? 0 : null,
      headline: leadEvent(evs, now)?.title ?? null,
    };
  });

  return {
    generatedAt: new Date(now).toISOString(),
    sample: SAMPLE,
    lastRefresh: meta.lastRefresh,
    ais: {
      connected: SAMPLE || meta.aisConnected,
      configured,
      vessels: vessels.length,
      lastMessage: meta.lastAisSample,
    },
    zones,
    events,
    sources: health.length ? health : Object.values(SOURCE_BY_ID).map((x) => ({
      id: x.id, name: x.name, kind: x.kind, ok: false, lastChecked: null, lastOk: null, items: 0,
    })),
  };
}
