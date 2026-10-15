"use client";

import { PORT_BY_ID, ZONE_BY_ID, distanceNm } from "@/lib/geo";
import type { Selection, VesselLite } from "@/lib/client";
import type { HormuzBundle } from "@/lib/hormuz";
import type { ShipDetail } from "@/lib/hooks";
import { PORT_PORTWATCH, callsBand } from "@/lib/portwatch";
import type { WatchEvent } from "@/lib/types";
import { SEVERITY_META, ago, agoMin, dm, flagName, tonnes, gstTime } from "@/lib/ui";
import { severityRank } from "@/lib/classify";
import { portWait } from "@/lib/waits";
import Congestion from "./Congestion";
import SeverityMark from "./SeverityMark";
import { WeekBars } from "./viz/charts";

interface Props {
  selection: Selection;
  events: WatchEvent[];
  vessels: VesselLite[];
  detail: ShipDetail | null;
  hz: HormuzBundle | null;
  onSelect(sel: Selection): void;
  onClose(): void;
}

const GROUP_WORD = { tanker: "Tanker", cargo: "Cargo ship", other: "Ship" };
const SOURCE_WORD = {
  hormuz: "hormuz.now live feed (CC BY 4.0)",
  westGulf: "VesselAPI, west Gulf picture taken a few times a day",
  ais: "aisstream.io",
};
const BAND_WORD = { normal: "Near normal", reduced: "Reduced", low: "Hard hit" };

export default function DetailCard({ selection, events, vessels, detail, hz, onSelect, onClose }: Props) {
  if (!selection) return null;

  if (selection.kind === "event") {
    const e = events.find((x) => x.id === selection.id);
    if (!e) return null;
    const meta = SEVERITY_META[e.severity];
    return (
      <Card kicker={`${meta.label} · ${e.zones.map((z) => ZONE_BY_ID[z].name).join(" / ")}`} title={e.title} onClose={onClose} mark={<SeverityMark level={e.severity} size={28} />}>
        {e.summary && <p style={{ marginTop: 0 }}>{e.summary}</p>}
        <dl className="card__grid">
          <dt>First report</dt><dd className="mono">{gstTime(e.firstSeen)} GST · {ago(e.firstSeen)}</dd>
          <dt>Latest</dt><dd className="mono">{gstTime(e.lastSeen)} GST · {ago(e.lastSeen)}</dd>
          {e.official && <><dt>Official</dt><dd>{e.citesOfficial.join(", ")}</dd></>}
          {e.ports.length > 0 && <><dt>Ports</dt><dd>{e.ports.map((id) => PORT_BY_ID[id].name).join(", ")}</dd></>}
        </dl>
        <div className="card__section">
          <h4>{e.sources.length} {e.sources.length === 1 ? "source" : "sources"}</h4>
          <ul className="card__list">
            {e.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="card__item-title">{s.publisher || s.name}</a>
                <div className="card__meta">{s.title} · {gstTime(s.publishedAt)} GST</div>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    );
  }

  if (selection.kind === "port") {
    const port = PORT_BY_ID[selection.id];
    if (!port) return null;
    const portEvents = events.filter((e) => e.ports.includes(port.id));
    const worst = [...portEvents].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
    const near = vessels.filter((v) => distanceNm(port.position, [v.lon, v.lat]) < 15);
    const slug = PORT_PORTWATCH[port.id];
    const pw = slug ? hz?.ports?.ports.find((p) => p.slug === slug) : undefined;
    const band = pw ? callsBand(pw.pctCalls) : null;
    const now = Date.now();
    const wait = portWait(port.id, hz?.congestion, hz?.areas);
    return (
      <Card kicker={`${port.country} · ${ZONE_BY_ID[port.zone].name}`} title={port.name} onClose={onClose} mark={worst ? <SeverityMark level={worst.severity} size={28} /> : undefined}>
        {pw && band && (
          <div className="pcard" data-band={pw.lowBase ? "small" : band}>
            <div className="pcard__big">
              <b className="mono">{Math.round(pw.pctCalls)}%</b>
              <span>of normal port calls{pw.lowBase ? ", from a small base" : ""}</span>
            </div>
            <div className="pcard__band">{pw.lowBase ? "Small base" : BAND_WORD[band]}</div>
            <dl className="pcard__facts">
              <div><dt>Calls a day</dt><dd className="mono">{pw.nowCalls.toFixed(1)} <small>was {pw.preCalls.toFixed(1)}</small></dd></div>
              <div><dt>Exports</dt><dd className="mono">{Math.round(pw.pctExport)}% <small>of normal</small></dd></div>
              <div><dt>Waiting now</dt><dd className="mono">{wait.live?.waiting ?? pw.liveWaiting}</dd></div>
            </dl>
            {pw.weekly.length > 1 && <WeekBars weeks={pw.weekly} reference={pw.preCalls * 7} height={56} />}
            {pw.note && <p className="pcard__note">{pw.note}</p>}
            <p className="pcard__src">IMF PortWatch, via hormuz.now · to {pw.latestDate}</p>
          </div>
        )}
        {(wait.terminals.length > 0 || wait.live) && <Congestion w={wait} now={now} />}
        <dl className="card__grid">
          <dt>Position</dt><dd className="mono">{dm(port.position[1], "lat")} {dm(port.position[0], "lon")}</dd>
          <dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{port.kind}</dd>
          <dt>Ships within 15 nm</dt><dd className="mono">{vessels.length ? near.length : "No ship feed here"}</dd>
          <dt>Reports, 7 days</dt><dd className="mono">{portEvents.length}</dd>
        </dl>
        {portEvents.length > 0 && (
          <div className="card__section">
            <h4>Latest reports</h4>
            <ul className="card__list">
              {portEvents.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <button onClick={() => onSelect({ kind: "event", id: e.id })}>
                    <span className="card__item-title">{e.title}</span>
                    <div className="card__meta">{SEVERITY_META[e.severity].label} · {ago(e.lastSeen)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {near.length > 0 && (
          <div className="card__section">
            <h4>Ships nearby</h4>
            <ul className="card__list">
              {near.slice(0, 8).map((v) => (
                <li key={v.id}>
                  <button onClick={() => onSelect({ kind: "vessel", id: v.id })}>
                    <span className="card__item-title">{v.name}</span>
                    <div className="card__meta">{v.type || GROUP_WORD[v.group]} · {v.moving ? `${v.sog.toFixed(1)} kn` : "stopped"}{v.destination ? ` · to ${v.destination}` : ""}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  }

  const v = vessels.find((x) => x.id === selection.id);
  if (!v) return null;
  const d = detail?.vessel ?? null;
  const type = d?.type || v.type || GROUP_WORD[v.group];
  const flag = d?.flagName || flagName(v.flag);
  const dwt = d?.dwt || v.dwt;
  const length = d?.length || v.length;
  const kicker = [v.dark ? "Signal lost" : v.unifeeder ? "Unifeeder" : type, flag].filter(Boolean).join(" · ");
  return (
    <Card kicker={kicker} title={v.name} onClose={onClose}>
      {v.dark && (
        <p className="card__alert">
          Stopped sending its position {agoMin(v.ageMin).replace(" ago", "")} ago while at sea. The transponder may be switched off, or the ship is out of receiver range.
        </p>
      )}
      <div className="shipstats">
        <div><b className="mono">{v.moving ? v.sog.toFixed(1) : "0"}</b><span>{v.moving ? "knots" : "stopped"}</span></div>
        <div><b className="mono">{String(Math.round(v.course)).padStart(3, "0")}°</b><span>{v.moving ? "course" : "heading"}</span></div>
        <div><b className="mono">{length ? `${length}` : "–"}</b><span>metres long</span></div>
      </div>
      <dl className="card__grid">
        {d?.sizeClass && <><dt>Size class</dt><dd>{d.sizeClass}</dd></>}
        {dwt > 0 && <><dt>Deadweight</dt><dd className="mono">{tonnes(dwt)}</dd></>}
        <dt>Destination</dt><dd>{(d?.destination || v.destination) || "Not given"}</dd>
        <dt>Position</dt><dd className="mono">{dm(v.lat, "lat")} {dm(v.lon, "lon")}</dd>
        <dt>Last report</dt><dd className="mono">{agoMin(v.ageMin)}</dd>
        <dt>Source</dt><dd>{SOURCE_WORD[v.source]}</dd>
      </dl>
      {detail && detail.track.length > 1 && <p className="card__meta">The dashed line on the chart is its track over the last hours.</p>}
      {detail && detail.crossings.length > 0 && (
        <div className="card__section">
          <h4>Hormuz crossings</h4>
          <ul className="card__list">
            {detail.crossings.slice(0, 5).map((c) => (
              <li key={c.id}>
                <span className="card__item-title">{c.dir === "in" ? "Into the Gulf" : "Out to the Gulf of Oman"}</span>
                <div className="card__meta mono">{gstTime(c.t)} GST · {ago(new Date(c.t).toISOString())} · {c.speed.toFixed(1)} kn</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Card({ kicker, title, mark, onClose, children }: { kicker: string; title: string; mark?: React.ReactNode; onClose(): void; children: React.ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      <header className="card__head" data-sheet-head="" data-sheet-drag="">
        <div>
          <div className="card__kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>{mark}{kicker}</div>
          <h3 className="card__title">{title}</h3>
        </div>
        <button className="card__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}
