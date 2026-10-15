"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ZONE_BY_ID } from "@/lib/geo";
import { SEVERITY_META, utcDate, utcTime } from "@/lib/ui";
import DetailCard from "./DetailCard";
import ExportDialog from "./ExportDialog";
import Legend from "./Legend";
import Log from "./Log";
import type { Model } from "./model";
import Newsroom from "./Newsroom";
import Scrubber from "./Scrubber";
import Tour from "./Tour";
import WatchStrip from "./WatchStrip";
import { TourIcon } from "./phone/icons";

const ChartMap = dynamic(() => import("./ChartMap"), { ssr: false, loading: () => <div className="chart" /> });

/** Laptops and large tablets: masthead, watch strip, chart beside the Log. */
export default function DesktopApp({ m }: { m: Model }) {
  const [exporting, setExporting] = useState(false);
  const clock = new Date(m.now || 0).toISOString();
  const { snap } = m;

  return (
    <div className="app">
      <header className="top">
        <div className="mast">
          <div>
            <h1 className="mast__title">Sea Lanes <span>Watch</span></h1>
            <div className="mast__sub">GCC ports · Strait of Hormuz · Red Sea · Bab el-Mandeb · Somali coast</div>
          </div>
          <div className="mast__spacer" />
          <div className="mast__clock mono" aria-live="off" style={{ visibility: m.now ? "visible" : "hidden" }}>
            <b>{utcTime(clock)} UTC</b>
            <small>{utcDate(clock)} · Gulf {new Date(m.now + 4 * 3600_000).toISOString().slice(11, 16)} GST</small>
          </div>
          <div className="mast__tools">
            <div className="mast__display" data-tour="display">
              <div className="seg" role="group" aria-label="Text size">
                {(["normal", "large", "larger"] as const).map((sz, i) => (
                  <button key={sz} aria-pressed={m.textSize === sz} onClick={() => m.setTextSize(sz)} aria-label={`Text size ${sz}`} style={{ fontSize: `${0.78 + i * 0.12}rem`, minWidth: 34 }}>A</button>
                ))}
              </div>
              <button className="tool" aria-pressed={m.theme === "night"} onClick={() => m.setTheme(m.theme === "night" ? "day" : "night")}>
                {m.theme === "night" ? "Day chart" : "Night chart"}
              </button>
            </div>
            <button className="tool" onClick={m.tour.start} data-tour="tour-btn"><TourIcon />Tour</button>
            <button className="tool tool--primary" data-tour="briefing" disabled={m.picked.size === 0} onClick={() => setExporting(true)} title={m.picked.size ? "" : "Tick reports in the Log to add them"}>
              Export briefing <span className="tool__count">{m.picked.size}</span>
            </button>
          </div>
        </div>
        {snap.sample && (
          <div className="notice"><b>Sample data</b>The reports and ships on screen are made up for design review. Turn SAMPLE_DATA off to see live sources.</div>
        )}
        {!snap.sample && snap.lastRefresh && !m.aisLive && (
          <div className="notice"><b>Ship feed off</b>Add an AISSTREAM_API_KEY to show live ships, transit counts and ships gone dark. News, ports and zones are live.</div>
        )}
      </header>

      <WatchStrip zones={snap.zones} active={m.filters.zone} aisLive={m.aisLive} onZone={(z) => m.focusZone(z)} />

      <ChartMap
        handle={m.chart}
        events={m.layers.events ? m.shown : []}
        vessels={m.vessels}
        track={m.track}
        layers={m.layers}
        selection={m.selection}
        hoverEvent={m.hover}
        theme={m.theme}
        onSelect={(sel) => m.select(sel)}
        onHoverEvent={m.setHover}
      >
        <Legend layers={m.layers} setLayers={m.setLayers} counts={m.counts} aisConfigured={m.aisLive} />
        <DetailCard selection={m.selection} events={snap.events} vessels={m.vessels} aisConfigured={m.aisLive} onSelect={(sel) => m.select(sel)} onClose={() => m.select(null)} />
        <Flash m={m} />
        <Newsroom />
      </ChartMap>

      {m.now > 0 ? <Scrubber events={snap.events} now={m.now} asOf={m.asOf} setAsOf={m.setAsOf} /> : <div className="scrub" />}

      <Log
        events={m.shown}
        total={m.timeEvents.length}
        filters={m.filters}
        setFilters={m.setFilters}
        picked={m.picked}
        togglePick={m.togglePick}
        pickAllShown={m.pickAllShown}
        selected={m.selection?.kind === "event" ? m.selection.id : null}
        hover={m.hover}
        fresh={m.fresh}
        live={m.live}
        sources={snap.sources}
        onSelect={(id) => m.select({ kind: "event", id })}
        onHover={m.setHover}
      />

      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        events={m.pickedEvents}
        zones={snap.zones}
        chartImage={() => m.chart.current?.snapshot() ?? null}
      />

      {m.tour.on && (
        <Tour
          variant="desktop"
          onEnd={m.tour.end}
          prepare={() => { if (m.selection) m.select(null); }}
          model={{
            zone: m.filters.zone,
            picked: m.picked.size,
            firstEventId: m.shown[0]?.id ?? null,
            focusZone: (z) => m.focusZone(z),
            togglePick: m.togglePick,
          }}
        />
      )}
    </div>
  );
}

/** Banner that drops in over the chart when a new High or Critical report arrives. */
export function Flash({ m, onOpen }: { m: Model; onOpen?(id: string): void }) {
  const f = m.flash;
  return (
    <div className="flash" data-open={Boolean(f)} role="status" aria-live="polite">
      {f && (
        <>
          <span className="flash__sev" style={{ background: SEVERITY_META[f.severity].color }}>{SEVERITY_META[f.severity].label}</span>
          <button className="flash__text" onClick={() => { (onOpen ?? ((id) => m.select({ kind: "event", id })))(f.id); m.dismissFlash(); }}>
            <b>{f.title}</b>
            <small>{f.zones.map((z) => ZONE_BY_ID[z].name).join(" / ")} · {utcTime(f.lastSeen)} UTC</small>
          </button>
          <button className="card__close" onClick={m.dismissFlash} aria-label="Dismiss">×</button>
        </>
      )}
    </div>
  );
}
