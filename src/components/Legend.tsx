"use client";

import type { Layers } from "@/lib/client";

interface Props {
  layers: Layers;
  setLayers(l: Layers): void;
  counts: { ships: number; unifeeder: number; dark: number; ports: number; events: number };
  aisConfigured: boolean;
}

const Ship = ({ color, hollow }: { color: string; hollow?: boolean }) => (
  <svg width="12" height="18" viewBox="0 0 12 22" aria-hidden="true">
    <path d="M6 1 L10.5 16 L9 21 L3 21 L1.5 16 Z" fill={hollow ? "none" : color} stroke={color} strokeWidth={hollow ? 1.4 : 0} strokeDasharray={hollow ? "2.2 1.6" : undefined} />
  </svg>
);

export default function Legend({ layers, setLayers, counts, aisConfigured }: Props) {
  const row = (key: keyof Layers, label: string, icon: React.ReactNode, count?: number | string) => (
    <button className="layer" aria-pressed={layers[key]} onClick={() => setLayers({ ...layers, [key]: !layers[key] })}>
      {icon}
      <span>{label}</span>
      <span className="layer__count">{count}</span>
    </button>
  );
  const ais = (n: number) => (aisConfigured ? n : "off");
  return (
    <div className="chart__legend">
      <h3>Chart layers</h3>
      {row("events", "Reports", <svg width="16" height="16" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="11" fill="none" stroke="var(--sev-high)" strokeWidth="2" strokeDasharray="3 2.4" /><circle cx="15" cy="15" r="6" fill="var(--sev-high)" /></svg>, counts.events)}
      {row("ships", "Ships", <Ship color="var(--ship-tanker)" />, ais(counts.ships))}
      {row("unifeeder", "Unifeeder fleet", <Ship color="var(--olive)" />, ais(counts.unifeeder))}
      {row("dark", "Signal lost", <Ship color="var(--magenta)" hollow />, ais(counts.dark))}
      {row("ports", "Ports", <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><g fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="4.6" r="1.6" /><path d="M10 6.2 V16 M6.6 8.6 H13.4 M4.6 12.2 Q5.4 16.2 10 16.4 Q14.6 16.2 15.4 12.2" /></g></svg>, counts.ports)}
      {row("areas", "Watch areas", <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="none" stroke="var(--magenta)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>)}
    </div>
  );
}
