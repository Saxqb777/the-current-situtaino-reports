"use client";

import { ZONE_BY_ID } from "@/lib/geo";
import type { ZoneId, ZoneSummary } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER } from "@/lib/ui";
import SeverityMark from "../SeverityMark";
import type { ZoneShips } from "../model";
import { blankZone } from "../WatchStrip";

interface Props {
  zones: ZoneSummary[];
  active: ZoneId | null;
  zoneShips: ZoneShips;
  hormuzCrossed: number | null;
  onZone(zone: ZoneId | null): void;
}

/** The watch strip for phones: an "All zones" card, then one swipeable card per zone. */
export default function ZoneRail({ zones, active, zoneShips, hormuzCrossed, onZone }: Props) {
  const byId = Object.fromEntries(zones.map((z) => [z.zone, z])) as Record<ZoneId, ZoneSummary | undefined>;
  const all = ZONE_ORDER.map((id) => byId[id] ?? blankZone(id));
  const worst = all.reduce((a, b) => (SEVERITIES.indexOf(b.level) > SEVERITIES.indexOf(a.level) ? b : a), all[0]);
  const reports = all.reduce((n, z) => n + z.events24h, 0);

  return (
    <nav className="rail" aria-label="Watch zones" data-tour="zones">
      <button className="rail__card rail__card--all" aria-pressed={active === null} onClick={() => onZone(null)}>
        <span className="rail__name">All zones</span>
        <span className="rail__level" style={{ color: SEVERITY_META[worst.level].color }}>Worst: {SEVERITY_META[worst.level].word}</span>
        <span className="rail__stats"><b className="mono">{reports}</b> reports 24 h</span>
      </button>
      {all.map((z) => {
        const meta = SEVERITY_META[z.level];
        const ships = zoneShips[z.zone];
        return (
          <button
            key={z.zone}
            className="rail__card"
            data-tour={`zone-${z.zone}`}
            aria-pressed={active === z.zone}
            title={ZONE_BY_ID[z.zone].name}
            style={{ "--zone-sev": meta.color } as React.CSSProperties}
            onClick={() => onZone(active === z.zone ? null : z.zone)}
          >
            <span className="rail__name">
              <SeverityMark level={z.level} size={16} />
              {ZONE_BY_ID[z.zone].name.length > 18 ? ZONE_BY_ID[z.zone].short : ZONE_BY_ID[z.zone].name}
            </span>
            <span className="rail__level" style={{ color: meta.color }}>{meta.word}</span>
            <span className="rail__stats">
              <span><b className="mono">{z.events24h}</b> reports</span>
              {z.zone === "hormuz" && hormuzCrossed !== null && <span><b className="mono">{hormuzCrossed}</b> crossed</span>}
              {ships && z.zone !== "hormuz" && <span><b className="mono">{ships.ships.toLocaleString("en-GB")}</b> ships</span>}
              {ships && ships.silent > 0 && <span className="rail__dark"><b className="mono">{ships.silent}</b> silent</span>}
              {!ships && <span className="rail__nofeed">no ship feed</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
