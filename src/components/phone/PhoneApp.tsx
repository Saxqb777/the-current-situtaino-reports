"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Selection } from "@/lib/client";
import { utcDate, utcTime } from "@/lib/ui";
import BriefingForm from "../BriefingForm";
import DetailCard from "../DetailCard";
import { Flash } from "../DesktopApp";
import Legend from "../Legend";
import Log from "../Log";
import type { Model } from "../model";
import Newsroom from "../Newsroom";
import Scrubber from "../Scrubber";
import Tour from "../Tour";
import Sheet, { type Snap } from "./Sheet";
import ZoneRail from "./ZoneRail";
import { BriefingIcon, ChartIcon, ClockIcon, HomeViewIcon, LayersIcon, LogIcon, TourIcon, TvIcon } from "./icons";

const ChartMap = dynamic(() => import("../ChartMap"), { ssr: false, loading: () => <div className="chart" /> });

type Panel = "log" | "detail" | "briefing" | "tv" | "layers" | "display";
type Tab = "chart" | "log" | "briefing" | "tv";

const TABS: { id: Tab; label: string; Icon: () => React.ReactNode }[] = [
  { id: "chart", label: "Chart", Icon: ChartIcon },
  { id: "log", label: "Log", Icon: LogIcon },
  { id: "briefing", label: "Briefing", Icon: BriefingIcon },
  { id: "tv", label: "Live TV", Icon: TvIcon },
];

const LABEL: Record<Panel, string> = {
  log: "Log", detail: "Details", briefing: "Briefing", tv: "Live TV", layers: "Chart layers", display: "Display",
};

/**
 * Phones: the chart fills the screen, the zones swipe across the top, and
 * everything else (Log, details, briefing, TV) rides up in one bottom sheet
 * that the tab bar and the chart open to the right height.
 */
export default function PhoneApp({ m }: { m: Model }) {
  const [panel, setPanel] = useState<Panel>("log");
  const [snap, setSnap] = useState<Snap>("peek");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [sheetH, setSheetH] = useState(0);
  const [timeOpen, setTimeOpen] = useState(false);
  const [back, setBack] = useState<{ panel: Panel; snap: Snap }>({ panel: "log", snap: "peek" });
  const [seenFresh, setSeenFresh] = useState<Set<string>>(m.fresh);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const halfFor = (p: Panel) => {
    if (p === "tv") return Math.min(stage.h - 40, 22 + 44 + 40 + Math.round((stage.w * 9) / 16));
    if (p === "layers") return Math.min(stage.h - 40, 250);
    if (p === "display") return Math.min(stage.h - 40, 380);
    return Math.round(stage.h * 0.56);
  };
  const open = (p: Panel, s: Snap) => { setPanel(p); setSnap(s); };

  const tab: Tab = panel === "briefing" ? "briefing" : panel === "tv" ? "tv" : panel === "log" && snap !== "peek" ? "log" : "chart";
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
    if (panel === "detail") m.select(null);
    if (t === "chart") open("log", "peek");
    else if (t === "log") open("log", "full");
    else if (t === "briefing") open("briefing", "full");
    else open("tv", "half");
  };

  const prepareTour = (id: string) => {
    setTimeOpen(false);
    if (m.selection) m.select(null);
    if (id === "log" || id === "pick-task") open("log", "half");
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
          aisConfigured={m.aisLive}
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
          </div>
          <div className="panel__scroll">
            {m.picked.size === 0 ? (
              <div className="empty">
                <h3>Tick reports to build a briefing</h3>
                <p>Open the Log and tick the reports you want. The PDF has a cover with the chart and zone levels, then each report with its sources.</p>
                <button className="tool tool--primary tool--wide" onClick={() => goTab("log")}>Open the Log</button>
              </div>
            ) : (
              <BriefingForm
                events={m.pickedEvents}
                zones={m.snap.zones}
                chartImage={() => m.chart.current?.snapshot() ?? null}
                onDone={() => goTab("chart")}
                onRemove={m.togglePick}
              />
            )}
          </div>
        </div>
      );
      break;
    case "tv":
      content = <Newsroom inline />;
      break;
    case "layers":
      content = <Legend layers={m.layers} setLayers={m.setLayers} counts={m.counts} aisConfigured={m.aisLive} />;
      break;
    case "display":
      content = (
        <div className="panel">
          <div className="panel__head" data-sheet-head="" data-sheet-drag="">
            <h3 className="panel__title">Display</h3>
          </div>
          <div className="panel__scroll panel__pad">
            <p className="panel__label">Text size</p>
            <div className="choice" role="group" aria-label="Text size">
              {(["normal", "large", "larger"] as const).map((sz, i) => (
                <button key={sz} aria-pressed={m.textSize === sz} onClick={() => m.setTextSize(sz)}>
                  <span style={{ fontSize: `${1 + i * 0.22}rem` }} aria-hidden="true">A</span>
                  <small>{["Standard", "Large", "Largest"][i]}</small>
                </button>
              ))}
            </div>
            <p className="panel__label">Chart</p>
            <div className="choice" role="group" aria-label="Chart colours">
              <button aria-pressed={m.theme !== "night"} onClick={() => m.setTheme("day")}><span>Day</span><small>Light paper</small></button>
              <button aria-pressed={m.theme === "night"} onClick={() => m.setTheme("night")}><span>Night</span><small>Bridge at night</small></button>
            </div>
            <button className="tool tool--wide" onClick={() => { open("log", "peek"); m.tour.start(); }}><TourIcon />Play the tour again</button>
          </div>
        </div>
      );
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
          selected={null}
          hover={m.hover}
          fresh={m.fresh}
          live={m.live}
          sources={m.snap.sources}
          onSelect={(id) => showDetail({ kind: "event", id })}
          onHover={m.setHover}
        />
      );
  }

  return (
    <div className="phone">
      <header className="ptop">
        <div className="ptop__brand">
          <h1 className="ptop__title">Sea Lanes <span>Watch</span></h1>
          <div className="ptop__clock mono" style={{ visibility: m.now ? "visible" : "hidden" }}>
            {utcTime(clock)} UTC · {gst} GST · {utcDate(clock)}
          </div>
        </div>
        <button className="ptop__btn" onClick={m.tour.start} data-tour="tour-btn"><TourIcon /><span>Tour</span></button>
        <button className="ptop__btn ptop__btn--aa" data-tour="display" aria-label="Display: text size and night chart" aria-pressed={panel === "display"} onClick={() => (panel === "display" ? open("log", "peek") : open("display", "half"))}>Aa</button>
      </header>

      {m.snap.sample && <div className="notice notice--phone"><b>Sample data</b>Made-up reports and ships for design review.</div>}
      {!m.snap.sample && m.snap.lastRefresh && !m.aisLive && <div className="notice notice--phone"><b>Ship feed off</b>News, ports and zones are live.</div>}

      <ZoneRail zones={m.snap.zones} active={m.filters.zone} aisLive={m.aisLive} onZone={(z) => m.focusZone(z, sheetH)} />

      <div className="stage" ref={stageRef} style={{ "--sheet-h": `${sheetH}px` } as React.CSSProperties}>
        <ChartMap
          handle={m.chart}
          events={m.layers.events ? m.shown : []}
          vessels={m.vessels}
          track={m.track}
          layers={m.layers}
          selection={m.selection}
          hoverEvent={m.hover}
          theme={m.theme}
          coveredBottom={sheetH}
          onSelect={showDetail}
          onHoverEvent={m.setHover}
        >
          <Flash m={m} onOpen={(id) => showDetail({ kind: "event", id })} />
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
        </ChartMap>
        {stage.h > 0 && (
          <Sheet snap={snap} onSnap={onSnap} stage={stage.h} half={halfFor(shownPanel)} onHeight={setSheetH} label={LABEL[shownPanel]}>
            {content}
          </Sheet>
        )}
      </div>

      <nav className="tabs" aria-label="Views">
        {TABS.map(({ id, label, Icon }) => {
          const badge = id === "log" ? unseen : id === "briefing" ? m.picked.size : 0;
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
