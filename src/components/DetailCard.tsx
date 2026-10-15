"use client";

import { PORT_BY_ID, ZONE_BY_ID, distanceNm } from "@/lib/geo";
import type { Selection, VesselLite } from "@/lib/client";
import type { WatchEvent } from "@/lib/types";
import { SEVERITY_META, ago, dm, shipGroup, utcTime } from "@/lib/ui";
import { severityRank } from "@/lib/classify";
import SeverityMark from "./SeverityMark";

interface Props {
  selection: Selection;
  events: WatchEvent[];
  vessels: VesselLite[];
  aisConfigured: boolean;
  onSelect(sel: Selection): void;
  onClose(): void;
}

const TYPE_NAME = { tanker: "Tanker", cargo: "Cargo / container", other: "Other" };

export default function DetailCard({ selection, events, vessels, aisConfigured, onSelect, onClose }: Props) {
  if (!selection) return null;

  if (selection.kind === "event") {
    const e = events.find((x) => x.id === selection.id);
    if (!e) return null;
    const meta = SEVERITY_META[e.severity];
    return (
      <Card kicker={`${meta.label} · ${e.zones.map((z) => ZONE_BY_ID[z].name).join(" / ")}`} title={e.title} onClose={onClose} mark={<SeverityMark level={e.severity} size={28} />}>
        {e.summary && <p style={{ marginTop: 0 }}>{e.summary}</p>}
        <dl className="card__grid">
          <dt>First report</dt><dd className="mono">{utcTime(e.firstSeen)} UTC · {ago(e.firstSeen)}</dd>
          <dt>Latest</dt><dd className="mono">{utcTime(e.lastSeen)} UTC · {ago(e.lastSeen)}</dd>
          {e.official && <><dt>Official</dt><dd>{e.citesOfficial.join(", ")}</dd></>}
          {e.ports.length > 0 && <><dt>Ports</dt><dd>{e.ports.map((id) => PORT_BY_ID[id].name).join(", ")}</dd></>}
        </dl>
        <div className="card__section">
          <h4>{e.sources.length} {e.sources.length === 1 ? "source" : "sources"}</h4>
          <ul className="card__list">
            {e.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="card__item-title">{s.publisher || s.name}</a>
                <div className="card__meta">{s.title} · {utcTime(s.publishedAt)} UTC</div>
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
    return (
      <Card kicker={`${port.country} · ${ZONE_BY_ID[port.zone].name}`} title={port.name} onClose={onClose} mark={worst ? <SeverityMark level={worst.severity} size={28} /> : undefined}>
        <dl className="card__grid">
          <dt>Position</dt><dd className="mono">{dm(port.position[1], "lat")} {dm(port.position[0], "lon")}</dd>
          <dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{port.kind}</dd>
          <dt>Ships within 15 nm</dt><dd className="mono">{aisConfigured ? near.length : "Ship feed not connected"}</dd>
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
                <li key={v.mmsi}>
                  <button onClick={() => onSelect({ kind: "vessel", id: v.mmsi })}>
                    <span className="card__item-title">{v.name}</span>
                    <div className="card__meta">{TYPE_NAME[shipGroup(v.type)]} · {v.sog.toFixed(1)} kn{v.destination ? ` · to ${v.destination}` : ""}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  }

  const v = vessels.find((x) => x.mmsi === selection.id);
  if (!v) return null;
  return (
    <Card kicker={v.dark ? "Signal lost" : v.unifeeder ? "Unifeeder" : TYPE_NAME[shipGroup(v.type)]} title={v.name} onClose={onClose}>
      {v.dark && (
        <p style={{ marginTop: 0, color: "var(--magenta)" }}>
          No position for {ago(v.lastSeen).replace(" ago", "")} while at sea. The transponder may be switched off, or the ship is out of receiver range.
        </p>
      )}
      <dl className="card__grid">
        <dt>MMSI</dt><dd className="mono">{v.mmsi}</dd>
        <dt>Position</dt><dd className="mono">{dm(v.lat, "lat")} {dm(v.lon, "lon")}</dd>
        <dt>Course / speed</dt><dd className="mono">{String(Math.round(v.course)).padStart(3, "0")}° · {v.sog.toFixed(1)} kn</dd>
        <dt>Destination</dt><dd>{v.destination || "Not given"}</dd>
        <dt>Last report</dt><dd className="mono">{utcTime(v.lastSeen)} UTC · {ago(v.lastSeen)}</dd>
      </dl>
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
