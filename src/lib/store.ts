import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { TrackedVessel } from "./ais";
import type { ClassifiedItem, SourceHealth } from "./types";

export interface Transit { chokepoint: string; mmsi: number; at: string }

export interface Meta {
  lastRefresh: string | null;
  lastAisSample: string | null;
  aisConnected: boolean;
}

/**
 * Where reports, ships and source status live between requests. On Vercel
 * every request may land on a fresh function, so this is Postgres (Neon);
 * without DATABASE_URL it falls back to memory for local development.
 */
export interface Store {
  /** Claims the refresh slot if the last refresh started more than `minAgeMs` ago. */
  claimRefresh(minAgeMs: number): Promise<boolean>;
  putItems(items: ClassifiedItem[]): Promise<void>;
  items(sinceMs: number): Promise<ClassifiedItem[]>;
  putHealth(health: SourceHealth[]): Promise<void>;
  health(): Promise<SourceHealth[]>;
  putVessels(vessels: TrackedVessel[]): Promise<void>;
  vessels(sinceMs: number): Promise<TrackedVessel[]>;
  vessel(mmsi: number): Promise<TrackedVessel | null>;
  addTransits(rows: Transit[]): Promise<void>;
  transitsSince(sinceMs: number): Promise<Record<string, number>>;
  putMeta(patch: Partial<Meta>): Promise<void>;
  meta(): Promise<Meta>;
  prune(keepMs: number): Promise<void>;
}

const EMPTY_META: Meta = { lastRefresh: null, lastAisSample: null, aisConnected: false };

class MemoryStore implements Store {
  private itemMap = new Map<string, ClassifiedItem>();
  private healthList: SourceHealth[] = [];
  private vesselMap = new Map<number, TrackedVessel>();
  private transitList: Transit[] = [];
  private metaValue: Meta = { ...EMPTY_META };
  private lock = 0;

  async claimRefresh(minAgeMs: number) {
    if (Date.now() - this.lock < minAgeMs) return false;
    this.lock = Date.now();
    return true;
  }
  async putItems(items: ClassifiedItem[]) { for (const i of items) this.itemMap.set(i.url, i); }
  async items(sinceMs: number) { return [...this.itemMap.values()].filter((i) => Date.parse(i.publishedAt) >= sinceMs); }
  async putHealth(health: SourceHealth[]) { this.healthList = health; }
  async health() { return this.healthList; }
  async putVessels(vessels: TrackedVessel[]) { for (const v of vessels) this.vesselMap.set(v.mmsi, v); }
  async vessels(sinceMs: number) { return [...this.vesselMap.values()].filter((v) => Date.parse(v.lastSeen) >= sinceMs); }
  async vessel(mmsi: number) { return this.vesselMap.get(mmsi) ?? null; }
  async addTransits(rows: Transit[]) { this.transitList.push(...rows); }
  async transitsSince(sinceMs: number) {
    const out: Record<string, number> = {};
    for (const t of this.transitList) if (Date.parse(t.at) >= sinceMs) out[t.chokepoint] = (out[t.chokepoint] ?? 0) + 1;
    return out;
  }
  async putMeta(patch: Partial<Meta>) { this.metaValue = { ...this.metaValue, ...patch }; }
  async meta() { return this.metaValue; }
  async prune(keepMs: number) {
    const cut = Date.now() - keepMs;
    for (const [k, i] of this.itemMap) if (Date.parse(i.publishedAt) < cut) this.itemMap.delete(k);
    for (const [k, v] of this.vesselMap) if (Date.now() - Date.parse(v.lastSeen) > 24 * 3600_000) this.vesselMap.delete(k);
    this.transitList = this.transitList.filter((t) => Date.parse(t.at) >= cut);
  }
}

const SCHEMA = [
  `create table if not exists items (url text primary key, published_at timestamptz not null, data jsonb not null)`,
  `create index if not exists items_published_at on items (published_at)`,
  `create table if not exists vessels (mmsi bigint primary key, last_seen timestamptz not null, data jsonb not null)`,
  `create index if not exists vessels_last_seen on vessels (last_seen)`,
  `create table if not exists transits (chokepoint text not null, mmsi bigint not null, at timestamptz not null, primary key (chokepoint, mmsi, at))`,
  `create table if not exists meta (key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now())`,
];

class NeonStore implements Store {
  private sql: NeonQueryFunction<false, false>;
  private ready: Promise<void> | null = null;

  constructor(url: string) { this.sql = neon(url); }

  private q(text: string, params: unknown[] = []) {
    this.ready ??= (async () => { for (const s of SCHEMA) await this.sql.query(s); })();
    return this.ready.then(() => this.sql.query(text, params) as Promise<Record<string, unknown>[]>);
  }

  async claimRefresh(minAgeMs: number) {
    const rows = await this.q(
      `insert into meta (key, updated_at) values ('refresh_lock', now())
       on conflict (key) do update set updated_at = now()
       where meta.updated_at < now() - make_interval(secs => $1)
       returning key`,
      [minAgeMs / 1000],
    );
    return rows.length > 0;
  }

  async putItems(items: ClassifiedItem[]) {
    if (!items.length) return;
    await this.q(
      `insert into items (url, published_at, data)
       select x->>'url', (x->>'publishedAt')::timestamptz, x from jsonb_array_elements($1::jsonb) x
       on conflict (url) do update set data = excluded.data, published_at = excluded.published_at`,
      [JSON.stringify(items)],
    );
  }

  async items(sinceMs: number) {
    const rows = await this.q(`select data from items where published_at >= $1 order by published_at`, [new Date(sinceMs).toISOString()]);
    return rows.map((r) => r.data as ClassifiedItem);
  }

  async putHealth(health: SourceHealth[]) {
    await this.q(
      `insert into meta (key, value, updated_at) values ('health', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(health)],
    );
  }

  async health() {
    const rows = await this.q(`select value from meta where key = 'health'`);
    return (rows[0]?.value as SourceHealth[]) ?? [];
  }

  async putVessels(vessels: TrackedVessel[]) {
    // Batches keep each HTTP request well under Neon's payload limit.
    for (let i = 0; i < vessels.length; i += 800) {
      const batch = vessels.slice(i, i + 800);
      await this.q(
        `insert into vessels (mmsi, last_seen, data)
         select (x->>'mmsi')::bigint, (x->>'lastSeen')::timestamptz, x from jsonb_array_elements($1::jsonb) x
         on conflict (mmsi) do update set data = excluded.data, last_seen = excluded.last_seen`,
        [JSON.stringify(batch)],
      );
    }
  }

  async vessels(sinceMs: number) {
    const rows = await this.q(`select data from vessels where last_seen >= $1`, [new Date(sinceMs).toISOString()]);
    return rows.map((r) => r.data as TrackedVessel);
  }

  async vessel(mmsi: number) {
    const rows = await this.q(`select data from vessels where mmsi = $1`, [mmsi]);
    return (rows[0]?.data as TrackedVessel) ?? null;
  }

  async addTransits(rows: Transit[]) {
    if (!rows.length) return;
    await this.q(
      `insert into transits (chokepoint, mmsi, at)
       select x->>'chokepoint', (x->>'mmsi')::bigint, (x->>'at')::timestamptz from jsonb_array_elements($1::jsonb) x
       on conflict do nothing`,
      [JSON.stringify(rows)],
    );
  }

  async transitsSince(sinceMs: number) {
    const rows = await this.q(`select chokepoint, count(*)::int as n from transits where at >= $1 group by chokepoint`, [new Date(sinceMs).toISOString()]);
    return Object.fromEntries(rows.map((r) => [String(r.chokepoint), Number(r.n)]));
  }

  async putMeta(patch: Partial<Meta>) {
    await this.q(
      `insert into meta (key, value, updated_at) values ('state', $1::jsonb, now())
       on conflict (key) do update set value = meta.value || excluded.value, updated_at = now()`,
      [JSON.stringify(patch)],
    );
  }

  async meta() {
    const rows = await this.q(`select value from meta where key = 'state'`);
    return { ...EMPTY_META, ...((rows[0]?.value as Partial<Meta>) ?? {}) };
  }

  async prune(keepMs: number) {
    const cut = new Date(Date.now() - keepMs).toISOString();
    await this.q(`delete from items where published_at < $1`, [cut]);
    await this.q(`delete from transits where at < $1`, [cut]);
    await this.q(`delete from vessels where last_seen < now() - interval '24 hours'`);
  }
}

const g = globalThis as unknown as { __slwStore?: Store };

export function store(): Store {
  if (!g.__slwStore) {
    const url = process.env.DATABASE_URL;
    g.__slwStore = url ? new NeonStore(url) : new MemoryStore();
  }
  return g.__slwStore;
}

export const usingDatabase = () => Boolean(process.env.DATABASE_URL);
