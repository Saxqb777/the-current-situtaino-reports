import { Document, Font, Image, Link, Page, Path, StyleSheet, Svg, Text, View, Circle } from "@react-pdf/renderer";
import { PORT_BY_ID, ZONE_BY_ID } from "@/lib/geo";
import type { Severity, WatchEvent, ZoneSummary } from "@/lib/types";
import { ZONE_ORDER } from "@/lib/ui";

let registered = false;
export function registerFonts(origin: string) {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Archivo",
    fonts: [
      { src: `${origin}/fonts/archivo-latin-500-normal.woff`, fontWeight: 500 },
      { src: `${origin}/fonts/archivo-latin-700-normal.woff`, fontWeight: 700 },
      { src: `${origin}/fonts/archivo-latin-800-normal.woff`, fontWeight: 800 },
    ],
  });
  Font.register({
    family: "Atkinson",
    fonts: [
      { src: `${origin}/fonts/atkinson-hyperlegible-next-latin-400-normal.woff`, fontWeight: 400 },
      { src: `${origin}/fonts/atkinson-hyperlegible-next-latin-700-normal.woff`, fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Spline Mono",
    fonts: [
      { src: `${origin}/fonts/spline-sans-mono-latin-400-normal.woff`, fontWeight: 400 },
      { src: `${origin}/fonts/spline-sans-mono-latin-600-normal.woff`, fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

const C = {
  ink: "#0f2236", ink2: "#3f5163", ink3: "#6b7b88", rule: "#c7d2d6", paper: "#ffffff", wash: "#f2f5f4",
  olive: "#849e34", oliveInk: "#5b7120", magenta: "#b0137a",
  sev: { low: "#6b7b88", elevated: "#b88a00", high: "#c4362b", critical: "#b0137a" } as Record<Severity, string>,
};
const SEV_LABEL: Record<Severity, string> = { low: "Normal", elevated: "Elevated", high: "High", critical: "Critical" };

const s = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 56, paddingHorizontal: 46, fontFamily: "Atkinson", fontSize: 10, color: C.ink, backgroundColor: C.paper },
  bandTop: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: C.olive },
  mastRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: C.ink, paddingBottom: 8 },
  brand: { fontFamily: "Archivo", fontWeight: 800, fontSize: 11, letterSpacing: 2.2, textTransform: "uppercase" },
  brandAccent: { color: C.oliveInk },
  stamp: { fontFamily: "Spline Mono", fontSize: 8.5, color: C.ink2, textAlign: "right" },
  kicker: { fontFamily: "Archivo", fontWeight: 800, fontSize: 7.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.ink2 },
  coverTitle: { fontFamily: "Archivo", fontWeight: 800, fontSize: 30, lineHeight: 1.04, marginTop: 14, letterSpacing: -0.3 },
  coverDeck: { fontSize: 12.5, lineHeight: 1.4, color: C.ink2, marginTop: 10, maxWidth: 420 },
  metaRow: { flexDirection: "row", gap: 22, marginTop: 14 },
  metaItem: { fontSize: 9, color: C.ink2 },
  metaVal: { fontFamily: "Archivo", fontWeight: 700, fontSize: 10, color: C.ink, marginTop: 2 },
  chartWrap: { marginTop: 14, borderWidth: 1, borderColor: C.ink, padding: 4 },
  chartInner: { borderWidth: 0.6, borderColor: C.ink },
  caption: { fontSize: 8, color: C.ink3, marginTop: 5 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 4 },
  zoneRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  zoneName: { fontFamily: "Archivo", fontWeight: 700, fontSize: 10, width: 150 },
  zoneLevel: { fontFamily: "Archivo", fontWeight: 800, fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", width: 70 },
  zoneHead: { flex: 1, fontSize: 9, color: C.ink2 },
  zoneNum: { fontFamily: "Spline Mono", fontSize: 9, width: 44, textAlign: "right" },
  story: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  storyTime: { width: 64, paddingRight: 10 },
  storyClock: { fontFamily: "Spline Mono", fontWeight: 600, fontSize: 11 },
  storyDate: { fontFamily: "Spline Mono", fontSize: 7.5, color: C.ink3, marginTop: 2 },
  storyBody: { flex: 1, borderLeftWidth: 3, paddingLeft: 12 },
  storyKicker: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 4 },
  storyTitle: { fontFamily: "Archivo", fontWeight: 800, fontSize: 14, lineHeight: 1.15 },
  storySummary: { fontSize: 10, lineHeight: 1.45, color: C.ink2, marginTop: 5 },
  officialTag: { fontFamily: "Archivo", fontWeight: 800, fontSize: 6.5, letterSpacing: 1, borderWidth: 0.8, borderColor: C.ink, paddingHorizontal: 3, paddingVertical: 1 },
  sources: { marginTop: 7 },
  sourceLine: { fontSize: 8, color: C.ink3, marginTop: 1.5 },
  sourceLink: { color: C.ink2, textDecoration: "none", fontFamily: "Atkinson", fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: C.rule, paddingTop: 6, fontSize: 7.5, color: C.ink3 },
  note: { marginTop: 14, padding: 10, backgroundColor: C.wash, fontSize: 8.5, color: C.ink2, lineHeight: 1.4 },
});

function Mark({ level, size = 12 }: { level: Severity; size?: number }) {
  const col = C.sev[level];
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      {(level === "high" || level === "critical") && (
        <Circle cx="15" cy="15" r={level === "critical" ? "13.5" : "11"} stroke={col} strokeWidth={2} strokeDasharray="3 2.2" fill="none" />
      )}
      <Circle cx="15" cy="15" r="6.5" fill={col} />
      {level === "critical" && <Path d="M12 12 L18 18 M18 12 L12 18" stroke="#ffffff" strokeWidth={1.8} />}
    </Svg>
  );
}

const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export interface BriefingProps {
  title: string;
  preparedFor: string;
  note: string;
  generatedAt: string;
  events: WatchEvent[];
  zones: ZoneSummary[];
  chartImage: string | null;
}

export function Briefing({ title, preparedFor, note, generatedAt, events, zones, chartImage }: BriefingProps) {
  const byZone = Object.fromEntries(zones.map((z) => [z.zone, z]));
  const worst = events.reduce<Severity>((m, e) => (["low", "elevated", "high", "critical"].indexOf(e.severity) > ["low", "elevated", "high", "critical"].indexOf(m) ? e.severity : m), "low");
  const official = events.filter((e) => e.official).length;
  const sources = new Set(events.flatMap((e) => e.sources.map((x) => x.publisher || x.name))).size;

  const footer = (
    <View style={s.footer} fixed>
      <Text>Sea Lanes Watch · Situation briefing · {day(generatedAt)} {hhmm(generatedAt)} UTC</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
  const mast = (
    <View style={s.mastRow} fixed>
      <Text style={s.brand}>Sea Lanes <Text style={s.brandAccent}>Watch</Text></Text>
      <Text style={s.stamp}>GCC · HORMUZ · RED SEA · GULF OF ADEN</Text>
    </View>
  );

  return (
    <Document title={title} author={preparedFor || "Sea Lanes Watch"} subject="Maritime situation briefing" creator="Sea Lanes Watch">
      <Page size="A4" style={s.page}>
        <View style={s.bandTop} fixed />
        {mast}
        <Text style={[s.kicker, { marginTop: 22 }]}>Situation briefing · {day(generatedAt)} · {hhmm(generatedAt)} UTC</Text>
        <Text style={s.coverTitle}>{title}</Text>
        {note ? <Text style={s.coverDeck}>{note}</Text> : null}
        <View style={s.metaRow}>
          <View><Text style={s.metaItem}>Prepared for</Text><Text style={s.metaVal}>{preparedFor || "Internal distribution"}</Text></View>
          <View><Text style={s.metaItem}>Reports</Text><Text style={s.metaVal}>{events.length}</Text></View>
          <View><Text style={s.metaItem}>Highest level</Text><Text style={[s.metaVal, { color: C.sev[worst] }]}>{SEV_LABEL[worst]}</Text></View>
          <View><Text style={s.metaItem}>Official reports</Text><Text style={s.metaVal}>{official}</Text></View>
          <View><Text style={s.metaItem}>Outlets</Text><Text style={s.metaVal}>{sources}</Text></View>
        </View>

        {chartImage ? (
          <View style={s.chartWrap}>
            <View style={s.chartInner}><Image src={chartImage} style={{ width: "100%", height: 230, objectFit: "cover" }} /></View>
          </View>
        ) : null}
        {chartImage ? <Text style={s.caption}>Chart at time of export. Coloured marks are reports; dashed magenta outlines are the watch areas.</Text> : null}

        <View style={s.sectionHead}><Text style={s.kicker}>Zone status</Text></View>
        {ZONE_ORDER.map((id) => {
          const z = byZone[id];
          if (!z) return null;
          return (
            <View key={id} style={s.zoneRow} wrap={false}>
              <View style={{ width: 20 }}><Mark level={z.level} /></View>
              <Text style={s.zoneName}>{ZONE_BY_ID[id].name}</Text>
              <Text style={[s.zoneLevel, { color: C.sev[z.level] }]}>{SEV_LABEL[z.level]}</Text>
              <Text style={s.zoneHead}>{z.headline ?? "No reports in the last 24 hours"}</Text>
              <Text style={s.zoneNum}>{z.events24h}</Text>
            </View>
          );
        })}
        {footer}
      </Page>

      <Page size="A4" style={s.page}>
        <View style={s.bandTop} fixed />
        {mast}
        <View style={s.sectionHead}><Text style={s.kicker}>Reports · newest first</Text></View>
        {events.map((e) => (
          <View key={e.id} style={s.story} wrap={false}>
            <View style={s.storyTime}>
              <Text style={s.storyClock}>{hhmm(e.lastSeen)}</Text>
              <Text style={s.storyDate}>{day(e.lastSeen)}</Text>
            </View>
            <View style={[s.storyBody, { borderLeftColor: C.sev[e.severity] }]}>
              <View style={s.storyKicker}>
                <Mark level={e.severity} size={10} />
                <Text style={[s.kicker, { color: C.sev[e.severity] }]}>{SEV_LABEL[e.severity]}</Text>
                <Text style={s.kicker}>{e.zones.map((z) => ZONE_BY_ID[z].name).join(" / ")}</Text>
                {e.official ? <Text style={s.officialTag}>OFFICIAL · {e.citesOfficial.join(", ").toUpperCase()}</Text> : null}
              </View>
              <Text style={s.storyTitle}>{e.title}</Text>
              {e.summary ? <Text style={s.storySummary}>{e.summary}</Text> : null}
              {e.ports.length ? <Text style={[s.sourceLine, { marginTop: 5 }]}>Ports: {e.ports.map((p) => PORT_BY_ID[p].name).join(", ")}</Text> : null}
              <View style={s.sources}>
                {e.sources.slice(0, 6).map((src) => (
                  <Text key={src.url} style={s.sourceLine}>
                    <Link src={src.url} style={s.sourceLink}>{src.publisher || src.name}</Link>
                    {`  ${hhmm(src.publishedAt)} UTC${src.publisher ? ` · via ${src.name}` : ""}`}
                  </Text>
                ))}
                {e.sources.length > 6 ? <Text style={s.sourceLine}>+{e.sources.length - 6} more sources</Text> : null}
              </View>
            </View>
          </View>
        ))}
        <Text style={s.note}>
          Reports are gathered automatically from public news and official maritime security notices, merged when several outlets describe the same event, and graded by keywords.
          Grades are a reading aid, not an assessment. Follow the linked sources before acting on any report.
        </Text>
        {footer}
      </Page>
    </Document>
  );
}
