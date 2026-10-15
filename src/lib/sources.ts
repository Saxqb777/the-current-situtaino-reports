import type { Source } from "./types";

const googleNews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const GDELT_QUERY =
  '(hormuz OR "red sea" OR "bab el-mandeb" OR "gulf of aden" OR houthi OR "jebel ali" OR "persian gulf") (ship OR tanker OR vessel OR shipping OR port)';

/**
 * Every feed the poller reads. Add a feed here and it shows up in the source
 * list, the Log and the PDF automatically. `maritime: true` marks feeds that
 * are already about shipping, so their items only need a place match.
 */
export const SOURCES: Source[] = [
  // Broadcasters and wires
  { id: "aljazeera", name: "Al Jazeera", kind: "broadcaster", format: "rss", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "bbc-me", name: "BBC Middle East", kind: "broadcaster", format: "rss", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { id: "arabnews", name: "Arab News", kind: "regional", format: "rss", url: "https://www.arabnews.com/rss.xml" },
  { id: "thenational", name: "The National", kind: "regional", format: "rss", url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml" },
  // Shipping press
  { id: "gcaptain", name: "gCaptain", kind: "trade", format: "rss", maritime: true, url: "https://gcaptain.com/feed/" },
  { id: "splash247", name: "Splash247", kind: "trade", format: "rss", maritime: true, url: "https://splash247.com/feed/" },
  { id: "maritime-executive", name: "Maritime Executive", kind: "trade", format: "rss", maritime: true, url: "https://maritime-executive.com/articles.rss" },
  { id: "seatrade", name: "Seatrade Maritime", kind: "trade", format: "rss", maritime: true, url: "https://www.seatrade-maritime.com/rss.xml" },
  // Aggregated searches: these pull in Reuters, AP, Lloyd's List and official notices
  { id: "gn-chokepoints", name: "Google News · chokepoints", kind: "aggregator", format: "rss", url: googleNews('(Hormuz OR "Red Sea" OR "Bab el-Mandeb" OR "Gulf of Aden") (ship OR tanker OR vessel OR shipping) when:2d') },
  { id: "gn-official", name: "Google News · UKMTO / JMIC", kind: "aggregator", format: "rss", url: googleNews("(UKMTO OR JMIC OR \"Operation Aspides\" OR MARAD advisory) when:3d") },
  { id: "gn-ports", name: "Google News · GCC ports", kind: "aggregator", format: "rss", url: googleNews('("Jebel Ali" OR "Khalifa Port" OR "Hamad Port" OR "Port of Salalah" OR "Jeddah Islamic Port" OR "Sohar" OR "Fujairah") when:3d') },
  { id: "gn-carriers", name: "Google News · carriers", kind: "aggregator", format: "rss", url: googleNews('(Maersk OR MSC OR "Hapag-Lloyd" OR "CMA CGM" OR Unifeeder) ("Red Sea" OR Gulf OR Hormuz) when:3d') },
  { id: "gn-somalia", name: "Google News · Somali coast", kind: "aggregator", format: "rss", url: googleNews("(Somalia OR Puntland) (pirates OR piracy OR hijack OR vessel) when:7d") },
  // Global news index, many languages including Arabic
  { id: "gdelt", name: "GDELT", kind: "aggregator", format: "gdelt", url: `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(GDELT_QUERY)}&mode=artlist&format=json&maxrecords=75&timespan=2d&sort=datedesc` },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<string, Source>;

/**
 * Live TV channels for the newsroom panel. Each embeds the channel's current
 * YouTube live stream, so it keeps working when the stream id changes.
 */
export const LIVE_CHANNELS = [
  { id: "aje", name: "Al Jazeera English", channel: "UCNye-wNBqNL5ZzHSJj3l8Bg" },
  { id: "aja", name: "Al Jazeera Arabic", channel: "UCfiwzLy-8yKzIbsmZTzxDgw" },
  { id: "sky", name: "Sky News", channel: "UCoMdktPbSTixAyNGwb-UYkQ" },
  { id: "f24", name: "France 24", channel: "UCQfwfsi5VrQ8yKZ-UWmAEFg" },
  { id: "dw", name: "DW News", channel: "UCknLrEdhRCp1aegoMqRaCZg" },
  { id: "trt", name: "TRT World", channel: "UC7fWeaHhqgM4Ry-RMpM2YYw" },
];
