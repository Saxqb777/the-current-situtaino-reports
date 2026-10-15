import { PORTS, ZONES } from "./geo";
import type { ClassifiedItem, RawItem, Severity, Source, ZoneId } from "./types";
import { SEVERITIES } from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches a phrase on word boundaries; a trailing * allows any word ending. */
function phrase(p: string): RegExp {
  const body = p.replace(/\*$/, "").split(/\s+/).map(escape).join("[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${body}${p.endsWith("*") ? "[a-z]*" : ""}(?=$|[^a-z0-9])`, "i");
}

const ZONE_RULES = ZONES.map((z) => ({ id: z.id, res: z.keywords.map(phrase) }));
const PORT_RULES = PORTS.map((p) => ({ id: p.id, zone: p.zone, res: p.keywords.map(phrase) }));

const MARITIME = [
  "ship*", "vessel*", "tanker*", "bulker*", "container*", "cargo", "freighter*", "dhow*", "port*", "harbo*",
  "maritime", "seafarer*", "sailor*", "crew*", "navy", "naval", "warship*", "destroyer*", "frigate*",
  "strait", "shipping", "transit*", "convoy*", "escort*", "lng", "crude", "oil terminal", "anchorage",
  "ukmto", "jmic", "marad", "aspides", "atalanta", "eunavfor", "coast guard", "carrier*", "maersk", "msc",
  "hapag*", "cma cgm", "unifeeder", "dp world", "ad ports", "mawani", "feeder*", "teu", "suez canal", "boat*",
].map(phrase);

/** Severity cues, checked from worst to calmest; the first group that hits wins. */
const SEVERITY_RULES: { level: Severity; tag: string; res: RegExp[] }[] = [
  {
    level: "critical",
    tag: "attack",
    res: ["sunk", "sink*", "killed", "dead", "casualt*", "hijack*", "seized", "seizure", "boarded", "mine strike", "struck by", "hit by a missile", "hit by missile", "ablaze", "abandon ship", "strait closed", "closure of the strait", "blockade*"].map(phrase),
  },
  {
    level: "high",
    tag: "attack",
    res: ["attack*", "missile*", "drone*", "usv", "projectile*", "explosion*", "blast", "fired upon", "gunfire", "shots fired", "pirate*", "piracy", "skiff*", "detain*", "seize", "airstrike*", "strike*", "intercept*", "fire on board", "damaged"].map(phrase),
  },
  {
    level: "elevated",
    tag: "disruption",
    res: ["suspicious approach", "suspicious activity", "warning*", "advisor*", "threat*", "divert*", "rerout*", "suspend*", "halt*", "jamming", "gps interference", "spoof*", "escort*", "tension*", "drill*", "exercise*", "delay*", "congestion", "war risk", "premium*", "surcharge*", "avoid*", "closure", "closed", "blocked", "evacuat*"].map(phrase),
  },
];

const TAG_RULES: { tag: string; res: RegExp[] }[] = [
  { tag: "piracy", res: ["pirate*", "piracy", "skiff*", "hijack*"].map(phrase) },
  { tag: "seizure", res: ["seize*", "seizure", "detain*", "boarded"].map(phrase) },
  { tag: "missile/drone", res: ["missile*", "drone*", "usv", "projectile*"].map(phrase) },
  { tag: "diversion", res: ["divert*", "rerout*", "cape of good hope", "avoid*"].map(phrase) },
  { tag: "gps jamming", res: ["jamming", "gps interference", "spoof*"].map(phrase) },
  { tag: "port operations", res: ["congestion", "berth*", "terminal", "throughput", "delay*", "suspend*"].map(phrase) },
  { tag: "energy", res: ["tanker*", "crude", "lng", "oil", "gas"].map(phrase) },
  { tag: "carrier notice", res: ["maersk", "msc", "hapag*", "cma cgm", "unifeeder", "cosco", "evergreen", "one line"].map(phrase) },
];

const OFFICIAL_BODIES: [string, RegExp][] = [
  ["UKMTO", phrase("ukmto")],
  ["JMIC", phrase("jmic")],
  ["MARAD", phrase("marad")],
  ["CENTCOM", phrase("centcom")],
  ["EU Aspides", phrase("aspides")],
  ["EUNAVFOR Atalanta", phrase("atalanta")],
  ["Ambrey", phrase("ambrey")],
];

const any = (res: RegExp[], s: string) => res.some((r) => r.test(s));

export function classify(item: RawItem, source: Source): ClassifiedItem | null {
  const hay = `${item.title} \n ${item.summary}`;

  const zones = new Set<ZoneId>();
  const ports: string[] = [];
  for (const rule of PORT_RULES) {
    if (any(rule.res, hay)) { ports.push(rule.id); zones.add(rule.zone); }
  }
  for (const rule of ZONE_RULES) if (any(rule.res, hay)) zones.add(rule.id);
  if (zones.size === 0) return null;

  const citesOfficial = OFFICIAL_BODIES.filter(([, re]) => re.test(hay)).map(([name]) => name);
  const maritime = source.maritime || source.kind === "official" || citesOfficial.length > 0 || any(MARITIME, hay);
  if (!maritime) return null;

  // Severity reads the headline first; the summary can only add one step.
  let severity: Severity = "low";
  const tags = new Set<string>();
  for (const rule of SEVERITY_RULES) {
    if (any(rule.res, item.title)) { severity = rule.level; tags.add(rule.tag); break; }
  }
  for (const rule of SEVERITY_RULES) {
    if (any(rule.res, item.summary)) {
      const rank = Math.max(SEVERITIES.indexOf(severity), Math.min(SEVERITIES.indexOf(rule.level), SEVERITIES.indexOf(severity) + 1));
      severity = SEVERITIES[rank];
      break;
    }
  }
  for (const rule of TAG_RULES) if (any(rule.res, hay)) tags.add(rule.tag);
  if (citesOfficial.length) tags.add("official report");

  return { ...item, zones: [...zones], ports, severity, tags: [...tags], citesOfficial };
}

export const severityRank = (s: Severity) => SEVERITIES.indexOf(s);
