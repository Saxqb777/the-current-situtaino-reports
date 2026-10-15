"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PORTS, PORT_BY_ID, ZONE_BY_ID } from "@/lib/geo";
import type { Layers, Selection, VesselLite } from "@/lib/client";
import { decodeVessels } from "@/lib/client";
import type { Snapshot, WatchEvent, ZoneId } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { SEVERITY_META, utcDate, utcTime } from "@/lib/ui";
import type { ChartHandle } from "./ChartMap";
import DetailCard from "./DetailCard";
import ExportDialog from "./ExportDialog";
import Legend from "./Legend";
import Log, { type LogFilters } from "./Log";
import Newsroom from "./Newsroom";
import Scrubber from "./Scrubber";
import WatchStrip from "./WatchStrip";

const ChartMap = dynamic(() => import("./ChartMap"), { ssr: false, loading: () => <div className="chart" /> });

const EMPTY: Snapshot = {
  generatedAt: new Date(0).toISOString(),
  sample: false,
  ais: { connected: false, configured: false, vessels: 0, lastMessage: null },
  zones: [],
  events: [],
  sources: [],
};

function usePref(key: string, attr: "theme" | "text", fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try { setValue(localStorage.getItem(key) ?? fallback); } catch { /* storage blocked */ }
  }, [key, fallback]);
  const set = useCallback((v: string) => {
    setValue(v);
    document.documentElement.dataset[attr] = v;
    try { localStorage.setItem(key, v); } catch { /* storage blocked */ }
  }, [key, attr]);
  return [value, set] as const;
}

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [live, setLive] = useState(false);
  const [vessels, setVessels] = useState<VesselLite[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<WatchEvent | null>(null);
  const [now, setNow] = useState(0);

  const [filters, setFilters] = useState<LogFilters>({ zone: null, minSeverity: "low", officialOnly: false, query: "" });
  const [asOf, setAsOf] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [layers, setLayers] = useState<Layers>({ ships: true, unifeeder: true, dark: true, ports: true, events: true, areas: true });
  const [exporting, setExporting] = useState(false);
  const [theme, setTheme] = usePref("slw-theme", "theme", "day");
  const [textSize, setTextSize] = usePref("slw-text", "text", "normal");
  const chart = useRef<ChartHandle>(null);
  const known = useRef<Set<string> | null>(null);

  // Live snapshot over server-sent events.
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/stream");
      es.addEventListener("open", () => setLive(true));
      es.addEventListener("snapshot", (msg) => {
        const { snapshot } = JSON.parse((msg as MessageEvent).data) as { snapshot: Snapshot; fresh: string[] };
        setSnap(snapshot);
        setNow(Date.now());
        // Anything not seen before this session flashes in the Log; a new High or Critical also gets the banner.
        if (known.current) {
          const news = snapshot.events.filter((e) => !known.current!.has(e.id));
          if (news.length) {
            setFresh(new Set(news.map((e) => e.id)));
            const loud = news.find((e) => e.severity === "critical" || e.severity === "high");
            if (loud) setFlash(loud);
          }
        }
        known.current = new Set(snapshot.events.map((e) => e.id));
      });
      es.addEventListener("vessels", () => void loadVessels());
      es.onerror = () => {
        setLive(false);
        es?.close();
        retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, []);

  const loadVessels = useCallback(async () => {
    try {
      const res = await fetch("/api/vessels", { cache: "no-store" });
      const data = await res.json();
      setVessels(decodeVessels(data.rows));
    } catch { /* keep the last positions */ }
  }, []);
  useEffect(() => {
    void loadVessels();
    setNow(Date.now());
    const t = setInterval(loadVessels, 20_000);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [loadVessels]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 12_000);
    return () => clearTimeout(t);
  }, [flash]);

  // What the chart and Log show: the time scrubber first, then the filters.
  const timeEvents = useMemo(
    () => (asOf ? snap.events.filter((e) => Date.parse(e.firstSeen) <= asOf) : snap.events),
    [snap.events, asOf],
  );
  const shown = useMemo(() => {
    const min = SEVERITIES.indexOf(filters.minSeverity);
    const q = filters.query.trim().toLowerCase();
    return timeEvents.filter((e) =>
      (!filters.zone || e.zones.includes(filters.zone)) &&
      SEVERITIES.indexOf(e.severity) >= min &&
      (!filters.officialOnly || e.official) &&
      (!q || `${e.title} ${e.summary} ${e.sources.map((s) => s.publisher ?? s.name).join(" ")} ${e.ports.map((p) => PORT_BY_ID[p].name).join(" ")}`.toLowerCase().includes(q)),
    );
  }, [timeEvents, filters]);

  const select = useCallback((sel: Selection) => {
    setSelection(sel);
    if (sel?.kind === "event") {
      const e = snap.events.find((x) => x.id === sel.id);
      if (e) chart.current?.flyTo(e.position, e.ports.length ? 7.5 : 6);
    } else if (sel?.kind === "port") {
      chart.current?.flyTo(PORT_BY_ID[sel.id].position, 8.5);
    } else if (sel?.kind === "vessel") {
      const v = vessels.find((x) => x.mmsi === sel.id);
      if (v) chart.current?.flyTo([v.lon, v.lat], 8);
    }
  }, [snap.events, vessels]);

  const focusZone = useCallback((zone: ZoneId | null) => {
    setFilters((f) => ({ ...f, zone }));
    chart.current?.flyToZone(zone);
  }, []);

  const togglePick = useCallback((id: string) => {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const pickedEvents = useMemo(() => snap.events.filter((e) => picked.has(e.id)), [snap.events, picked]);
  const counts = {
    ships: vessels.filter((v) => !v.dark).length,
    unifeeder: vessels.filter((v) => v.unifeeder).length,
    dark: vessels.filter((v) => v.dark).length,
    ports: PORTS.length,
    events: shown.length,
  };
  const clock = new Date(now || 0).toISOString();
  const aisLive = snap.ais.configured;

  return (
    <div className="app">
      <header className="top">
        <div className="mast">
          <div>
            <h1 className="mast__title">Sea Lanes <span>Watch</span></h1>
            <div className="mast__sub">GCC ports · Strait of Hormuz · Red Sea · Bab el-Mandeb · Somali coast</div>
          </div>
          <div className="mast__spacer" />
          <div className="mast__clock mono" aria-live="off" style={{ visibility: now ? "visible" : "hidden" }}>
            <b>{utcTime(clock)} UTC</b>
            <small>{utcDate(clock)} · Gulf {new Date(now + 4 * 3600_000).toISOString().slice(11, 16)} GST</small>
          </div>
          <div className="mast__tools">
            <div className="seg" role="group" aria-label="Text size">
              {(["normal", "large", "larger"] as const).map((sz, i) => (
                <button key={sz} aria-pressed={textSize === sz} onClick={() => setTextSize(sz)} aria-label={`Text size ${sz}`} style={{ fontSize: `${0.78 + i * 0.12}rem`, minWidth: 34 }}>A</button>
              ))}
            </div>
            <button className="tool" aria-pressed={theme === "night"} onClick={() => setTheme(theme === "night" ? "day" : "night")}>
              {theme === "night" ? "Day chart" : "Night chart"}
            </button>
            <button className="tool tool--primary" disabled={picked.size === 0} onClick={() => setExporting(true)} title={picked.size ? "" : "Tick reports in the Log to add them"}>
              Export briefing <span className="tool__count">{picked.size}</span>
            </button>
          </div>
        </div>
        {snap.sample && (
          <div className="notice"><b>Sample data</b>The reports and ships on screen are made up for design review. Turn SAMPLE_DATA off to see live sources.</div>
        )}
        {!snap.sample && snap.generatedAt !== EMPTY.generatedAt && !aisLive && (
          <div className="notice"><b>Ship feed off</b>Add an AISSTREAM_API_KEY to show live ships, transit counts and ships gone dark. News, ports and zones are live.</div>
        )}
      </header>

      <WatchStrip zones={snap.zones} active={filters.zone} aisLive={aisLive} onZone={focusZone} />

      <ChartMap
        handle={chart}
        events={layers.events ? shown : []}
        vessels={vessels}
        layers={layers}
        selection={selection}
        hoverEvent={hover}
        theme={theme}
        onSelect={select}
        onHoverEvent={setHover}
      >
        <Legend layers={layers} setLayers={setLayers} counts={counts} aisConfigured={aisLive} />
        <DetailCard selection={selection} events={snap.events} vessels={vessels} aisConfigured={aisLive} onSelect={select} onClose={() => setSelection(null)} />
        <div className="flash" data-open={Boolean(flash)} role="status" aria-live="polite">
          {flash && (
            <>
              <span className="flash__sev" style={{ background: SEVERITY_META[flash.severity].color }}>{SEVERITY_META[flash.severity].label}</span>
              <button className="flash__text" onClick={() => { select({ kind: "event", id: flash.id }); setFlash(null); }}>
                <b>{flash.title}</b>
                <small>{flash.zones.map((z) => ZONE_BY_ID[z].name).join(" / ")} · {utcTime(flash.lastSeen)} UTC</small>
              </button>
              <button className="card__close" onClick={() => setFlash(null)} aria-label="Dismiss">×</button>
            </>
          )}
        </div>
        <Newsroom />
      </ChartMap>

      {now > 0 ? <Scrubber events={snap.events} now={now} asOf={asOf} setAsOf={setAsOf} /> : <div className="scrub" />}

      <Log
        events={shown}
        total={timeEvents.length}
        filters={filters}
        setFilters={(f) => { if (f.zone !== filters.zone) chart.current?.flyToZone(f.zone); setFilters(f); }}
        picked={picked}
        togglePick={togglePick}
        pickAllShown={() => setPicked((p) => new Set([...p, ...shown.map((e) => e.id)]))}
        selected={selection?.kind === "event" ? selection.id : null}
        hover={hover}
        fresh={fresh}
        live={live}
        sources={snap.sources}
        onSelect={(id) => select({ kind: "event", id })}
        onHover={setHover}
      />

      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        events={pickedEvents}
        zones={snap.zones}
        chartImage={() => chart.current?.snapshot() ?? null}
      />
    </div>
  );
}
