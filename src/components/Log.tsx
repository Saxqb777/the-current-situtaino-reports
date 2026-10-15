"use client";

import { useEffect, useRef, useState } from "react";
import { ZONE_BY_ID } from "@/lib/geo";
import type { Severity, SourceHealth, WatchEvent, ZoneId } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER, ago, gstDate, gstTime } from "@/lib/ui";

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
  clearPicks(): void;
  selected: string | null;
  hover: string | null;
  fresh: Set<string>;
  live: boolean;
  sources: SourceHealth[];
  onSelect(id: string): void;
  onHover(id: string | null): void;
  /** "sheet" is the phone layout: the title bar drags the sheet and the zone filter lives in the zone rail. */
  variant?: "panel" | "sheet";
  /** Phone sheet pulled down: show the newest important report under the title. */
  peek?: boolean;
  /** Phone: opens the briefing builder from the Log's title bar. */
  onBriefing?(): void;
  /** What the Log shows for a ship picked in the search. */
  note?: string | null;
  onClearSearch?(): void;
}

export default function Log(p: Props) {
  const { events, filters, setFilters } = p;
  const sheet = p.variant === "sheet";
  const listRef = useRef<HTMLOListElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(!sheet);

  // Bring the selected entry into view when it was picked on the chart.
  useEffect(() => {
    if (!p.selected) return;
    listRef.current?.querySelector(`[data-id="${p.selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setOpen(p.selected);
  }, [p.selected]);

  const okSources = p.sources.filter((s) => s.ok).length;
  const checked = p.sources.some((s) => s.lastChecked);
  const status = !p.live
    ? "Reconnecting"
    : !checked
      ? "Reading sources"
      : okSources === 0
        ? "Sources unreachable"
        : `Live · ${okSources} of ${p.sources.length} sources`;
  const activeFilters = (filters.minSeverity !== "low" ? 1 : 0) + (filters.officialOnly ? 1 : 0) + (sheet && filters.zone ? 1 : 0);
  const latest = events.find((e) => e.severity === "critical" || e.severity === "high") ?? events[0];
  let lastDay = "";

  return (
    <aside className={sheet ? "log log--sheet" : "log"} aria-label="Situation log" data-tour="log">
      <div className="log__head" data-sheet-head="">
        <div className="log__titlebar" data-sheet-drag="">
          <h2 className="log__title">Log <span className="log__count mono">{events.length}</span></h2>
          <span className="log__live" data-state={p.live && okSources > 0 ? "on" : "off"}>
            <i aria-hidden="true" />
            {status}
          </span>
          {p.onBriefing && (
            <button className="log__brief" data-tour="briefing-btn" onClick={p.onBriefing} aria-label={`Briefing, ${p.picked.size} ticked`}>
              Briefing <span className="mono">{p.picked.size}</span>
            </button>
          )}
        </div>
        {sheet && p.peek && latest && (
          <button className="log__latest" data-sheet-drag="" onClick={() => p.onSelect(latest.id)} style={{ "--entry-sev": SEVERITY_META[latest.severity].color } as React.CSSProperties}>
            <span className="log__latest-sev">{SEVERITY_META[latest.severity].label}</span>
            <span className="log__latest-title">{latest.title}</span>
            <span className="log__latest-ago mono">{ago(latest.lastSeen)}</span>
          </button>
        )}
      </div>

      <div className="filters" data-tour="filters">
        <div className="filters__row">
          <input
            className="filters__search"
            type="search"
            enterKeyHint="search"
            placeholder="Search reports, ships, ports"
            aria-label="Search the reports"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          />
          {sheet && (
            <button className="tool filters__toggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
              Filters{activeFilters > 0 && <span className="tool__count">{activeFilters}</span>}
            </button>
          )}
          {!sheet && <button className="tool" onClick={p.pickAllShown} disabled={!events.length}>Select shown</button>}
          {!sheet && <button className="tool" onClick={p.clearPicks} disabled={!p.picked.size}>Clear all</button>}
        </div>
        {showFilters && (
          <>
            {!sheet && (
              <div className="seg" role="group" aria-label="Zone">
                <button aria-pressed={filters.zone === null} onClick={() => setFilters({ ...filters, zone: null })}>All</button>
                {ZONE_ORDER.map((z) => (
                  <button key={z} aria-pressed={filters.zone === z} onClick={() => setFilters({ ...filters, zone: filters.zone === z ? null : z })}>
                    {ZONE_BY_ID[z].short}
                  </button>
                ))}
              </div>
            )}
            <div className="filters__row">
              <div className="seg" role="group" aria-label="Lowest level shown">
                {SEVERITIES.map((s) => (
                  <button key={s} aria-pressed={filters.minSeverity === s} onClick={() => setFilters({ ...filters, minSeverity: s })}>
                    {s === "low" ? "All levels" : `${SEVERITY_META[s].label}+`}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={filters.officialOnly} onChange={(e) => setFilters({ ...filters, officialOnly: e.target.checked })} />
                Official only
              </label>
            </div>
            {sheet && (
              <div className="filters__row">
                {filters.zone && (
                  <button className="tool" onClick={() => setFilters({ ...filters, zone: null })}>
                    Zone: {ZONE_BY_ID[filters.zone].short} <span aria-hidden="true">×</span><span className="sr-only">Clear zone</span>
                  </button>
                )}
                <button className="tool" onClick={p.pickAllShown} disabled={!events.length}>Tick all shown</button>
                <button className="tool" onClick={p.clearPicks} disabled={!p.picked.size}>Clear ticks</button>
              </div>
            )}
          </>
        )}
      </div>

      {p.note && (
        <p className="log__note" role="status">
          <span>{p.note}</span>
          {p.onClearSearch && <button className="tool" onClick={p.onClearSearch}>Clear search</button>}
        </p>
      )}

      <ol className="log__list" ref={listRef}>
        {events.length === 0 && (
          <li className="empty">
            {p.total === 0 ? (
              <>
                <h3>{checked ? "No reports yet" : "Reading sources"}</h3>
                <p>{checked ? "The log fills as sources are read. Source status:" : "The first reports arrive within a minute."}</p>
                {checked && (
                  <ul className="health">
                    {p.sources.map((s) => (
                      <li key={s.id} data-ok={s.ok} title={s.error}>
                        <i aria-hidden="true" />{s.name}{!s.ok && s.lastChecked ? " · unreachable" : !s.lastChecked ? " · waiting" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h3>{p.note ? "No reports to show" : "Nothing matches these filters"}</h3>
                <p>{p.total} reports are hidden. Clear the {filters.query.trim() ? "search, " : ""}zone or level filter to see them.</p>
              </>
            )}
          </li>
        )}
        {events.map((e, i) => {
          const day = gstDate(e.lastSeen);
          const header = day !== lastDay ? ((lastDay = day), <li key={`d-${day}`} className="log__day">{day} · GST</li>) : null;
          const meta = SEVERITY_META[e.severity];
          const names = [...new Set(e.sources.map((s) => s.publisher || s.name))];
          const isPicked = p.picked.has(e.id);
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
                {gstTime(e.lastSeen)}
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
              <label className="entry__pick" title={isPicked ? "In the briefing" : "Add to the briefing"}>
                <input type="checkbox" checked={isPicked} onChange={() => p.togglePick(e.id)} aria-label={`Add "${e.title}" to the briefing`} />
                <span className="entry__box" aria-hidden="true" data-tour={i === 0 ? "pick" : undefined} />
              </label>
              {open === e.id && (
                <ul className="entry__links">
                  {e.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.publisher || s.name}</a>
                      <span className="card__meta"> · {gstTime(s.publishedAt)} GST{s.publisher ? ` · via ${s.name}` : ""}</span>
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
