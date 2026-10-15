"use client";

import { useState } from "react";
import type { Layers, ShipFeeds } from "@/lib/client";
import { agoMin } from "@/lib/ui";

interface Props {
  layers: Layers;
  setLayers(l: Layers): void;
  counts: { ships: number; anchored: number; unifeeder: number; dark: number; ports: number; events: number };
  feeds: ShipFeeds | null;
  now: number;
  /** Over the laptop chart: a heading that folds the key away, folded to start on short screens. */
  foldable?: boolean;
}

const Ship = ({ color, hollow }: { color: string; hollow?: boolean }) => (
  <svg width="12" height="18" viewBox="0 0 12 22" aria-hidden="true">
    <path d="M6 1 L10.5 16 L9 21 L3 21 L1.5 16 Z" fill={hollow ? "none" : color} stroke={color} strokeWidth={hollow ? 1.4 : 0} strokeDasharray={hollow ? "2.2 1.6" : undefined} />
  </svg>
);

const minutesSince = (iso: string | null, now: number) => (iso && now ? Math.max(0, (now - Date.parse(iso)) / 60_000) : null);

export default function Legend({ layers, setLayers, counts, feeds, now, foldable }: Props) {
  const [open, setOpen] = useState(() => !foldable || typeof window === "undefined" || window.innerHeight >= 940);
  const row = (key: keyof Layers, label: string, icon: React.ReactNode, count?: number | string) => (
    <button className="layer" aria-pressed={layers[key]} onClick={() => setLayers({ ...layers, [key]: !layers[key] })}>
      {icon}
      <span>{label}</span>
      <span className="layer__count">{count}</span>
    </button>
  );
  const hzAge = minutesSince(feeds?.hormuz.at ?? null, now);
  const westAge = minutesSince(feeds?.westGulf.at ?? null, now);
  return (
    <div className="chart__legend" data-tour="layers" data-open={open}>
      {foldable ? (
        <h3><button className="legend__fold" aria-expanded={open} onClick={() => setOpen(!open)}>Chart layers<span aria-hidden="true">{open ? "−" : "+"}</span></button></h3>
      ) : (
        <h3 data-sheet-head="" data-sheet-drag="">Chart layers</h3>
      )}
      {open && <>
      <div className="legend__rows">
        {row("events", "Reports", <svg width="16" height="16" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="11" fill="none" stroke="var(--sev-high)" strokeWidth="2" strokeDasharray="3 2.4" /><circle cx="15" cy="15" r="6" fill="var(--sev-high)" /></svg>, counts.events)}
        {row("ships", "Ships under way", <Ship color="var(--ship-tanker)" />, counts.ships)}
        {row("anchored", "Stopped or at anchor", <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="6" r="2.2" fill="var(--ship-tanker)" /><circle cx="11" cy="5" r="2.2" fill="var(--ship-cargo)" /><circle cx="8" cy="11" r="2.2" fill="var(--ship-other)" /></svg>, counts.anchored)}
        {row("density", "Ship density, zoomed out", <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><defs><radialGradient id="lg-heat"><stop offset="0" stopColor="var(--ink)" /><stop offset="0.45" stopColor="var(--olive)" /><stop offset="1" stopColor="var(--olive)" stopOpacity="0" /></radialGradient></defs><circle cx="8" cy="8" r="8" fill="url(#lg-heat)" /></svg>)}
        {row("unifeeder", "Unifeeder fleet", <Ship color="var(--olive)" />, counts.unifeeder)}
        {row("dark", "Signal lost", <Ship color="var(--magenta)" hollow />, counts.dark)}
        {row("ports", "Ports, ringed by calls", <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="none" stroke="var(--sev-high)" strokeWidth="2" /><g fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round"><circle cx="10" cy="5.6" r="1.3" /><path d="M10 6.9 V14.4 M7.4 8.8 H12.6 M5.9 11.6 Q6.5 14.6 10 14.8 Q13.5 14.6 14.1 11.6" /></g></svg>, counts.ports)}
        {row("route", "The route in, by our level", <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3 L6 7" stroke="var(--sev-high)" strokeWidth="2.4" strokeLinecap="round" /><path d="M6 7 L10 9" stroke="var(--sev-critical)" strokeWidth="2.4" strokeLinecap="round" /><path d="M10 9 L14 13" stroke="var(--sev-elevated)" strokeWidth="2.4" strokeLinecap="round" /><circle cx="6" cy="7" r="1.8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2" /><circle cx="10" cy="9" r="1.8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2" /></svg>)}
        {row("hormuz", "Anchorages and counting line", <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="color-mix(in srgb, var(--olive) 14%, transparent)" stroke="var(--olive-ink)" strokeWidth="1.4" strokeDasharray="1 2" /></svg>)}
        {row("areas", "Watch areas", <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="none" stroke="var(--magenta)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>)}
      </div>
      <div className="legend__feeds">
        <p><b>Hormuz to Sohar</b> {feeds?.hormuz.ships ? `${feeds.hormuz.ships.toLocaleString("en-GB")} ships, live${hzAge !== null ? `, ${agoMin(hzAge)}` : ""}` : "loading"}</p>
        <p><b>West Gulf</b> {feeds?.westGulf.ships ? `${feeds.westGulf.ships} ships${westAge !== null ? `, ${agoMin(westAge)}` : ""}` : "first picture pending"}</p>
        <p><b>Red Sea, Aden, Somalia</b> no free ship feed reaches here yet</p>
      </div>
      </>}
    </div>
  );
}
