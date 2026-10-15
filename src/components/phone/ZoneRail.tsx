"use client";

import { ZONE_BY_ID } from "@/lib/geo";
import type { ZoneId, ZoneSummary } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER } from "@/lib/ui";
import SeverityMark from "../SeverityMark";

interface Props {
  zones: ZoneSummary[];
  active: ZoneId | null;
  aisLive: boolean;
  onZone(zone: ZoneId | null): void;
}

const blank = (zone: ZoneId): ZoneSummary => ({ zone, level: "low", events24h: 0, vessels: 0, dark: 0, transits24h: null, headline: null });

/** The watch strip for phones: an "All zones" card, then one swipeable card per zone. */
export default function ZoneRail({ zones, active, aisLive, onZone }: Props) {
  const byId = Object.fromEntries(zones.map((z) => [z.zone, z])) as Record<ZoneId, ZoneSummary | undefined>;
  const all = ZONE_ORDER.map((id) => byId[id] ?? blank(id));
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
              {aisLive && <span><b className="mono">{z.vessels}</b> ships</span>}
              {aisLive && z.dark > 0 && <span className="rail__dark"><b className="mono">{z.dark}</b> dark</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
