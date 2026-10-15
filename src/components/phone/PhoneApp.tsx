"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Selection } from "@/lib/client";
import type { ZoneId } from "@/lib/types";
import { utcDate, utcTime } from "@/lib/ui";
import BriefingForm from "../BriefingForm";
import DetailCard from "../DetailCard";
import { Flash } from "../DesktopApp";
import Legend from "../Legend";
import Log from "../Log";
import type { Go, Model, View } from "../model";
import HormuzPage from "../pages/HormuzPage";
import NowPage from "../pages/NowPage";
import PortsPage from "../pages/PortsPage";
import Scrubber from "../Scrubber";
import Tour from "../Tour";
import Sheet, { type Snap } from "./Sheet";
import ZoneRail from "./ZoneRail";
import { AnchorIcon, ChartIcon, ClockIcon, HomeViewIcon, LayersIcon, LogIcon, NowIcon, StraitIcon, TourIcon } from "./icons";

const ChartMap = dynamic(() => import("../ChartMap"), { ssr: false, loading: () => <div className="chart" /> });

type Panel = "log" | "detail" | "briefing" | "layers";
type Tab = "now" | "map" | "hormuz" | "ports" | "log";

const TABS: { id: Tab; label: string; Icon: () => React.ReactNode }[] = [
  { id: "now", label: "Now", Icon: NowIcon },
  { id: "map", label: "Chart", Icon: ChartIcon },
  { id: "hormuz", label: "Hormuz", Icon: StraitIcon },
  { id: "ports", label: "Ports", Icon: AnchorIcon },
  { id: "log", label: "Log", Icon: LogIcon },
];

const LABEL: Record<Panel, string> = { log: "Log", detail: "Details", briefing: "Briefing", layers: "Chart layers" };

/**
 * Phones: five tabs. Now, Hormuz and Ports are full pages that scroll; the
 * chart fills the screen under them, with the zones swiping across the top
 * and the Log, details and briefing riding up in one bottom sheet.
 */
export default function PhoneApp({ m }: { m: Model }) {
  const [panel, setPanel] = useState<Panel>("log");
  const [snap, setSnap] = useState<Snap>("peek");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [sheetH, setSheetH] = useState(0);
  const [timeOpen, setTimeOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [back, setBack] = useState<{ panel: Panel; snap: Snap }>({ panel: "log", snap: "peek" });
  const [seenFresh, setSeenFresh] = useState<Set<string>>(m.fresh);
  const stageRef = useRef<HTMLDivElement>(null);
  const onMap = m.view === "map";

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The chart was hidden under a page; make sure it fills its space again.
  useEffect(() => { if (onMap) requestAnimationFrame(() => m.chart.current?.resize()); }, [onMap, m.chart]);

  const halfFor = (p: Panel) => {
    if (p === "layers") return Math.min(stage.h - 40, 470);
    return Math.round(stage.h * 0.56);
  };
  const open = (p: Panel, s: Snap) => { setPanel(p); setSnap(s); };

  const tab: Tab = !onMap ? m.view : panel === "log" && snap !== "peek" ? "log" : "map";
  useEffect(() => { if (tab === "log") setSeenFresh(m.fresh); }, [tab, m.fresh]);
  const unseen = tab !== "log" && m.fresh !== seenFresh ? m.fresh.size : 0;

  const showDetail = (sel: Selection) => {
    if (!sel) return closeDetail();
    if (panel !== "detail") setBack({ panel, snap });
    m.select(sel, halfFor("detail"));
    open("detail", "half");
  };
  function closeDetail() {
    m.select(null);
    open(back.panel === "detail" ? "log" : back.panel, back.snap);
  }

  const onSnap = (s: Snap) => {
    // Pulling any other panel all the way down puts the Log back underneath.
    if (s === "peek" && panel !== "log") {
      if (panel === "detail") m.select(null);
      setPanel("log");
    }
    setSnap(s);
  };

  const goTab = (t: Tab) => {
    setTimeOpen(false);
    setDisplayOpen(false);
    if (panel === "detail") m.select(null);
    if (t === "log") { m.setView("map"); open("log", "full"); return; }
    if (t === "map") { m.setView("map"); open("log", "peek"); return; }
    m.setView(t);
  };

  const go: Go = {
    view: (v: View) => goTab(v),
    zone: (z: ZoneId | null) => {
      m.setView("map");
      open("log", "peek");
      m.focusZone(z, sheetH || 120);
    },
    select: (sel) => {
      m.setView("map");
      setBack({ panel: "log", snap: "peek" });
      m.select(sel, halfFor("detail"));
      open("detail", "half");
    },
    log: (z) => {
      if (z !== undefined && z !== m.filters.zone) m.setFilters({ ...m.filters, zone: z });
      m.setView("map");
      open("log", "full");
    },
  };

  const prepareTour = (id: string) => {
    setTimeOpen(false);
    setDisplayOpen(false);
    if (m.selection) m.select(null);
    if (id === "welcome" || id === "now" || id === "route" || id === "tv" || id === "finish") { m.setView("now"); return; }
    m.setView("map");
    if (id === "log" || id === "pick-task" || id === "briefing") open("log", "half");
    else open("log", "peek");
  };

  const clock = new Date(m.now || 0).toISOString();
  const gst = new Date(m.now + 4 * 3600_000).toISOString().slice(11, 16);
  const shownPanel: Panel = panel === "detail" && !m.selection ? "log" : panel;

  let content: React.ReactNode;
  switch (shownPanel) {
    case "detail":
      content = (
        <DetailCard
          selection={m.selection}
          events={m.snap.events}
          vessels={m.vessels}
          detail={m.shipDetail}
          hz={m.hz}
          onSelect={(sel) => (sel ? m.select(sel, halfFor("detail")) : closeDetail())}
          onClose={closeDetail}
        />
      );
      break;
    case "briefing":
      content = (
        <div className="panel">
          <div className="panel__head" data-sheet-head="" data-sheet-drag="">
            <h3 className="panel__title">Briefing</h3>
            <span className="panel__sub">{m.picked.size === 0 ? "Nothing ticked yet" : `${m.picked.size} ${m.picked.size === 1 ? "report" : "reports"} ticked`}</span>
            <button className="card__close" onClick={() => open("log", "full")} aria-label="Back to the Log">×</button>
          </div>
          <div className="panel__scroll">
            {m.picked.size === 0 ? (
              <div className="empty">
                <h3>Tick reports to build a briefing</h3>
                <p>Tick the reports you want in the Log. The PDF opens with the chart, the strait and the ports, then each report with its sources.</p>
                <button className="tool tool--primary tool--wide" onClick={() => open("log", "full")}>Back to the Log</button>
              </div>
            ) : (
              <BriefingForm
                events={m.pickedEvents}
                zones={m.snap.zones}
                hz={m.hz}
                chartImage={() => m.chart.current?.snapshot() ?? null}
                onDone={() => open("log", "peek")}
                onRemove={m.togglePick}
                onClear={m.clearPicks}
              />
            )}
          </div>
        </div>
      );
      break;
    case "layers":
      content = <Legend layers={m.layers} setLayers={m.setLayers} counts={m.counts} feeds={m.feeds} now={m.now} />;
      break;
    default:
      content = (
        <Log
          variant="sheet"
          peek={snap === "peek"}
          events={m.shown}
          total={m.timeEvents.length}
          filters={m.filters}
          setFilters={m.setFilters}
          picked={m.picked}
          togglePick={m.togglePick}
          pickAllShown={m.pickAllShown}
          clearPicks={m.clearPicks}
          selected={null}
          hover={m.hover}
          fresh={m.fresh}
          live={m.live}
          sources={m.snap.sources}
          onSelect={(id) => showDetail({ kind: "event", id })}
          onHover={m.setHover}
          onBriefing={() => open("briefing", "full")}
        />
      );
  }

  return (
    <div className="phone" data-view={m.view}>
      <header className="ptop">
        <div className="ptop__brand">
          <h1 className="ptop__title">Sea Lanes <span>Watch</span></h1>
          <div className="ptop__clock mono" style={{ visibility: m.now ? "visible" : "hidden" }}>
            {utcTime(clock)} UTC · {gst} GST · {utcDate(clock)}
          </div>
        </div>
        <button className="ptop__btn" onClick={() => { setDisplayOpen(false); m.tour.start(); }} data-tour="tour-btn"><TourIcon /><span>Tour</span></button>
        <button className="ptop__btn ptop__btn--aa" data-tour="display" aria-label="Display: text size and night chart" aria-expanded={displayOpen} onClick={() => setDisplayOpen(!displayOpen)}>Aa</button>
      </header>

      {displayOpen && (
        <div className="pmenu" role="dialog" aria-label="Display">
          <p className="panel__label">Text size</p>
          <div className="choice" role="group" aria-label="Text size">
            {(["normal", "large", "larger"] as const).map((sz, i) => (
              <button key={sz} aria-pressed={m.textSize === sz} onClick={() => m.setTextSize(sz)}>
                <span style={{ fontSize: `${1 + i * 0.22}rem` }} aria-hidden="true">A</span>
                <small>{["Standard", "Large", "Largest"][i]}</small>
              </button>
            ))}
          </div>
          <p className="panel__label">Colours</p>
          <div className="choice" role="group" aria-label="Colours">
            <button aria-pressed={m.theme !== "night"} onClick={() => m.setTheme("day")}><span>Day</span><small>Light paper</small></button>
            <button aria-pressed={m.theme === "night"} onClick={() => m.setTheme("night")}><span>Night</span><small>Bridge at night</small></button>
          </div>
          <button className="tool tool--wide" onClick={() => { setDisplayOpen(false); m.tour.start(); }}><TourIcon />Play the tour again</button>
        </div>
      )}
      {displayOpen && <button className="pmenu__scrim" aria-label="Close display settings" onClick={() => setDisplayOpen(false)} />}

      {m.snap.sample && <div className="notice notice--phone"><b>Sample data</b>Made-up reports for design review.</div>}

      <div className="pbody">
        <ZoneRail zones={m.snap.zones} active={m.filters.zone} zoneShips={m.zoneShips} hormuzCrossed={m.hz?.status?.last24h.total ?? null} onZone={(z) => m.focusZone(z, sheetH)} />

        <div className="stage" ref={stageRef} style={{ "--sheet-h": `${sheetH}px` } as React.CSSProperties}>
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
            coveredBottom={sheetH}
            onSelect={showDetail}
            onHoverEvent={m.setHover}
          >
            <Flash m={m} onOpen={(id) => showDetail({ kind: "event", id })} />
            <div className="mapdock">
              <div className="mapctl" role="group" aria-label="Chart controls">
                <button data-tour="layers" aria-label="Chart layers" aria-pressed={panel === "layers"} onClick={() => (panel === "layers" ? open("log", "peek") : open("layers", "half"))}><LayersIcon /></button>
                <button data-tour="time" aria-label="Look back in time" aria-pressed={timeOpen || m.asOf !== null} onClick={() => setTimeOpen(!timeOpen)}><ClockIcon /></button>
                <button aria-label="Show the whole region" onClick={() => m.focusZone(null, sheetH)}><HomeViewIcon /></button>
              </div>
              {timeOpen && m.now > 0 && (
                <div className="timepanel">
                  <Scrubber events={m.snap.events} now={m.now} asOf={m.asOf} setAsOf={m.setAsOf} />
                  <button className="card__close timepanel__close" onClick={() => setTimeOpen(false)} aria-label="Close the time bar">×</button>
                </div>
              )}
              {!timeOpen && m.asOf !== null && (
                <button className="pastchip" onClick={() => m.setAsOf(null)}>
                  Showing {utcDate(new Date(m.asOf).toISOString())} {utcTime(new Date(m.asOf).toISOString())} UTC <b>Back to live</b>
                </button>
              )}
            </div>
          </ChartMap>
          {stage.h > 0 && (
            <Sheet snap={snap} onSnap={onSnap} stage={stage.h} half={halfFor(shownPanel)} onHeight={setSheetH} label={LABEL[shownPanel]}>
              {content}
            </Sheet>
          )}
        </div>

        {!onMap && (
          <main key={m.view} className="pview" aria-label={m.view === "now" ? "Now" : m.view === "hormuz" ? "Strait of Hormuz" : "Ports"}>
            {m.view === "now" && <NowPage m={m} go={go} />}
            {m.view === "hormuz" && <HormuzPage m={m} go={go} />}
            {m.view === "ports" && <PortsPage m={m} go={go} />}
            {m.flash && <Flash m={m} onOpen={(id) => go.select({ kind: "event", id })} />}
          </main>
        )}
      </div>

      <nav className="tabs" aria-label="Views">
        {TABS.map(({ id, label, Icon }) => {
          const badge = id === "log" ? unseen : 0;
          return (
            <button key={id} className="tabs__tab" data-tour={`tab-${id}`} aria-current={tab === id ? "page" : undefined} onClick={() => goTab(id)}>
              <Icon />
              <span className="tabs__label">{label}</span>
              {badge > 0 && <span className="tabs__badge mono" data-kind={id}>{badge}</span>}
            </button>
          );
        })}
      </nav>

      {m.tour.on && (
        <Tour
          variant="phone"
          onEnd={m.tour.end}
          prepare={prepareTour}
          model={{
            zone: m.filters.zone,
            picked: m.picked.size,
            firstEventId: m.shown[0]?.id ?? null,
            focusZone: (z) => m.focusZone(z, sheetH),
            togglePick: m.togglePick,
          }}
        />
      )}
    </div>
  );
}
