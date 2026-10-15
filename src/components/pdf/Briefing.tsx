import { Document, Font, Image, Line, Link, Page, Path, Rect, StyleSheet, Svg, Text, View, Circle } from "@react-pdf/renderer";
import { PORT_BY_ID, ZONE_BY_ID } from "@/lib/geo";
import type { HormuzBundle } from "@/lib/hormuz";
import { PORTWATCH_PORT, callsBand } from "@/lib/portwatch";
import type { Severity, WatchEvent, ZoneSummary } from "@/lib/types";
import { ROUTE, verdict } from "@/lib/verdict";
import { type PortWait, allWaits, daysWord } from "@/lib/waits";

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
  gateTitle: { fontFamily: "Archivo", fontWeight: 800, fontSize: 28, lineHeight: 1.05, marginTop: 12, letterSpacing: -0.3 },
  coverVerdict: { fontFamily: "Archivo", fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginTop: 10, maxWidth: 470 },
  routeLine: { position: "absolute", left: 5.2, width: 1.6 },
  statusWord: { fontFamily: "Archivo", fontWeight: 800, fontSize: 40, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1, marginTop: 16 },
  statusSub: { fontFamily: "Archivo", fontWeight: 700, fontSize: 14, marginTop: 4 },
  statusReason: { fontSize: 9.5, lineHeight: 1.45, color: C.ink2, marginTop: 6, maxWidth: 470 },
  kpiRow: { flexDirection: "row", marginTop: 14, borderTopWidth: 2, borderTopColor: C.ink, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  kpi: { flex: 1, paddingVertical: 8, paddingRight: 8, borderRightWidth: 0.6, borderRightColor: C.rule, marginRight: 8 },
  kpiVal: { fontFamily: "Archivo", fontWeight: 800, fontSize: 22, lineHeight: 1.05, marginTop: 3 },
  kpiFoot: { fontSize: 7.5, color: C.ink3, marginTop: 2 },
  axis: { position: "relative", height: 10, marginTop: 2 },
  axisLabel: { position: "absolute", top: 0, fontFamily: "Spline Mono", fontSize: 6.5, color: C.ink3 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3.2, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  tHead: { fontFamily: "Archivo", fontWeight: 800, fontSize: 6.5, letterSpacing: 1, textTransform: "uppercase", color: C.ink3 },
  tName: { width: 120, fontFamily: "Archivo", fontWeight: 700, fontSize: 8.5 },
  tSmall: { fontSize: 7, color: C.ink3 },
  tNum: { fontFamily: "Spline Mono", fontSize: 8, width: 52, textAlign: "right" },
});

const BAND_C = { normal: C.olive, reduced: "#b88a00", low: "#c4362b" };
const STATUS_C: Record<string, string> = { open: C.olive, restricted: "#c4362b", closed: C.magenta };
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-GB");

/** Monthly crossings since 2019 as a line, with the pre-crisis level and the crisis marked. */
function MonthlyChart({ hz, width = 503, height = 110 }: { hz: HormuzBundle; width?: number; height?: number }) {
  const months = (hz.traffic?.monthly ?? []).map((m) => ({ month: m.month, v: m.portwatchDays ? m.portwatchAvg : m.oursAvg }));
  const base = hz.status?.status.baseline ?? 0;
  if (months.length < 2) return null;
  const max = Math.max(base, ...months.map((m) => m.v)) * 1.1;
  const x = (i: number) => (i / (months.length - 1)) * width;
  const y = (v: number) => height - (v / max) * height;
  const d = months.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.v).toFixed(1)}`).join(" ");
  const crisis = hz.status?.status.crisisStart.slice(0, 7) ?? "";
  const ci = months.findIndex((m) => m.month >= crisis);
  return (
    <View>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={C.wash} />
        {ci > 0 ? <Rect x={x(ci)} y={0} width={width - x(ci)} height={height} fill="#f6e3ee" /> : null}
        <Line x1={0} x2={width} y1={y(base)} y2={y(base)} stroke={C.ink3} strokeWidth={0.8} strokeDasharray="2 2" />
        <Path d={`${d} L${width},${height} L0,${height} Z`} fill="#e3e9cf" />
        <Path d={d} stroke={C.ink} strokeWidth={1.4} fill="none" />
        {ci > 0 ? <Line x1={x(ci)} x2={x(ci)} y1={0} y2={height} stroke={C.magenta} strokeWidth={1.2} /> : null}
      </Svg>
      <View style={[s.axis, { width }]}>
        {months.map((m, i) => (m.month.endsWith("-01") ? <Text key={m.month} style={[s.axisLabel, { left: x(i) }]}>{m.month.slice(0, 4)}</Text> : null))}
      </View>
      <Text style={s.caption}>Average crossings a day, month by month. Dotted line: {n1(base)} a day before the crisis. Shaded: since {crisis}.</Text>
    </View>
  );
}

const levelC = (w: PortWait | undefined) => (w?.level === "high" ? BAND_C.low : w?.level === "elevated" ? BAND_C.reduced : BAND_C.normal);

/** How long ships wait at each port, from MarineTraffic, with who is waiting off the ports now. */
function WaitsPage({ hz, mast, footer }: { hz: HormuzBundle; mast: React.ReactNode; footer: React.ReactNode }) {
  const waits = Object.values(allWaits(Object.keys(PORT_BY_ID), hz.congestion, hz.areas, Date.now())).filter((w) => w.days !== null);
  const longest = [...waits].sort((a, b) => (b.days ?? 0) - (a.days ?? 0)).slice(0, 18);
  const congested = waits.filter((w) => w.level === "high").length;
  const busier = waits.filter((w) => w.level === "elevated").length;
  const week = longest[0]?.latest?.start;
  const live = [...(hz.areas?.waiting.areas ?? [])].sort((a, b) => b.count - a.count).slice(0, 6);
  return (
    <Page size="A4" style={s.page}>
      <View style={s.bandTop} fixed />
      {mast}
      <Text style={[s.kicker, { marginTop: 18 }]}>Port congestion{week ? ` · week from ${week}` : ""}</Text>
      <Text style={s.gateTitle}><Text style={{ color: congested ? BAND_C.low : busier ? BAND_C.reduced : C.ink }}>{congested + busier} of {waits.length} ports</Text> wait longer than usual</Text>
      <Text style={s.statusSub}>{congested} congested, {busier} busier, against each port&apos;s own last twelve weeks</Text>
      <View style={s.sectionHead}><Text style={s.kicker}>Longest waits · last full week</Text></View>
      <View style={s.tRow}>
        <Text style={[s.tHead, { width: 120 }]}>Port</Text>
        <Text style={[s.tHead, { flex: 1 }]}>Typical wait</Text>
        <Text style={[s.tHead, { width: 52, textAlign: "right" }]}>Usual</Text>
        <Text style={[s.tHead, { width: 52, textAlign: "right" }]}>Calls</Text>
        <Text style={[s.tHead, { width: 52, textAlign: "right" }]}>Waiting now</Text>
      </View>
      {longest.map((w) => (
        <View key={w.id} style={s.tRow} wrap={false}>
          <Text style={s.tName}>{PORT_BY_ID[w.id]?.name} <Text style={s.tSmall}>{PORT_BY_ID[w.id]?.country}</Text></Text>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Svg width={120} height={7}>
              <Rect x={0} y={0} width={120} height={7} fill={C.wash} />
              <Rect x={0} y={0} width={Math.min(120, ((w.days ?? 0) / 7) * 120)} height={7} fill={levelC(w)} />
              {w.typical !== null && <Rect x={Math.min(119, (w.typical / 7) * 120)} y={0} width={1.2} height={7} fill={C.ink} />}
            </Svg>
            <Text style={{ fontFamily: "Spline Mono", fontSize: 8, color: levelC(w) }}>{daysWord(w.days)} {w.measure === "port" ? "in port" : "at anchor"}</Text>
          </View>
          <Text style={s.tNum}>{daysWord(w.typical)}</Text>
          <Text style={s.tNum}>{w.latest?.calls ?? "–"}</Text>
          <Text style={s.tNum}>{w.live ? w.live.waiting : "–"}</Text>
        </View>
      ))}

      {live.length > 0 ? (
        <>
          <View style={s.sectionHead} wrap={false}><Text style={s.kicker}>Ships waiting off the ports now</Text></View>
          {live.map((w) => (
            <View key={w.id || w.name} style={s.tRow} wrap={false}>
              <Text style={[s.tName, { width: 200 }]}>{w.name}</Text>
              <Text style={[s.tSmall, { flex: 1 }]}>{w.side === "gulf" ? "Gulf side" : "Oman side"} · median wait {Math.round(w.medianHours)} h · {w.over7d} over a week</Text>
              <Text style={s.tNum}>{w.count}</Text>
            </View>
          ))}
        </>
      ) : null}
      <Text style={[s.caption, { marginTop: 10 }]}>Waits: MarineTraffic weekly median days at anchor (in port where a port has no anchorage figure), all ship types. Usual is the middle of the twelve weeks before, marked by the tick. Congested: half as long again as usual and a day longer; busier: a fifth longer and half a day. Waiting now: hormuz.now (CC BY 4.0).</Text>
      {footer}
    </Page>
  );
}

/** The strait and the ports, from hormuz.now and IMF PortWatch. */
function StraitPage({ hz, mast, footer, waitingHere, level }: { hz: HormuzBundle; mast: React.ReactNode; footer: React.ReactNode; waitingHere: boolean; level: Severity }) {
  const st = hz.status!;
  const col = STATUS_C[st.status.level] ?? C.ink;
  const ports = [...(hz.ports?.ports ?? [])].filter((p) => !p.lowBase).sort((a, b) => a.pctCalls - b.pctCalls);
  const waits = allWaits(Object.keys(PORT_BY_ID), hz.congestion, hz.areas, Date.now());
  // With a waits page, who is waiting goes there.
  const waiting = waitingHere ? [...(hz.areas?.waiting.areas ?? [])].sort((a, b) => b.count - a.count).slice(0, 5) : [];
  return (
    <Page size="A4" style={s.page}>
      <View style={s.bandTop} fixed />
      {mast}
      <Text style={[s.kicker, { marginTop: 18 }]}>Strait of Hormuz · our level <Text style={{ color: C.sev[level] }}>{SEV_LABEL[level]}</Text> · crisis day {st.status.dayCount}</Text>
      <Text style={s.gateTitle}>Traffic at <Text style={{ color: col }}>{Math.round(st.status.pct)}%</Text> of normal</Text>
      <Text style={s.statusReason}>
        {st.last24h.total} ships crossed in the last 24 hours. This week averages {n1(st.status.ais7)} a day, against {n1(st.status.baseline)} a day before the crisis began on {day(`${st.status.crisisStart}T00:00:00Z`)}. {st.fleet.waitingGulf + st.fleet.waitingOman} ships are waiting at anchor, {st.fleet.waitingGulf} on the Gulf side and {st.fleet.waitingOman} on the Oman side.
      </Text>
      <View style={s.kpiRow}>
        <View style={s.kpi}><Text style={s.kicker}>Crossed, 24 h</Text><Text style={[s.kpiVal, { color: col }]}>{st.last24h.total}</Text><Text style={s.kpiFoot}>{st.last24h.in} in · {st.last24h.out} out</Text></View>
        <View style={s.kpi}><Text style={s.kicker}>A day, 7 days</Text><Text style={s.kpiVal}>{n1(st.status.ais7)}</Text><Text style={s.kpiFoot}>{Math.round(st.status.pct)}% of {n1(st.status.baseline)} normal</Text></View>
        <View style={s.kpi}><Text style={s.kicker}>Crossed, 7 days</Text><Text style={s.kpiVal}>{st.last7d.total}</Text><Text style={s.kpiFoot}>{st.last7d.tankers} tankers</Text></View>
        <View style={[s.kpi, { borderRightWidth: 0 }]}><Text style={s.kicker}>Waiting at anchor</Text><Text style={s.kpiVal}>{st.fleet.waitingGulf + st.fleet.waitingOman}</Text><Text style={s.kpiFoot}>{st.fleet.waitingGulf} Gulf · {st.fleet.waitingOman} Oman side</Text></View>
      </View>

      <View style={s.sectionHead}><Text style={s.kicker}>Traffic since 2019</Text></View>
      <MonthlyChart hz={hz} />

      {ports.length > 0 ? (
        <>
          <View style={s.sectionHead}><Text style={s.kicker}>Gulf ports · calls against before the crisis</Text></View>
          <View style={s.tRow}>
            <Text style={[s.tHead, { width: 120 }]}>Port</Text>
            <Text style={[s.tHead, { flex: 1 }]}>Calls vs normal</Text>
            <Text style={[s.tHead, { width: 52, textAlign: "right" }]}>Calls/day</Text>
            <Text style={[s.tHead, { width: 52, textAlign: "right" }]}>Exports</Text>
            <Text style={[s.tHead, { width: 52, textAlign: "right" }]}>Wait</Text>
          </View>
          {ports.slice(0, 14).map((p) => {
            const b = callsBand(p.pctCalls);
            const id = PORTWATCH_PORT[p.slug];
            return (
              <View key={p.slug} style={s.tRow} wrap={false}>
                <Text style={s.tName}>{(id && PORT_BY_ID[id]?.name) || p.name} <Text style={s.tSmall}>{p.country}</Text></Text>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Svg width={120} height={7}>
                    <Rect x={0} y={0} width={120} height={7} fill={C.wash} />
                    <Rect x={0} y={0} width={Math.min(120, (p.pctCalls / 100) * 120)} height={7} fill={BAND_C[b]} />
                  </Svg>
                  <Text style={{ fontFamily: "Spline Mono", fontSize: 8, color: BAND_C[b] }}>{Math.round(p.pctCalls)}%</Text>
                </View>
                <Text style={s.tNum}>{n1(p.nowCalls)}/{n1(p.preCalls)}</Text>
                <Text style={s.tNum}>{Math.round(p.pctExport)}%</Text>
                <Text style={[s.tNum, { color: levelC(id ? waits[id] : undefined) }]}>{id && waits[id]?.days != null ? daysWord(waits[id].days) : "–"}</Text>
              </View>
            );
          })}
        </>
      ) : null}

      {waiting.length > 0 ? (
        <>
          <View style={s.sectionHead} wrap={false}><Text style={s.kicker}>Where ships are waiting</Text></View>
          {waiting.map((w) => (
            <View key={w.id || w.name} style={s.tRow} wrap={false}>
              <Text style={[s.tName, { width: 200 }]}>{w.name}</Text>
              <Text style={[s.tSmall, { flex: 1 }]}>{w.side === "gulf" ? "Gulf side" : "Oman side"} · median wait {Math.round(w.medianHours)} h · {w.over7d} over a week</Text>
              <Text style={s.tNum}>{w.count}</Text>
            </View>
          ))}
        </>
      ) : null}
      <Text style={[s.caption, { marginTop: 10 }]}>Source: hormuz.now (CC BY 4.0). Port calls and exports: IMF PortWatch, via hormuz.now, to {hz.ports?.ports[0]?.latestDate ?? "latest"}. Ports with very few calls before the crisis are left out.{Object.keys(waits).length ? " Wait: MarineTraffic weekly median days at anchor, last full week." : ""}</Text>
      {footer}
    </Page>
  );
}

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
  /** Strait and port figures; the briefing gets a page for them when present. */
  hz?: HormuzBundle | null;
}

export function Briefing({ title, preparedFor, note, generatedAt, events, zones, chartImage, hz }: BriefingProps) {
  const byZone = Object.fromEntries(zones.map((z) => [z.zone, z])) as Partial<Record<ZoneSummary["zone"], ZoneSummary>>;
  const headline = verdict(ROUTE.map((id) => byZone[id]).filter((z): z is ZoneSummary => Boolean(z)), hz?.status?.status.pct ?? null);
  const worst = events.reduce<Severity>((m, e) => (["low", "elevated", "high", "critical"].indexOf(e.severity) > ["low", "elevated", "high", "critical"].indexOf(m) ? e.severity : m), "low");
  const official = events.filter((e) => e.official).length;
  const sources = new Set(events.flatMap((e) => e.sources.map((x) => x.publisher || x.name))).size;
  const hasWaits = Object.values(hz?.congestion?.ports ?? {}).some((p) => p.weeks.length > 0);

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
        <Text style={s.coverVerdict}>
          {headline.map((seg, i) => <Text key={i} style={seg.level ? { color: C.sev[seg.level] } : {}}>{seg.text}</Text>)}
        </Text>
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
        {chartImage ? <Text style={s.caption}>Chart at time of export. Coloured marks are reports, the green glow shows where ships crowd, and ports are ringed by how their calls compare with normal.</Text> : null}

        <View style={s.sectionHead}><Text style={s.kicker}>The route in · Suez to the Gulf, our level for each</Text></View>
        {ROUTE.map((id, i) => {
          const z = byZone[id];
          if (!z) return null;
          return (
            <View key={id} style={s.zoneRow} wrap={false}>
              <View style={[s.routeLine, { top: i === 0 ? "50%" : 0, bottom: i === ROUTE.length - 1 ? "50%" : 0, backgroundColor: C.sev[z.level] }]} />
              <View style={{ width: 20 }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.paper }}><Mark level={z.level} /></View></View>
              <Text style={s.zoneName}>{ZONE_BY_ID[id].name}</Text>
              <Text style={[s.zoneLevel, { color: C.sev[z.level] }]}>{SEV_LABEL[z.level]}</Text>
              <Text style={s.zoneHead}>{z.headline ?? "No reports in the last 24 hours"}</Text>
              <Text style={s.zoneNum}>{z.events24h}</Text>
            </View>
          );
        })}
        {footer}
      </Page>

      {hz?.status ? <StraitPage hz={hz} mast={mast} footer={footer} waitingHere={!hasWaits} level={byZone.hormuz?.level ?? "low"} /> : null}
      {hz?.status && hasWaits ? <WaitsPage hz={hz} mast={mast} footer={footer} /> : null}

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
