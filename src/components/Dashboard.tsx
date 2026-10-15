"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PORTS, PORT_BY_ID, zoneAt } from "@/lib/geo";
import type { Layers, Selection } from "@/lib/client";
import { useHormuz, useLiveData, useMedia, usePref, useShipDetail } from "@/lib/hooks";
import type { ZoneId } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import type { ChartHandle } from "./ChartMap";
import DesktopApp from "./DesktopApp";
import type { LogFilters } from "./Log";
import type { Model, View, ZoneShips } from "./model";
import PhoneApp from "./phone/PhoneApp";

/** Phones, plus small landscape screens where the desktop grid has no room. */
const PHONE_QUERY = "(max-width: 760px), (max-height: 500px) and (pointer: coarse)";
const TOUR_KEY = "slw-tour-done";

export default function Dashboard() {
  const phone = useMedia(PHONE_QUERY);
  const { snap, vessels, feeds, live, fresh, flash, dismissFlash } = useLiveData();
  const { data: hz, failed: hzFailed } = useHormuz();
  const [now, setNow] = useState(0);
  const [view, setViewState] = useState<View>("now");

  const [filters, setFiltersState] = useState<LogFilters>({ zone: null, minSeverity: "low", officialOnly: false, query: "" });
  const [asOf, setAsOf] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [layers, setLayers] = useState<Layers>({
    ships: true, anchored: true, density: true, unifeeder: true, dark: true, ports: true, events: true, areas: true, hormuz: true, route: true,
  });
  const [theme, setTheme] = usePref("slw-theme", "theme", "day");
  const [textSize, setTextSize] = usePref("slw-text", "text", "normal");
  const [tourOn, setTourOn] = useState(false);
  const chart = useRef<ChartHandle>(null);
  const shipDetail = useShipDetail(selection?.kind === "vessel" ? selection.id : null);

  // Our level for each sea lane, which colours the route on the chart.
  const levels = useMemo(() => Object.fromEntries(snap.zones.map((z) => [z.zone, z.level])), [snap.zones]);
  // Which zone each ship is in, worked out once per ship list.
  const zoneShips = useMemo(() => {
    // Only the Gulf and Hormuz have a ship feed; elsewhere a count of 0 would mislead.
    const out: ZoneShips = { gulf: { ships: 0, silent: 0 }, hormuz: { ships: 0, silent: 0 }, redsea: null, aden: null, somalia: null };
    for (const v of vessels) {
      const z = zoneAt([v.lon, v.lat]);
      const slot = z ? out[z] : null;
      if (!slot) continue;
      slot.ships++;
      if (v.dark) slot.silent++;
    }
    return out;
  }, [vessels]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // First visit: start the tour once the layout is known. ?tour=1 forces it, ?tour=0 suppresses it.
  useEffect(() => {
    if (phone === null) return;
    const q = new URLSearchParams(window.location.search).get("tour");
    if (q === "0") return;
    let seen = true;
    try { seen = localStorage.getItem(TOUR_KEY) === "1"; } catch { /* storage blocked: skip the tour */ }
    if (q !== "1" && seen) return;
    const t = setTimeout(() => setTourOn(true), 1400);
    return () => clearTimeout(t);
  }, [phone]);

  // What the chart and Log show: the time scrubber first, then the filters.
  const timeEvents = useMemo(
    () => (asOf ? snap.events.filter((e) => Date.parse(e.firstSeen) <= asOf) : snap.events),
    [snap.events, asOf],
  );
  const shown = useMemo(() => {
    const min = SEVERITIES.indexOf(filters.minSeverity);
    const q = filters.query.trim().toLowerCase();
    return timeEvents.filter((e) =>
      (!filters.zone || e.zones.includes(filters.zone)) &&
      SEVERITIES.indexOf(e.severity) >= min &&
      (!filters.officialOnly || e.official) &&
      (!q || `${e.title} ${e.summary} ${e.sources.map((s) => s.publisher ?? s.name).join(" ")} ${e.ports.map((p) => PORT_BY_ID[p].name).join(" ")}`.toLowerCase().includes(q)),
    );
  }, [timeEvents, filters]);

  const select = useCallback((sel: Selection, inset?: number) => {
    setSelection(sel);
    if (sel?.kind === "event") {
      const e = snap.events.find((x) => x.id === sel.id);
      if (e) chart.current?.flyTo(e.position, e.ports.length ? 7.5 : 6, inset);
    } else if (sel?.kind === "port") {
      chart.current?.flyTo(PORT_BY_ID[sel.id].position, 8.5, inset);
    } else if (sel?.kind === "vessel") {
      const v = vessels.find((x) => x.id === sel.id);
      if (v) chart.current?.flyTo([v.lon, v.lat], 8, inset);
    }
  }, [snap.events, vessels]);

  const setView = useCallback((v: View) => {
    setViewState(v);
    // A page covers the whole screen; scroll it back to its top when it is opened again.
    requestAnimationFrame(() => document.querySelector(`[data-page="${v}"]`)?.scrollTo({ top: 0 }));
  }, []);

  const focusZone = useCallback((zone: ZoneId | null, inset?: number) => {
    setFiltersState((f) => ({ ...f, zone }));
    chart.current?.flyToZone(zone, inset);
  }, []);

  const filtersNow = useRef(filters);
  filtersNow.current = filters;
  const setFilters = useCallback((f: LogFilters) => {
    if (f.zone !== filtersNow.current.zone) chart.current?.flyToZone(f.zone);
    setFiltersState(f);
  }, []);

  const togglePick = useCallback((id: string) => {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const endTour = useCallback(() => {
    setTourOn(false);
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* storage blocked */ }
    // The tour picked Hormuz to show how zones work; put the view back.
    if (filtersNow.current.zone === "hormuz") focusZone(null);
  }, [focusZone]);

  const model: Model = {
    snap,
    vessels,
    feeds,
    hz,
    hzFailed,
    zoneShips,
    levels,
    shipDetail,
    view,
    setView,
    live,
    fresh,
    flash,
    dismissFlash,
    now,
    aisLive: vessels.length > 0,
    filters,
    setFilters,
    focusZone,
    asOf,
    setAsOf,
    timeEvents,
    shown,
    selection,
    select,
    hover,
    setHover,
    picked,
    pickedEvents: snap.events.filter((e) => picked.has(e.id)),
    togglePick,
    pickAllShown: () => setPicked((p) => new Set([...p, ...shown.map((e) => e.id)])),
    clearPicks: () => setPicked(new Set()),
    layers,
    setLayers,
    counts: {
      ships: vessels.filter((v) => !v.dark && v.moving).length,
      anchored: vessels.filter((v) => !v.dark && !v.moving).length,
      unifeeder: vessels.filter((v) => v.unifeeder).length,
      dark: vessels.filter((v) => v.dark).length,
      ports: PORTS.length,
      events: shown.length,
    },
    theme,
    setTheme,
    textSize,
    setTextSize,
    chart,
    tour: { on: tourOn, start: () => setTourOn(true), end: endTour },
  };

  // Until the screen size is known, show only the paper so phones never flash the desktop grid.
  if (phone === null) return <div className="boot" aria-busy="true" />;
  return phone ? <PhoneApp m={model} /> : <DesktopApp m={model} />;
}
