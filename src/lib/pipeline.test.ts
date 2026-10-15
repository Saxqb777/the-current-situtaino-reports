import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { clusterItems } from "./cluster";
import { parseFeed, parseGdelt } from "./feeds";
import { segmentsCross, zoneAt } from "./geo";
import { zoneLevel } from "./levels";
import { SOURCE_BY_ID } from "./sources";
import type { RawItem, WatchEvent } from "./types";

const raw = (title: string, summary = "", sourceId = "aljazeera", hoursAgo = 1): RawItem => ({
  sourceId, title, summary, url: `https://example.com/${encodeURIComponent(title)}`,
  publishedAt: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
});

describe("feed parsing", () => {
  it("reads RSS 2.0 and strips the Google News publisher suffix", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title>Tanker attacked near Hodeidah - Reuters</title><link>https://n.example/a</link>
      <description>&lt;p&gt;Crew safe&lt;/p&gt;</description><pubDate>Wed, 14 Oct 2026 23:03:10 +0000</pubDate>
      <source url="https://reuters.com">Reuters</source></item></channel></rss>`;
    const [it0] = parseFeed(xml, SOURCE_BY_ID["gn-chokepoints"]);
    expect(it0.title).toBe("Tanker attacked near Hodeidah");
    expect(it0.summary).toBe("Crew safe");
    expect(it0.publisher).toBe("Reuters");
    expect(it0.publishedAt).toBe("2026-10-14T23:03:10.000Z");
  });

  it("reads Atom", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>
      <entry><title>Ships report GPS jamming in Hormuz</title><link rel="alternate" href="https://m.example/b"/>
      <updated>2026-10-14T20:53:40-04:00</updated><summary>Spoofed positions</summary></entry></feed>`;
    const [e] = parseFeed(xml, SOURCE_BY_ID["maritime-executive"]);
    expect(e.url).toBe("https://m.example/b");
    expect(e.publishedAt).toBe("2026-10-15T00:53:40.000Z");
  });

  it("reads GDELT article lists", () => {
    const json = JSON.stringify({ articles: [{ url: "https://g.example/c", title: "Houthi drone hits ship", seendate: "20261014T203000Z", domain: "g.example", language: "Arabic" }] });
    const [g] = parseGdelt(json, SOURCE_BY_ID.gdelt);
    expect(g.publishedAt).toBe("2026-10-14T20:30:00.000Z");
    expect(g.summary).toContain("Arabic");
  });
});

describe("classification", () => {
  it("drops items with no watch-area place", () => {
    expect(classify(raw("Container ship collides in Singapore Strait"), SOURCE_BY_ID.aljazeera)).toBeNull();
  });

  it("drops non-maritime items from general feeds", () => {
    expect(classify(raw("Yemen talks resume in Muscat"), SOURCE_BY_ID.aljazeera)).toBeNull();
  });

  it("maps ports to zones and grades severity from the headline", () => {
    const c = classify(raw("Tanker seized near Khor Fakkan, UKMTO says"), SOURCE_BY_ID.aljazeera)!;
    expect(c.ports).toContain("khor-fakkan");
    expect(c.zones).toContain("hormuz");
    expect(c.severity).toBe("critical");
    expect(c.citesOfficial).toEqual(["UKMTO"]);
  });

  it("does not read the Gulf of Aden as the port of Aden", () => {
    const c = classify(raw("Bulk carrier reports suspicious approach in Gulf of Aden"), SOURCE_BY_ID.gcaptain)!;
    expect(c.zones).toEqual(["aden"]);
    expect(c.ports).toEqual([]);
    expect(c.severity).toBe("elevated");
  });

  it("lets the summary raise severity by one step at most", () => {
    const c = classify(raw("Jebel Ali berth update", "Ships attacked elsewhere"), SOURCE_BY_ID.splash247)!;
    expect(c.severity).toBe("elevated");
  });
});

describe("clustering", () => {
  it("merges the same story from different outlets into one event", () => {
    const items = [
      raw("Tanker reports explosion near hull off Hodeidah", "", "gcaptain", 2),
      raw("Explosion reported near tanker off Hodeidah, UKMTO says", "", "aljazeera", 1),
      raw("Jebel Ali reports berth congestion", "", "splash247", 1),
    ].map((r) => classify(r, SOURCE_BY_ID[r.sourceId])!);
    const events = clusterItems(items, SOURCE_BY_ID);
    expect(events).toHaveLength(2);
    const hodeidah = events.find((e) => e.ports.includes("hodeidah"))!;
    expect(hodeidah.sources).toHaveLength(2);
    expect(hodeidah.official).toBe(true);
    expect(hodeidah.title).toBe("Tanker reports explosion near hull off Hodeidah");
  });
});

describe("geometry and levels", () => {
  it("places points in zones", () => {
    expect(zoneAt([56.4, 26.3])).toBe("hormuz");
    expect(zoneAt([38.5, 21.0])).toBe("redsea");
    expect(zoneAt([10, 10])).toBeNull();
  });

  it("detects a gate crossing", () => {
    expect(segmentsCross([56.0, 26.2], [56.6, 26.6], [56.05, 26.75], [56.45, 26.05])).toBe(true);
    expect(segmentsCross([55.0, 26.2], [55.5, 26.6], [56.05, 26.75], [56.45, 26.05])).toBe(false);
  });

  it("steps an old event's severity down a level", () => {
    const ev = (severity: WatchEvent["severity"], hoursAgo: number) =>
      ({ severity, lastSeen: new Date(Date.now() - hoursAgo * 3600_000).toISOString() }) as WatchEvent;
    expect(zoneLevel([ev("critical", 2)])).toBe("critical");
    expect(zoneLevel([ev("critical", 40)])).toBe("high");
    expect(zoneLevel([ev("high", 100)])).toBe("low");
  });
});
