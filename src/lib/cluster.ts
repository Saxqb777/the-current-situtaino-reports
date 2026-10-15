import { PORT_BY_ID, ZONE_BY_ID } from "./geo";
import { severityRank } from "./classify";
import type { ClassifiedItem, EventSource, Source, SourceKind, WatchEvent } from "./types";

const STOP = new Set(
  "the a an and or of in on at to for from by with as is are was were be been after amid over into near off says said say new latest live update updates report reports reported its it this that than more says".split(" "),
);

export function tokens(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

/** Which source's headline should front the event. */
const KIND_ORDER: SourceKind[] = ["official", "wire", "trade", "broadcaster", "regional", "aggregator"];

const WINDOW_MS = 36 * 3600_000;
const MATCH_AT = 0.6;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function positionFor(item: ClassifiedItem, id: string): [number, number] {
  const base = item.ports[0] ? PORT_BY_ID[item.ports[0]].position : ZONE_BY_ID[item.zones[0]].center;
  // Small, stable offset so events at the same place don't sit exactly on top of each other.
  const h = hash(id);
  const spread = item.ports[0] ? 0.08 : 0.5;
  return [base[0] + (((h & 0xff) / 255) - 0.5) * spread, base[1] + ((((h >> 8) & 0xff) / 255) - 0.5) * spread];
}

/**
 * Merges articles that describe the same happening. Two items join when their
 * headlines share most significant words, they share a zone, and they were
 * published within 36 hours of each other.
 */
export function clusterItems(items: ClassifiedItem[], sources: Record<string, Source>): WatchEvent[] {
  const sorted = [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const groups: { toks: Set<string>; items: ClassifiedItem[] }[] = [];

  for (const item of sorted) {
    const toks = tokens(item.title);
    const t = Date.parse(item.publishedAt);
    const match = groups.find((g) => {
      const last = g.items[g.items.length - 1];
      if (t - Date.parse(last.publishedAt) > WINDOW_MS) return false;
      if (!g.items.some((x) => x.zones.some((z) => item.zones.includes(z)))) return false;
      return similarity(toks, g.toks) >= MATCH_AT;
    });
    if (match) {
      match.items.push(item);
      for (const w of toks) match.toks.add(w);
    } else {
      groups.push({ toks, items: [item] });
    }
  }

  return groups.map(({ items: group }) => {
    const seen = new Set<string>();
    const unique = group.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
    const lead = [...unique].sort(
      (a, b) =>
        KIND_ORDER.indexOf(sources[a.sourceId]?.kind ?? "aggregator") - KIND_ORDER.indexOf(sources[b.sourceId]?.kind ?? "aggregator") ||
        b.summary.length - a.summary.length,
    )[0];
    const id = `ev-${hash(group[0].url + group[0].title).toString(36)}`;
    const severity = group.reduce((m, x) => (severityRank(x.severity) > severityRank(m) ? x.severity : m), group[0].severity);
    const evSources: EventSource[] = unique.map((x) => ({
      sourceId: x.sourceId,
      name: sources[x.sourceId]?.name ?? x.sourceId,
      publisher: x.publisher,
      kind: sources[x.sourceId]?.kind ?? "aggregator",
      url: x.url,
      title: x.title,
      publishedAt: x.publishedAt,
    }));
    const citesOfficial = [...new Set(group.flatMap((x) => x.citesOfficial))];
    return {
      id,
      title: lead.title,
      summary: lead.summary && lead.summary !== lead.title ? lead.summary : "",
      zones: [...new Set(group.flatMap((x) => x.zones))],
      ports: [...new Set(group.flatMap((x) => x.ports))],
      severity,
      tags: [...new Set(group.flatMap((x) => x.tags))],
      citesOfficial,
      official: citesOfficial.length > 0 || evSources.some((s) => s.kind === "official"),
      firstSeen: group[0].publishedAt,
      lastSeen: group[group.length - 1].publishedAt,
      position: positionFor(lead, id),
      sources: evSources,
    };
  }).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
