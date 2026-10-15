import type { ZoneId } from "./types";

export interface Zone {
  id: ZoneId;
  name: string;
  short: string;
  /** [lon, lat] used to place zone-level events and the camera. */
  center: [number, number];
  zoom: number;
  /** Closed ring [lon, lat][] drawn as the chart's danger-area outline. */
  area: [number, number][];
  /** Lower-case phrases that tie an article to this zone. */
  keywords: string[];
}

export interface Port {
  id: string;
  name: string;
  country: string;
  zone: ZoneId;
  position: [number, number];
  kind: "container" | "energy" | "mixed" | "naval";
  keywords: string[];
}

export interface Chokepoint {
  id: string;
  name: string;
  position: [number, number];
  /** Gate line [lon, lat][2]; a ship crossing it counts as one transit. */
  gate: [[number, number], [number, number]];
  zone: ZoneId;
}

export const ZONES: Zone[] = [
  {
    id: "gulf",
    name: "Arabian Gulf",
    short: "Gulf",
    center: [51.2, 27.0],
    zoom: 5.6,
    area: [[47.6, 30.6], [50.2, 30.4], [52.6, 28.4], [56.0, 27.2], [56.2, 26.0], [54.0, 23.9], [51.4, 23.9], [49.6, 25.6], [48.0, 28.2], [47.6, 30.6]],
    keywords: ["arabian gulf", "persian gulf", "the gulf", "gulf waters", "gcc"],
  },
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    short: "Hormuz",
    center: [56.6, 25.9],
    zoom: 7,
    area: [[55.6, 27.2], [57.4, 27.2], [59.2, 25.4], [58.8, 23.6], [56.9, 24.4], [56.0, 25.6], [55.6, 27.2]],
    keywords: ["hormuz", "gulf of oman", "musandam", "strait of hormuz"],
  },
  {
    id: "redsea",
    name: "Red Sea & Suez",
    short: "Red Sea",
    center: [37.6, 21.5],
    zoom: 5,
    area: [[32.2, 30.2], [35.2, 28.6], [38.6, 23.2], [41.8, 17.6], [43.2, 14.0], [42.2, 13.6], [39.4, 16.2], [36.8, 21.0], [34.2, 26.0], [32.2, 30.2]],
    keywords: ["red sea", "suez", "gulf of aqaba", "sinai"],
  },
  {
    id: "aden",
    name: "Bab el-Mandeb & Gulf of Aden",
    short: "Bab el-Mandeb",
    center: [45.4, 12.6],
    zoom: 6,
    area: [[42.6, 14.4], [44.4, 13.0], [51.4, 15.6], [52.4, 13.6], [51.4, 11.6], [45.2, 10.2], [43.2, 11.4], [42.6, 14.4]],
    keywords: ["bab el-mandeb", "bab al-mandab", "bab-el-mandeb", "bab al mandab", "mandeb", "gulf of aden", "houthi", "houthis", "ansar allah", "yemen"],
  },
  {
    id: "somalia",
    name: "Somali Coast",
    short: "Somalia",
    center: [48.4, 6.2],
    zoom: 5,
    area: [[51.4, 11.6], [53.6, 11.0], [51.6, 4.0], [46.8, -1.8], [42.2, -1.8], [44.6, 1.6], [48.6, 6.2], [51.0, 10.6], [51.4, 11.6]],
    keywords: ["somalia", "somali", "puntland", "somaliland", "pirate", "pirates", "piracy", "horn of africa"],
  },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, Zone>;

const p = (
  id: string, name: string, country: string, zone: ZoneId, lon: number, lat: number,
  kind: Port["kind"], extra: string[] = [],
): Port => ({
  id, name, country, zone, position: [lon, lat], kind,
  // A leading "=" means use only the listed phrases, for names that are also part of a sea's name.
  keywords: extra[0] === "=" ? extra.slice(1) : [name.toLowerCase(), ...extra],
});

export const PORTS: Port[] = [
  // UAE
  p("jebel-ali", "Jebel Ali", "UAE", "gulf", 55.06, 25.01, "container", ["jafza"]),
  p("mina-rashid", "Mina Rashid", "UAE", "gulf", 55.28, 25.27, "mixed"),
  p("khalifa", "Khalifa Port", "UAE", "gulf", 54.65, 24.81, "container", ["khalifa port", "kezad"]),
  p("zayed", "Zayed Port", "UAE", "gulf", 54.38, 24.52, "mixed", ["mina zayed"]),
  p("ruwais", "Ruwais", "UAE", "gulf", 52.73, 24.12, "energy"),
  p("das-island", "Das Island", "UAE", "gulf", 52.87, 25.15, "energy"),
  p("saqr", "Saqr Port", "UAE", "gulf", 56.05, 25.98, "mixed", ["mina saqr", "ras al khaimah port"]),
  p("khalid", "Khalid Port", "UAE", "gulf", 55.38, 25.36, "mixed", ["port khalid", "sharjah port"]),
  p("khor-fakkan", "Khor Fakkan", "UAE", "hormuz", 56.36, 25.35, "container", ["khorfakkan"]),
  p("fujairah", "Fujairah", "UAE", "hormuz", 56.37, 25.17, "energy", ["fujairah anchorage"]),
  // Oman
  p("khasab", "Khasab", "Oman", "hormuz", 56.25, 26.20, "mixed"),
  p("sohar", "Sohar", "Oman", "hormuz", 56.62, 24.50, "mixed"),
  p("muscat", "Muscat", "Oman", "hormuz", 58.57, 23.63, "mixed", ["sultan qaboos port", "mina qaboos"]),
  p("duqm", "Duqm", "Oman", "aden", 57.70, 19.67, "mixed"),
  p("salalah", "Salalah", "Oman", "aden", 54.00, 16.94, "container", ["port of salalah"]),
  // Saudi Arabia
  p("dammam", "Dammam", "Saudi Arabia", "gulf", 50.20, 26.50, "container", ["king abdulaziz port"]),
  p("jubail", "Jubail", "Saudi Arabia", "gulf", 49.65, 27.03, "energy"),
  p("ras-tanura", "Ras Tanura", "Saudi Arabia", "gulf", 50.16, 26.64, "energy"),
  p("juaymah", "Juaymah", "Saudi Arabia", "gulf", 50.03, 26.92, "energy"),
  p("jeddah", "Jeddah", "Saudi Arabia", "redsea", 39.17, 21.47, "container", ["jeddah islamic port"]),
  p("king-abdullah", "King Abdullah Port", "Saudi Arabia", "redsea", 39.09, 22.50, "container", ["rabigh"]),
  p("yanbu", "Yanbu", "Saudi Arabia", "redsea", 38.06, 24.08, "energy"),
  p("neom", "NEOM / Duba", "Saudi Arabia", "redsea", 35.53, 27.55, "mixed", ["neom", "port of neom", "duba"]),
  p("jizan", "Jizan", "Saudi Arabia", "redsea", 42.55, 16.93, "mixed", ["jazan"]),
  // Qatar, Bahrain, Kuwait, Iraq
  p("hamad", "Hamad Port", "Qatar", "gulf", 51.61, 25.01, "container", ["hamad port"]),
  p("ras-laffan", "Ras Laffan", "Qatar", "gulf", 51.58, 25.91, "energy"),
  p("mesaieed", "Mesaieed", "Qatar", "gulf", 51.56, 24.93, "energy", ["umm said"]),
  p("sitrah", "Sitrah", "Bahrain", "gulf", 50.63, 26.15, "energy"),
  p("khalifa-bin-salman", "Khalifa Bin Salman", "Bahrain", "gulf", 50.71, 26.20, "container", ["bahrain port", "mina salman"]),
  p("shuwaikh", "Shuwaikh", "Kuwait", "gulf", 47.93, 29.35, "container", ["kuwait port"]),
  p("shuaiba", "Shuaiba", "Kuwait", "gulf", 48.16, 29.03, "energy"),
  p("mina-al-ahmadi", "Mina al-Ahmadi", "Kuwait", "gulf", 48.17, 29.08, "energy", ["mina al ahmadi"]),
  p("umm-qasr", "Umm Qasr", "Iraq", "gulf", 47.95, 30.03, "container"),
  p("basra-terminal", "Basra Oil Terminal", "Iraq", "gulf", 48.81, 29.68, "energy", ["basra"]),
  // Iran
  p("bandar-abbas", "Bandar Abbas", "Iran", "hormuz", 56.06, 27.11, "mixed", ["shahid rajaee"]),
  p("bushehr", "Bushehr", "Iran", "gulf", 50.83, 28.98, "mixed"),
  p("kharg", "Kharg Island", "Iran", "gulf", 50.31, 29.24, "energy", ["kharg"]),
  p("bandar-e-pars", "Bandar-e Pars", "Iran", "gulf", 52.58, 27.50, "energy", ["assaluyeh", "asaluyeh", "south pars"]),
  p("chabahar", "Chabahar", "Iran", "hormuz", 60.62, 25.30, "mixed"),
  // Red Sea west shore, Suez, Aqaba
  p("port-said", "Port Said", "Egypt", "redsea", 32.30, 31.26, "container"),
  p("suez", "Suez", "Egypt", "redsea", 32.56, 29.95, "mixed", ["=", "port tewfik", "suez canal", "port of suez"]),
  p("ain-sokhna", "Ain Sokhna", "Egypt", "redsea", 32.35, 29.60, "container", ["sokhna"]),
  p("safaga", "Safaga", "Egypt", "redsea", 33.94, 26.73, "mixed"),
  p("aqaba", "Aqaba", "Jordan", "redsea", 35.00, 29.52, "mixed", ["=", "port of aqaba", "aqaba port", "in aqaba"]),
  p("eilat", "Eilat", "Israel", "redsea", 34.95, 29.55, "mixed"),
  p("port-sudan", "Port Sudan", "Sudan", "redsea", 37.23, 19.61, "mixed"),
  p("massawa", "Massawa", "Eritrea", "redsea", 39.47, 15.61, "mixed"),
  p("assab", "Assab", "Eritrea", "aden", 42.74, 13.00, "mixed"),
  // Yemen
  p("hodeidah", "Hodeidah", "Yemen", "redsea", 42.93, 14.83, "mixed", ["hudaydah", "hodeida"]),
  p("ras-isa", "Ras Isa", "Yemen", "redsea", 42.60, 15.12, "energy"),
  p("mocha", "Mocha", "Yemen", "aden", 43.24, 13.32, "mixed", ["=", "mokha", "port of mocha"]),
  p("aden", "Aden", "Yemen", "aden", 44.98, 12.79, "mixed", ["=", "port of aden", "aden port", "aden harbo*", "in aden", "off aden", "aden's"]),
  p("mukalla", "Mukalla", "Yemen", "aden", 49.14, 14.52, "mixed"),
  // Horn of Africa
  p("djibouti", "Djibouti", "Djibouti", "aden", 43.08, 11.60, "container", ["doraleh"]),
  p("berbera", "Berbera", "Somaliland", "aden", 45.01, 10.44, "container"),
  p("bosaso", "Bosaso", "Somalia", "aden", 49.19, 11.29, "mixed", ["bossaso"]),
  p("eyl", "Eyl", "Somalia", "somalia", 49.82, 7.98, "mixed"),
  p("hobyo", "Hobyo", "Somalia", "somalia", 48.53, 5.35, "mixed"),
  p("mogadishu", "Mogadishu", "Somalia", "somalia", 45.34, 2.03, "mixed"),
  p("kismayo", "Kismayo", "Somalia", "somalia", 42.55, -0.36, "mixed"),
];

export const PORT_BY_ID = Object.fromEntries(PORTS.map((x) => [x.id, x])) as Record<string, Port>;

export const CHOKEPOINTS: Chokepoint[] = [
  { id: "hormuz", name: "Strait of Hormuz", position: [56.35, 26.45], zone: "hormuz", gate: [[56.05, 26.75], [56.45, 26.05]] },
  { id: "bab-el-mandeb", name: "Bab el-Mandeb", position: [43.35, 12.6], zone: "aden", gate: [[43.15, 12.95], [43.55, 12.3]] },
  { id: "suez", name: "Suez Canal", position: [32.56, 30.4], zone: "redsea", gate: [[32.45, 29.88], [32.62, 29.88]] },
];

/** Region the ship feed subscribes to: [[south, west], [north, east]] boxes. */
export const AIS_BOXES: [[number, number], [number, number]][] = [
  [[23.0, 47.5], [30.8, 60.8]], // Gulf, Hormuz, Gulf of Oman
  [[11.0, 32.0], [31.5, 43.8]], // Red Sea and Suez
  [[-2.0, 42.0], [16.0, 58.0]], // Bab el-Mandeb, Gulf of Aden, Somali coast, Arabian Sea west
];

export function pointInRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function zoneAt(point: [number, number]): ZoneId | null {
  return ZONES.find((z) => pointInRing(point, z.area))?.id ?? null;
}

/** True when segment a-b crosses segment c-d. */
export function segmentsCross(
  a: [number, number], b: [number, number], c: [number, number], d: [number, number],
): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Great-circle distance in nautical miles. */
export function distanceNm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.sqrt(h));
}
