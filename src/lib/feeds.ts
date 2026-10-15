import { XMLParser } from "fast-xml-parser";
import type { RawItem, Source } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: false,
  processEntities: true,
  htmlEntities: true,
});

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return text((v as Record<string, unknown>)["#text"]);
  return "";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Google News titles end in " - Publisher"; keep the headline only. */
function cleanTitle(title: string, source: Source): string {
  const t = stripHtml(title);
  if (source.id.startsWith("gn-")) return t.replace(/\s+-\s+[^-]{2,60}$/, "");
  return t;
}

/** Parses RSS 2.0 and Atom documents. */
export function parseFeed(xml: string, source: Source): RawItem[] {
  const doc = parser.parse(xml);
  if (doc.rss) {
    return asArray(doc.rss.channel?.item).map((it: Record<string, unknown>) => {
      const publisher = text((it.source as unknown) ?? "");
      return {
        sourceId: source.id,
        title: cleanTitle(text(it.title), source),
        summary: stripHtml(text(it.description)).slice(0, 600),
        url: text(it.link) || text(it.guid),
        publishedAt: isoDate(text(it.pubDate) || text(it["dc:date"])),
        publisher: publisher || undefined,
      } satisfies RawItem;
    }).filter((i) => i.title && i.url);
  }
  if (doc.feed) {
    return asArray(doc.feed.entry).map((it: Record<string, unknown>) => {
      const links = asArray(it.link as Record<string, string> | Record<string, string>[]);
      const href = links.find((l) => !l["@rel"] || l["@rel"] === "alternate")?.["@href"] ?? links[0]?.["@href"] ?? "";
      return {
        sourceId: source.id,
        title: cleanTitle(text(it.title), source),
        summary: stripHtml(text(it.summary) || text(it.content)).slice(0, 600),
        url: href,
        publishedAt: isoDate(text(it.published) || text(it.updated)),
      };
    }).filter((i) => i.title && i.url);
  }
  return [];
}

interface GdeltArticle { url: string; title: string; seendate: string; domain: string; language: string }

/** GDELT seendate looks like 20261014T203000Z. */
export function parseGdelt(json: string, source: Source): RawItem[] {
  const data = JSON.parse(json) as { articles?: GdeltArticle[] };
  return (data.articles ?? []).map((a) => {
    const m = a.seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const when = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : a.seendate;
    return {
      sourceId: source.id,
      title: stripHtml(a.title),
      summary: `${a.domain}${a.language && a.language !== "English" ? ` · ${a.language}` : ""}`,
      url: a.url,
      publishedAt: isoDate(when),
    };
  });
}

export async function fetchSource(source: Source, timeoutMs = 20_000): Promise<RawItem[]> {
  const res = await fetch(source.url, {
    headers: { "user-agent": "SeaLanesWatch/0.1 (+situation report)", accept: "application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.5" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  return source.format === "gdelt" ? parseGdelt(body, source) : parseFeed(body, source);
}
