import { AisTracker } from "./ais";
import { classify } from "./classify";
import { fetchSource } from "./feeds";
import { SOURCES } from "./sources";
import { store } from "./store";
import type { ClassifiedItem, SourceHealth } from "./types";

export const KEEP_MS = 7 * 24 * 3600_000;
/**
 * Data older than this is refreshed when someone has the page open. Five
 * minutes keeps a busy day inside the free Vercel plan's function hours.
 */
export const STALE_MS = 5 * 60_000;
/** How long each refresh listens to the ship feed. */
const AIS_WINDOW_MS = Number(process.env.AIS_SAMPLE_SECONDS || 30) * 1000;

export interface RefreshResult {
  ran: boolean;
  items?: number;
  sourcesOk?: number;
  vessels?: number;
  aisMessages?: number;
  aisError?: string;
  ms?: number;
}

async function refreshNews(): Promise<{ items: number; ok: number }> {
  const s = store();
  const previous = new Map((await s.health()).map((h) => [h.id, h]));
  const kept: ClassifiedItem[] = [];
  const health: SourceHealth[] = await Promise.all(SOURCES.map(async (source) => {
    const checked = new Date().toISOString();
    try {
      const raw = await fetchSource(source);
      let n = 0;
      for (const item of raw) {
        if (Date.now() - Date.parse(item.publishedAt) > KEEP_MS) continue;
        const c = classify(item, source);
        if (c) { kept.push(c); n++; }
      }
      return { id: source.id, name: source.name, kind: source.kind, ok: true, lastChecked: checked, lastOk: checked, items: n };
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
      return {
        id: source.id, name: source.name, kind: source.kind, ok: false, lastChecked: checked,
        lastOk: previous.get(source.id)?.lastOk ?? null, items: 0,
        error: err instanceof Error ? `${err.message}${cause}` : String(err),
      };
    }
  }));
  await s.putItems(kept);
  await s.putHealth(health);
  return { items: kept.length, ok: health.filter((h) => h.ok).length };
}

async function refreshShips(apiKey: string) {
  const s = store();
  const tracker = new AisTracker(await s.vessels(Date.now() - 24 * 3600_000));
  const result = await tracker.sample(apiKey, AIS_WINDOW_MS);
  const changed = tracker.changed();
  await s.putVessels(changed);
  await s.addTransits(tracker.transits);
  await s.putMeta({ aisConnected: result.connected && !result.error, ...(tracker.messages > 0 ? { lastAisSample: new Date().toISOString() } : {}) });
  return { vessels: changed.length, messages: tracker.messages, error: result.error };
}

/**
 * Reads every news source and samples the ship feed, once per STALE_MS at
 * most, however many visitors or timers ask for it at the same time.
 */
export async function refresh(): Promise<RefreshResult> {
  const s = store();
  if (!(await s.claimRefresh(STALE_MS))) return { ran: false };
  const started = Date.now();
  const apiKey = process.env.AISSTREAM_API_KEY;
  const [news, ships] = await Promise.all([
    refreshNews(),
    apiKey ? refreshShips(apiKey) : Promise.resolve(null),
  ]);
  await s.putMeta({ lastRefresh: new Date().toISOString() });
  await s.prune(KEEP_MS);
  return {
    ran: true,
    items: news.items,
    sourcesOk: news.ok,
    vessels: ships?.vessels,
    aisMessages: ships?.messages,
    aisError: ships?.error,
    ms: Date.now() - started,
  };
}
