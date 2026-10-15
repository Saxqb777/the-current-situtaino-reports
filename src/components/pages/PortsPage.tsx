"use client";

import { useMemo, useState } from "react";
import { PORTS, PORT_BY_ID, ZONE_BY_ID } from "@/lib/geo";
import type { HzPort } from "@/lib/hormuz";
import { PORTWATCH_PORT, callsBand } from "@/lib/portwatch";
import { SEVERITIES } from "@/lib/types";
import type { WatchEvent } from "@/lib/types";
import { SEVERITY_META, ago } from "@/lib/ui";
import { GCC_PORTS, LEVEL_WORD, type PortWait, allWaits, dailyWait, daysShort, daysWord, diffShort } from "@/lib/waits";
import Congestion from "../Congestion";
import type { Go, Model } from "../model";
import SeverityMark from "../SeverityMark";
import CountUp from "../viz/CountUp";
import { WeekBars } from "../viz/charts";
import Spark from "../viz/Spark";
import { fmt } from "../viz/scale";
import { Credit, Kpi, Loading, Section } from "./parts";

type View = "calls" | "waits";
type Group = "all" | "gulf-energy" | "gulf-trade" | "bypass";
type Sort = "hit" | "wait" | "index" | "rising" | "waiting" | "name";

const GROUPS: { id: Group; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gulf-trade", label: "Trade" },
  { id: "gulf-energy", label: "Oil and gas" },
  { id: "bypass", label: "Outside Hormuz" },
];
const COUNTRIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "UAE", label: "UAE" },
  { id: "Saudi Arabia", label: "Saudi" },
  { id: "Qatar", label: "Qatar" },
  { id: "Bahrain", label: "Bahrain" },
  { id: "Kuwait", label: "Kuwait" },
  { id: "Oman", label: "Oman" },
];
const SORTS: Record<View, { id: Sort; label: string }[]> = {
  calls: [
    { id: "hit", label: "Hardest hit" },
    { id: "wait", label: "Longest wait" },
    { id: "waiting", label: "Most ships waiting now" },
    { id: "name", label: "A to Z" },
  ],
  waits: [
    { id: "wait", label: "Longest wait" },
    { id: "index", label: "Most congested" },
    { id: "rising", label: "Most above usual" },
    { id: "waiting", label: "Most ships queuing" },
    { id: "name", label: "A to Z" },
  ],
};
const BAND_WORD = { normal: "Near normal", reduced: "Reduced", low: "Hard hit" };
/** Wait bars run to this many days, so a week-long wait fills the bar. */
const WAIT_SCALE = 7;
const WEEK = 7 * 24 * 3600_000;

/** Every Gulf port PortWatch tracks, against before the crisis, plus news-only ports further out. */
export default function PortsPage({ m, go }: { m: Model; go: Go }) {
  const data = m.hz?.ports;
  const [view, setView] = useState<View>("calls");
  const [group, setGroup] = useState<Group>("all");
  const [country, setCountry] = useState("all");
  const [sort, setSort] = useState<Sort>("hit");
  const [open, setOpen] = useState<string | null>(null);
  const now = m.now || Date.now();

  const recent = useMemo(() => m.snap.events.filter((e) => now - Date.parse(e.lastSeen) < WEEK), [m.snap.events, now]);
  const reportsFor = (id: string | undefined) => (id ? recent.filter((e) => e.ports.includes(id)) : []);
  const waits = useMemo(() => allWaits(PORTS.map((p) => p.id), m.hz?.congestion, m.hz?.areas), [m.hz?.congestion, m.hz?.areas]);
  const switchView = (v: View) => { setView(v); setSort(SORTS[v][0].id); setOpen(null); };

  if (!data) return <div className="page page--ports" data-page="ports"><Loading failed={m.hzFailed} what="port figures" /></div>;
  const ports = data.ports;
  const counted = ports.filter((p) => !p.lowBase);
  const bands = { normal: 0, reduced: 0, low: 0 };
  for (const p of counted) bands[callsBand(p.pctCalls)]++;
  const median = [...counted].sort((a, b) => a.pctCalls - b.pctCalls)[Math.floor(counted.length / 2)]?.pctCalls ?? 0;
  const waiting = ports.reduce((n, p) => n + p.liveWaiting, 0);
  const waitList = Object.keys(GCC_PORTS).map((id) => waits[id]).filter((w) => w?.terminals.length);
  const busy = waitList.filter((w) => w.level === "high").length;
  const moderate = waitList.filter((w) => w.level === "elevated").length;
  const waitOf = (id: string | undefined) => (id ? waits[id] : undefined);
  // Ports without a figure go last whatever the order.
  const byWait = (a: PortWait | undefined, b: PortWait | undefined) => (b?.days ?? -1) - (a?.days ?? -1);
  const byRise = (a: PortWait | undefined, b: PortWait | undefined) => rise(b) - rise(a);
  const byWaiting = (a: PortWait | undefined, b: PortWait | undefined) => (b?.live?.waiting ?? -1) - (a?.live?.waiting ?? -1);
  const byQueue = (a: PortWait, b: PortWait) => b.waiting - a.waiting;
  const byIndex = (a: PortWait, b: PortWait) => (b.index ?? -1) - (a.index ?? -1);

  const shown = ports
    .filter((p) => group === "all" || p.group === group)
    .sort((a, b) => {
      const wa = waitOf(PORTWATCH_PORT[a.slug]);
      const wb = waitOf(PORTWATCH_PORT[b.slug]);
      if (sort === "waiting") return byWaiting(wa, wb) || b.liveWaiting - a.liveWaiting || a.pctCalls - b.pctCalls;
      if (sort === "wait") return byWait(wa, wb) || a.pctCalls - b.pctCalls;
      if (sort === "name") return a.name.localeCompare(b.name);
      // Hardest hit first; small-base ports, whose percentages swing wildly, go last.
      return Number(a.lowBase) - Number(b.lowBase) || a.pctCalls - b.pctCalls;
    });

  const waitRows = waitList
    .map((w) => PORT_BY_ID[w.id])
    .filter((p) => p && (country === "all" || p.country === country))
    .sort((a, b) => {
      const wa = waits[a.id];
      const wb = waits[b.id];
      if (sort === "rising") return byRise(wa, wb) || byWait(wa, wb);
      if (sort === "waiting") return byQueue(wa, wb) || byWait(wa, wb);
      if (sort === "index") return byIndex(wa, wb) || byWait(wa, wb);
      if (sort === "name") return a.name.localeCompare(b.name);
      return byWait(wa, wb) || byIndex(wa, wb) || a.name.localeCompare(b.name);
    });

  const outer = PORTS.filter((p) => p.zone === "redsea" || p.zone === "aden" || p.zone === "somalia")
    .map((p) => {
      const evs = reportsFor(p.id);
      const worst = evs.reduce<WatchEvent | null>((w, e) => (!w || SEVERITIES.indexOf(e.severity) > SEVERITIES.indexOf(w.severity) ? e : w), null);
      return { port: p, count: evs.length, worst };
    })
    .sort((a, b) => (b.worst ? SEVERITIES.indexOf(b.worst.severity) : -1) - (a.worst ? SEVERITIES.indexOf(a.worst.severity) : -1) || b.count - a.count);

  return (
    <div className="page page--ports" data-page="ports">
      <header className="hero hero--ports">
        <p className="kicker mono">Ports · {ports.length} tracked · calls to {data.ports[0]?.latestDate ?? "–"}</p>
        <h1 className="hero__title hero__title--big">
          The typical Gulf port is handling <em><CountUp value={median} />%</em> of its normal calls
        </h1>
        <p className="hero__deck">Ship calls and exports at each port, compared with the year before the crisis. Tap a port for its weekly calls and the latest reports.</p>
      </header>

      <div className="kpis">
        <Kpi label="Hard hit, under 40%" value={<CountUp value={bands.low} />} tone="danger" foot={`of ${counted.length} ports`} />
        <Kpi label="Reduced, 40–75%" value={<CountUp value={bands.reduced} />} tone="warn" foot="of normal calls" />
        {waitList.length > 0
          ? <Kpi label="GCC ports busy or moderate" value={<CountUp value={busy + moderate} />} tone={busy ? "danger" : moderate ? "warn" : "ok"} foot={`${busy} busy · ${moderate} moderate · of ${waitList.length}`} />
          : <Kpi label="Near normal" value={<CountUp value={bands.normal} />} tone="ok" foot="75% or more" />}
        <Kpi label="Ships waiting off ports" value={<CountUp value={waiting} />} foot="live, hormuz.now" />
      </div>

      <div className="viewtabs" role="tablist" aria-label="What to compare">
        <button role="tab" aria-selected={view === "calls"} onClick={() => switchView("calls")}>Port calls<small>against before the crisis</small></button>
        <button role="tab" aria-selected={view === "waits"} onClick={() => switchView("waits")} data-tour="ports-waits">Waiting times<small>{waitList.length ? `${waitList.length} GCC ports, read hourly` : "how long ships wait"}</small></button>
      </div>

      <div className="toolbar" role="group" aria-label="Filter and sort ports">
        {view === "calls" ? (
          <div className="seg seg--page" aria-label="Port group">
            {GROUPS.map((g) => (
              <button key={g.id} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>
            ))}
          </div>
        ) : (
          <div className="seg seg--page" aria-label="Country">
            {COUNTRIES.map((c) => (
              <button key={c.id} aria-pressed={country === c.id} onClick={() => setCountry(c.id)}>{c.label}</button>
            ))}
          </div>
        )}
        <label className="toolbar__sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS[view].map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {view === "calls" ? (
        <ol className="ports" data-tour="ports-list">
          <li className="ports__head" aria-hidden="true">
            <span>Port</span><span>Calls vs normal</span><span>Exports</span><span>Wait</span><span>30 weeks</span>
          </li>
          {shown.map((p) => (
            <PortRow
              key={p.slug}
              p={p}
              wait={waitOf(PORTWATCH_PORT[p.slug])}
              open={open === p.slug}
              onToggle={() => setOpen(open === p.slug ? null : p.slug)}
              reports={reportsFor(PORTWATCH_PORT[p.slug])}
              go={go}
              now={now}
            />
          ))}
        </ol>
      ) : (
        <ol className="ports ports--waits" data-tour="ports-list">
          <li className="ports__head" aria-hidden="true">
            <span>Port</span><span>Wait now, against usual</span><span>Vs usual</span><span>Index</span><span>30 days</span>
          </li>
          {waitRows.length === 0 && <li className="muted ports__empty">No wait figures here yet. Ports are read every hour.</li>}
          {waitRows.map((p) => (
            <WaitRow
              key={p.id}
              id={p.id}
              w={waits[p.id]}
              open={open === p.id}
              onToggle={() => setOpen(open === p.id ? null : p.id)}
              reports={reportsFor(p.id)}
              go={go}
              now={now}
            />
          ))}
        </ol>
      )}

      {data.tonnage.available && (
        <Section n="T" title="Tanker exports" sub="Deadweight of tankers leaving Gulf ports a day">
          <div className="tonnage">
            <div className="tonnage__fig"><b className="mono"><CountUp value={data.tonnage.pct7} digits={1} />%</b><span>of normal, last 7 days</span></div>
            <Spark values={data.tonnage.daily.map((d) => d.tankerDwt)} height={56} tone="danger" reference={data.tonnage.preTankerDwt} label="Tanker deadweight leaving Gulf ports a day" />
            <p className="muted">Dotted line: the daily average before the crisis, {fmt(data.tonnage.preTankerDwt / 1e6, 1)} million tonnes.</p>
          </div>
        </Section>
      )}

      <Section n="R" title="Red Sea, Aden and Somali coast" sub="No port-call figures reach these ports yet, so they are tracked through the news and their waiting times">
        <ol className="outer">
          {outer.map(({ port, count, worst }) => (
            <li key={port.id}>
              <button onClick={() => go.select({ kind: "port", id: port.id })}>
                {worst ? <SeverityMark level={worst.severity} size={20} /> : <span className="outer__none" aria-hidden="true" />}
                <span className="outer__name">{port.name}<small>{port.country} · {ZONE_BY_ID[port.zone].short}</small></span>
                <span className="outer__n mono">
                  {count ? `${count} ${count === 1 ? "report" : "reports"}` : "quiet"}
                  {waits[port.id]?.days != null && <b data-level={waits[port.id].level}>{waits[port.id].days ? `${daysWord(waits[port.id].days)} wait` : "No queue"}</b>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Section>

      <Credit>
        <p><b>Port calls</b> IMF PortWatch port calls and trade estimates, via hormuz.now (CC BY 4.0). Normal means the daily average for the year before 28 Feb 2026. Ports marked “small base” had very few calls before, so their percentages swing widely.</p>
        <p><b>Waiting times</b> Kpler container-terminal congestion at 16 GCC ports, read every hour. Wait now is how long the ships queuing for a berth have waited, averaged across a port’s terminals by how many queue at each; waits over 30 days are left out as stale records. Usual is the terminals’ usual wait. Index is Kpler’s 0 to 10 congestion index for the port’s busiest terminal: 7 or more busy, 4 to 7 moderate. Ships waiting off a port, of every kind: hormuz.now.</p>
      </Credit>
    </div>
  );
}

/** How much longer than usual the wait is now, in days; ports without a figure sort last. */
function rise(w: PortWait | undefined): number {
  return w?.days != null && w.typical != null ? w.days - w.typical : -99;
}

function PortRow({ p, wait, open, onToggle, reports, go, now }: { p: HzPort; wait: PortWait | undefined; open: boolean; onToggle(): void; reports: WatchEvent[]; go: Go; now: number }) {
  const band = callsBand(p.pctCalls);
  const id = PORTWATCH_PORT[p.slug];
  const port = id ? PORT_BY_ID[id] : undefined;
  return (
    <li className="ports__item" data-open={open}>
      <button className="ports__row" aria-expanded={open} onClick={onToggle}>
        <span className="ports__name">
          {port?.name ?? p.name}
          <small>{p.countryName} · {p.groupLabel.replace(/^Oil and gas terminals inside the Gulf$/, "Oil and gas, inside the Gulf")}</small>
        </span>
        <span className="ports__calls">
          <span className="ports__bar" data-band={p.lowBase ? "small" : band}>
            <i style={{ width: `${Math.min(100, (p.pctCalls / 150) * 100)}%` }} />
            <em aria-hidden="true" />
          </span>
          <b className="mono" data-band={p.lowBase ? "small" : band}>{Math.round(p.pctCalls)}%</b>
          <small>{p.lowBase ? "Small base" : BAND_WORD[band]}</small>
        </span>
        <span className="ports__exp mono" data-label="Exports">{Math.round(p.pctExport)}%</span>
        <span className="ports__wait mono" data-label="Wait">
          {wait?.days != null ? <b data-level={wait.level}>{daysShort(wait.days)}</b> : "–"}
        </span>
        <span className="ports__spark"><Spark values={p.weekly} height={26} dot tone={band === "low" && !p.lowBase ? "danger" : "ink"} /></span>
      </button>
      {open && (
        <div className="ports__more">
          <div className="ports__facts">
            <div><span>Calls a day now</span><b className="mono">{p.nowCalls.toFixed(1)}</b></div>
            <div><span>Before the crisis</span><b className="mono">{p.preCalls.toFixed(1)}</b></div>
            <div><span>Exports vs normal</span><b className="mono">{Math.round(p.pctExport)}%</b></div>
            <div><span>Ships waiting nearby</span><b className="mono">{p.liveWaiting}</b></div>
          </div>
          <WeekBars weeks={p.weekly} reference={p.preCalls * 7} height={80} />
          {p.note && <p className="ports__note">{p.note}</p>}
          <Congestion w={wait} now={now} />
          {reports.length > 0 && (
            <ul className="ports__reports">
              {reports.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <button onClick={() => go.select({ kind: "event", id: e.id })} style={{ "--entry-sev": SEVERITY_META[e.severity].color } as React.CSSProperties}>
                    <span className="brief__sev">{SEVERITY_META[e.severity].label}</span>
                    <span>{e.title}</span>
                    <small className="mono">{ago(e.lastSeen, now)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {id && <button className="act act--line" onClick={() => go.select({ kind: "port", id })}>Show on the chart →</button>}
        </div>
      )}
    </li>
  );
}

function WaitRow({ id, w, open, onToggle, reports, go, now }: { id: string; w: PortWait; open: boolean; onToggle(): void; reports: WatchEvent[]; go: Go; now: number }) {
  const port = PORT_BY_ID[id];
  const diff = w.days !== null && w.typical !== null ? w.days - w.typical : null;
  const series = dailyWait(w.history);
  return (
    <li className="ports__item" data-open={open}>
      <button className="ports__row" aria-expanded={open} onClick={onToggle}>
        <span className="ports__name">
          {port.name}
          <small>{port.country} · {w.terminals.length} {w.terminals.length === 1 ? "terminal" : "terminals"}</small>
        </span>
        <span className="ports__calls">
          <span className="ports__bar" data-level={w.level ?? "none"}>
            <i style={{ width: `${Math.min(100, ((w.days ?? 0) / WAIT_SCALE) * 100)}%` }} />
            {w.typical !== null && <em aria-hidden="true" style={{ left: `calc(${Math.min(100, (w.typical / WAIT_SCALE) * 100)}% - 1px)` }} />}
          </span>
          <b className="mono" data-level={w.level ?? "none"}>{daysWord(w.days)}</b>
          <small>{w.waiting ? `${w.waiting} queuing` : "none queuing"}{w.level ? ` · ${LEVEL_WORD[w.level]}` : ""}</small>
        </span>
        <span className="ports__exp mono" data-label="Vs usual" data-up={w.longer}>{diffShort(diff)}</span>
        <span className="ports__wait mono" data-label="Index"><b data-level={w.level ?? "none"}>{w.index === null ? "–" : w.index.toFixed(1)}</b></span>
        <span className="ports__spark">{series.length > 1 && <Spark values={series} height={26} dot reference={w.typical ?? undefined} tone={w.level === "high" ? "danger" : "ink"} />}</span>
      </button>
      {open && (
        <div className="ports__more ports__more--waits">
          <Congestion w={w} now={now} bare />
          <div>
            {reports.length > 0 && (
              <ul className="ports__reports">
                {reports.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <button onClick={() => go.select({ kind: "event", id: e.id })} style={{ "--entry-sev": SEVERITY_META[e.severity].color } as React.CSSProperties}>
                      <span className="brief__sev">{SEVERITY_META[e.severity].label}</span>
                      <span>{e.title}</span>
                      <small className="mono">{ago(e.lastSeen, now)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button className="act act--line" onClick={() => go.select({ kind: "port", id })}>Show on the chart →</button>
          </div>
        </div>
      )}
    </li>
  );
}
