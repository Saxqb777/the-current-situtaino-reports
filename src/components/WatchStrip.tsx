"use client";

import { ZONE_BY_ID } from "@/lib/geo";
import type { ZoneId, ZoneSummary } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER } from "@/lib/ui";
import SeverityMark from "./SeverityMark";

interface Props {
  zones: ZoneSummary[];
  active: ZoneId | null;
  aisLive: boolean;
  onZone(zone: ZoneId | null): void;
}

export default function WatchStrip({ zones, active, aisLive, onZone }: Props) {
  const byId = Object.fromEntries(zones.map((z) => [z.zone, z]));
  return (
    <nav className="strip" aria-label="Watch zones" data-tour="zones">
      {ZONE_ORDER.map((id) => {
        const z: ZoneSummary = byId[id] ?? { zone: id, level: "low", events24h: 0, vessels: 0, dark: 0, transits24h: null, headline: null };
        const meta = SEVERITY_META[z.level];
        return (
          <button
            key={id}
            className="watch"
            data-tour={`zone-${id}`}
            aria-pressed={active === id}
            onClick={() => onZone(active === id ? null : id)}
            title={z.headline ?? "No reports in the last 24 hours"}
          >
            <span className="watch__mark"><SeverityMark level={z.level} size={26} /></span>
            <span className="watch__name">{ZONE_BY_ID[id].name}</span>
            <span className="watch__level" style={{ color: meta.color }}>{meta.word}</span>
            <span className="watch__stats">
              <span><b className="mono">{z.events24h}</b>reports 24h</span>
              {z.transits24h !== null
                ? <span><b className="mono">{z.transits24h}</b>transits 24h</span>
                : <span><b className="mono">{aisLive ? z.vessels : "–"}</b>ships now</span>}
              <span><b className="mono" style={z.dark ? { color: "var(--magenta)" } : undefined}>{aisLive ? z.dark : "–"}</b>gone dark</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
