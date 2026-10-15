"use client";

import { ZONE_BY_ID } from "@/lib/geo";
import type { ZoneId, ZoneSummary } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER } from "@/lib/ui";
import type { ZoneShips } from "./model";
import SeverityMark from "./SeverityMark";

interface Props {
  zones: ZoneSummary[];
  active: ZoneId | null;
  zoneShips: ZoneShips;
  /** Ships counted through the strait in the last 24 hours, from hormuz.now. */
  hormuzCrossed: number | null;
  onZone(zone: ZoneId | null): void;
}

export const blankZone = (zone: ZoneId): ZoneSummary => ({ zone, level: "low", events24h: 0, vessels: 0, dark: 0, transits24h: null, headline: null });

export default function WatchStrip({ zones, active, zoneShips, hormuzCrossed, onZone }: Props) {
  const byId = Object.fromEntries(zones.map((z) => [z.zone, z]));
  return (
    <nav className="strip" aria-label="Watch zones" data-tour="zones">
      {ZONE_ORDER.map((id) => {
        const z: ZoneSummary = byId[id] ?? blankZone(id);
        const meta = SEVERITY_META[z.level];
        const ships = zoneShips[id];
        return (
          <button
            key={id}
            className="watch"
            data-tour={`zone-${id}`}
            aria-pressed={active === id}
            onClick={() => onZone(active === id ? null : id)}
            title={z.headline ?? "No reports in the last 24 hours"}
            style={{ "--zone-sev": meta.color } as React.CSSProperties}
          >
            <span className="watch__mark"><SeverityMark level={z.level} size={26} /></span>
            <span className="watch__name">{ZONE_BY_ID[id].name}</span>
            <span className="watch__level" style={{ color: meta.color }}>{meta.word}</span>
            <span className="watch__stats">
              <span><b className="mono">{z.events24h}</b>reports 24h</span>
              {id === "hormuz" && hormuzCrossed !== null && <span><b className="mono">{hormuzCrossed}</b>crossed 24h</span>}
              {ships
                ? <span><b className="mono">{ships.ships.toLocaleString("en-GB")}</b>ships now</span>
                : <span className="watch__nofeed">No ship feed</span>}
              {ships && ships.silent > 0 && <span><b className="mono" style={{ color: "var(--magenta)" }}>{ships.silent}</b>signal lost</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
