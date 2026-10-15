"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { VesselLite } from "@/lib/client";
import { ZONE_BY_ID, zoneAt } from "@/lib/geo";
import { findOnChart } from "@/lib/search";
import { flagName } from "@/lib/ui";

interface Props {
  /** The shared search text; the Log filters its reports by it too. */
  query: string;
  vessels: VesselLite[];
  /** Reports whose text has the search in it. */
  reports: number;
  onQuery(q: string): void;
  onShip(v: VesselLite): void;
  onPort(id: string): void;
  /** Phone: opens the Log. On a laptop the Log is already beside the chart. */
  onReports?(): void;
  onClear(): void;
}

type Option = { kind: "ship"; v: VesselLite } | { kind: "port"; id: string } | { kind: "reports" };

const where = (v: VesselLite) => {
  const z = zoneAt([v.lon, v.lat]);
  return z ? ZONE_BY_ID[z].short : v.source === "westGulf" ? "West Gulf" : "";
};

/** One box over the chart: find a ship or port and the chart goes to it; the reports that name it fill the Log. */
export default function ShipSearch(p: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const q = p.query.trim();
  const hits = useMemo(() => findOnChart(q, p.vessels), [q, p.vessels]);
  const options: Option[] = [
    ...hits.ships.map((v) => ({ kind: "ship" as const, v })),
    ...hits.ports.map((x) => ({ kind: "port" as const, id: x.id })),
    { kind: "reports" },
  ];
  const showList = open && q.length >= 2;

  // A tap anywhere else closes the list; the typed search stays.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    setOpen(false);
    setActive(-1);
    if (o.kind === "ship") p.onShip(o.v);
    else if (o.kind === "port") p.onPort(o.id);
    else p.onReports?.();
    input.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Enter takes the highlighted row, else the best ship or port, else just shows the reports.
      choose(active >= 0 ? options[active] : options[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const optId = (i: number) => `${listId}-${i}`;
  let i = -1;
  const row = (o: Option, body: React.ReactNode) => {
    i++;
    const n = i;
    return (
      <li key={o.kind === "ship" ? o.v.id : o.kind === "port" ? o.id : "reports"} id={optId(n)} role="option" aria-selected={active === n}
        className="finder__opt" data-kind={o.kind} onPointerEnter={() => setActive(n)} onClick={() => choose(o)}>
        {body}
      </li>
    );
  };

  return (
    <div className="finder" ref={root} data-tour="search" data-open={showList}>
      <div className="finder__box">
        <svg className="finder__icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="5" />
          <path d="M11.3 11.3 16 16" />
        </svg>
        <input
          ref={input}
          className="finder__input"
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a ship, port or report"
          aria-label="Find a ship, port or report"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? optId(active) : undefined}
          value={p.query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { p.onQuery(e.target.value); setOpen(true); setActive(-1); }}
          onKeyDown={onKey}
        />
        {p.query && (
          <button className="finder__clear" aria-label="Clear the search" onClick={() => { p.onClear(); setOpen(false); setActive(-1); }}>×</button>
        )}
      </div>
      {showList && (
        <ul className="finder__list" id={listId} role="listbox" aria-label="Matches">
          <li className="finder__head" role="presentation">Ships on our feeds</li>
          {hits.ships.length === 0 && (
            <li className="finder__none" role="presentation">
              No ship by that name. We only see ships near Hormuz and in the west Gulf; the Red Sea, Gulf of Aden and Somali coast have no free ship feed.
            </li>
          )}
          {hits.ships.map((v) => row({ kind: "ship", v }, (
            <>
              <i className="finder__swatch" data-group={v.group} aria-hidden="true" />
              <span className="finder__name">{v.name}</span>
              <span className="finder__sub">
                {[v.type || v.category, flagName(v.flag), where(v)].filter(Boolean).join(" · ")}
                {v.dark && <b className="finder__tag finder__tag--dark">Signal lost</b>}
                {v.unifeeder && <b className="finder__tag">Unifeeder</b>}
              </span>
            </>
          )))}
          {hits.ports.length > 0 && <li className="finder__head" role="presentation">Ports</li>}
          {hits.ports.map((port) => row({ kind: "port", id: port.id }, (
            <>
              <i className="finder__swatch" data-group="port" aria-hidden="true" />
              <span className="finder__name">{port.name}</span>
              <span className="finder__sub">{port.country} · {ZONE_BY_ID[port.zone].short}</span>
            </>
          )))}
          {row({ kind: "reports" }, (
            <span className="finder__reports">
              {p.reports === 0 ? `No report mentions “${q}”` : `${p.reports} ${p.reports === 1 ? "report mentions" : "reports mention"} “${q}”`}
              {p.onReports && p.reports > 0 && <b>Open the Log</b>}
            </span>
          ))}
        </ul>
      )}
    </div>
  );
}
