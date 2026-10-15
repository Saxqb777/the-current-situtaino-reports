"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ZONE_BY_ID } from "@/lib/geo";
import { SEVERITY_META, gstDate, gstTime } from "@/lib/ui";
import DetailCard from "./DetailCard";
import ExportDialog from "./ExportDialog";
import Legend from "./Legend";
import Log from "./Log";
import type { Go, Model, View } from "./model";
import Newsroom from "./Newsroom";
import HormuzPage from "./pages/HormuzPage";
import NowPage from "./pages/NowPage";
import PortsPage from "./pages/PortsPage";
import Scrubber from "./Scrubber";
import Tour from "./Tour";
import WatchStrip from "./WatchStrip";
import { TourIcon } from "./phone/icons";

const ChartMap = dynamic(() => import("./ChartMap"), { ssr: false, loading: () => <div className="chart" /> });

const VIEWS: { id: View; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "map", label: "Chart" },
  { id: "hormuz", label: "Hormuz" },
  { id: "ports", label: "Ports" },
];

/** Laptops and large tablets: masthead with four views; the live chart sits beside the Log. */
export default function DesktopApp({ m }: { m: Model }) {
  const [exporting, setExporting] = useState(false);
  const clock = new Date(m.now || 0).toISOString();
  const { snap } = m;
  const onMap = m.view === "map";

  // The chart was hidden under a page; make sure it fills its space again.
  useEffect(() => { if (onMap) requestAnimationFrame(() => m.chart.current?.resize()); }, [onMap, m.chart]);

  const go: Go = {
    view: m.setView,
    zone: (z) => { m.setView("map"); m.focusZone(z); },
    select: (sel) => { m.setView("map"); m.select(sel); },
    log: (z) => { m.setView("map"); if (z !== undefined && z !== m.filters.zone) m.setFilters({ ...m.filters, zone: z }); },
  };

  return (
    <div className="app" data-view={m.view}>
      <header className="top">
        <div className="mast">
          <div>
            <h1 className="mast__title">Sea Lanes <span>Watch</span></h1>
            <div className="mast__sub"><span>GCC ports · Strait of Hormuz</span> <span>Red Sea · Bab el-Mandeb · Somali coast</span></div>
          </div>
          <nav className="vtabs" aria-label="Views">
            {VIEWS.map((v) => (
              <button key={v.id} className="vtabs__tab" data-tour={`vtab-${v.id}`} aria-current={m.view === v.id ? "page" : undefined} onClick={() => m.setView(v.id)}>
                {v.label}
              </button>
            ))}
          </nav>
          <div className="mast__spacer" />
          <div className="mast__clock mono" aria-live="off" style={{ visibility: m.now ? "visible" : "hidden" }}>
            <b>{gstTime(clock)} GST</b>
            <small>{gstDate(clock)} · Dubai time</small>
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
      </header>

      <WatchStrip zones={snap.zones} active={m.filters.zone} zoneShips={m.zoneShips} hormuzCrossed={m.hz?.status?.last24h.total ?? null} onZone={(z) => m.focusZone(z)} />

      <ChartMap
        handle={m.chart}
        events={m.layers.events ? m.shown : []}
        vessels={m.vessels}
        track={m.shipDetail?.track ?? null}
        hz={m.hz}
        layers={m.layers}
        levels={m.levels}
        selection={m.selection}
        hoverEvent={m.hover}
        theme={m.theme}
        onSelect={(sel) => m.select(sel)}
        onHoverEvent={m.setHover}
      >
        <Legend layers={m.layers} setLayers={m.setLayers} counts={m.counts} feeds={m.feeds} now={m.now} foldable />
        <DetailCard selection={m.selection} events={snap.events} vessels={m.vessels} detail={m.shipDetail} hz={m.hz} onSelect={(sel) => m.select(sel)} onClose={() => m.select(null)} />
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
        clearPicks={m.clearPicks}
        selected={m.selection?.kind === "event" ? m.selection.id : null}
        hover={m.hover}
        fresh={m.fresh}
        live={m.live}
        sources={snap.sources}
        onSelect={(id) => m.select({ kind: "event", id })}
        onHover={m.setHover}
      />

      {!onMap && (
        <main key={m.view} className="deskpage" aria-label={VIEWS.find((v) => v.id === m.view)?.label}>
          {m.view === "now" && <NowPage m={m} go={go} />}
          {m.view === "hormuz" && <HormuzPage m={m} go={go} />}
          {m.view === "ports" && <PortsPage m={m} go={go} />}
        </main>
      )}
      {!onMap && <Flash m={m} onOpen={(id) => go.select({ kind: "event", id })} />}

      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        events={m.pickedEvents}
        zones={snap.zones}
        hz={m.hz}
        chartImage={() => m.chart.current?.snapshot() ?? null}
        onClear={m.clearPicks}
      />

      {m.tour.on && (
        <Tour
          variant="desktop"
          onEnd={m.tour.end}
          prepare={(id) => {
            if (m.selection) m.select(null);
            if (id === "welcome" || id === "now" || id === "route" || id === "finish") m.setView("now");
            else if (id !== "hormuz" && id !== "ports" && id !== "display") m.setView("map");
          }}
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
            <small>{f.zones.map((z) => ZONE_BY_ID[z].name).join(" / ")} · {gstTime(f.lastSeen)} GST</small>
          </button>
          <button className="card__close" onClick={m.dismissFlash} aria-label="Dismiss">×</button>
        </>
      )}
    </div>
  );
}
