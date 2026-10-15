"use client";

import { useEffect, useRef, useState } from "react";
import { ZONE_BY_ID } from "@/lib/geo";
import type { Severity, SourceHealth, WatchEvent, ZoneId } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER, ago, utcDate, utcTime } from "@/lib/ui";

export interface LogFilters {
  zone: ZoneId | null;
  minSeverity: Severity;
  officialOnly: boolean;
  query: string;
}

interface Props {
  events: WatchEvent[];
  total: number;
  filters: LogFilters;
  setFilters(f: LogFilters): void;
  picked: Set<string>;
  togglePick(id: string): void;
  pickAllShown(): void;
  selected: string | null;
  hover: string | null;
  fresh: Set<string>;
  live: boolean;
  sources: SourceHealth[];
  onSelect(id: string): void;
  onHover(id: string | null): void;
}

export default function Log(p: Props) {
  const { events, filters, setFilters } = p;
  const listRef = useRef<HTMLOListElement>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Bring the selected entry into view when it was picked on the chart.
  useEffect(() => {
    if (!p.selected) return;
    listRef.current?.querySelector(`[data-id="${p.selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setOpen(p.selected);
  }, [p.selected]);

  const okSources = p.sources.filter((s) => s.ok).length;
  let lastDay = "";

  return (
    <aside className="log" aria-label="Situation log">
      <div className="log__head">
        <div className="log__titlebar">
          <h2 className="log__title">Log</h2>
          <span className="log__live" data-state={p.live && okSources > 0 ? "on" : "off"}>
            <i aria-hidden="true" />
            {!p.live ? "Reconnecting" : okSources === 0 && p.sources.some((s) => s.lastChecked) ? "Sources unreachable" : `Live · ${okSources} of ${p.sources.length} sources`}
          </span>
        </div>
        <div className="filters">
          <div className="seg" role="group" aria-label="Zone">
            <button aria-pressed={filters.zone === null} onClick={() => setFilters({ ...filters, zone: null })}>All</button>
            {ZONE_ORDER.map((z) => (
              <button key={z} aria-pressed={filters.zone === z} onClick={() => setFilters({ ...filters, zone: filters.zone === z ? null : z })}>
                {ZONE_BY_ID[z].short}
              </button>
            ))}
          </div>
          <div className="filters__row">
            <div className="seg" role="group" aria-label="Lowest severity shown">
              {SEVERITIES.map((s) => (
                <button key={s} aria-pressed={filters.minSeverity === s} onClick={() => setFilters({ ...filters, minSeverity: s })}>
                  {s === "low" ? "All levels" : `${SEVERITY_META[s].label}+`}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={filters.officialOnly} onChange={(e) => setFilters({ ...filters, officialOnly: e.target.checked })} />
              Official reports only
            </label>
          </div>
          <div className="filters__row">
            <input
              className="filters__search"
              type="search"
              placeholder="Search ships, ports, carriers"
              aria-label="Search the log"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
            <button className="tool" onClick={p.pickAllShown} disabled={!events.length}>Select shown</button>
          </div>
        </div>
      </div>

      <ol className="log__list" ref={listRef}>
        {events.length === 0 && (
          <li className="empty">
            {p.total === 0 ? (
              <>
                <h3>No reports yet</h3>
                <p>The log fills as sources are read. Source status:</p>
                <ul className="health">
                  {p.sources.map((s) => (
                    <li key={s.id} data-ok={s.ok} title={s.error}>
                      <i aria-hidden="true" />{s.name}{!s.ok && s.lastChecked ? " · unreachable" : !s.lastChecked ? " · waiting" : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h3>Nothing matches these filters</h3>
                <p>{p.total} reports are hidden. Clear the zone or level filter to see them.</p>
              </>
            )}
          </li>
        )}
        {events.map((e) => {
          const day = utcDate(e.lastSeen);
          const header = day !== lastDay ? ((lastDay = day), <li key={`d-${day}`} className="log__day">{day} · UTC</li>) : null;
          const meta = SEVERITY_META[e.severity];
          const names = [...new Set(e.sources.map((s) => s.publisher || s.name))];
          return [
            header,
            <li
              key={e.id}
              data-id={e.id}
              className="entry"
              style={{ "--entry-sev": meta.color } as React.CSSProperties}
              data-selected={p.selected === e.id}
              data-hot={p.hover === e.id}
              data-fresh={p.fresh.has(e.id)}
              onMouseEnter={() => p.onHover(e.id)}
              onMouseLeave={() => p.onHover(null)}
            >
              <div className="entry__time">
                {utcTime(e.lastSeen)}
                <small>{ago(e.lastSeen)}</small>
              </div>
              <button className="entry__main" onClick={() => { p.onSelect(e.id); setOpen(open === e.id ? null : e.id); }} aria-expanded={open === e.id}>
                <span className="entry__kicker">
                  <span className="entry__sev">{meta.label}</span>
                  <span>{e.zones.map((z) => ZONE_BY_ID[z].short).join(" · ")}</span>
                  {e.official && <span className="entry__official" title={`Attributed to ${e.citesOfficial.join(", ")}`}>Official</span>}
                </span>
                <p className="entry__title">{e.title}</p>
                {e.summary && <p className="entry__summary">{e.summary}</p>}
                <span className="entry__sources">
                  {names.length > 1 ? `${names.length} sources: ` : ""}{names.slice(0, 3).join(", ")}{names.length > 3 ? ` +${names.length - 3}` : ""}
                </span>
              </button>
              <div className="entry__pick">
                <input type="checkbox" checked={p.picked.has(e.id)} onChange={() => p.togglePick(e.id)} aria-label={`Add "${e.title}" to the briefing`} />
              </div>
              {open === e.id && (
                <ul className="entry__links" style={{ gridColumn: "2 / 4" }}>
                  {e.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.publisher || s.name}</a>
                      <span className="card__meta"> · {utcTime(s.publishedAt)} UTC{s.publisher ? ` · via ${s.name}` : ""}</span>
                    </li>
                  ))}
                  {e.tags.length > 0 && <li className="card__meta">Tags: {e.tags.join(", ")}</li>}
                </ul>
              )}
            </li>,
          ];
        })}
      </ol>
    </aside>
  );
}
