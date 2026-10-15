"use client";

import { PORT_BY_ID, ZONE_BY_ID } from "@/lib/geo";
import { PORTWATCH_PORT } from "@/lib/portwatch";
import type { ZoneId, ZoneSummary } from "@/lib/types";
import { SEVERITY_META } from "@/lib/ui";
import { ROUTE } from "@/lib/verdict";
import { type PortWait, daysShort } from "@/lib/waits";
import type { Go, Model } from "./model";
import { AnchorIcon } from "./phone/icons";
import SeverityMark from "./SeverityMark";
import { fmt } from "./viz/scale";

/** Ports whose waits count as arriving in the Gulf. */
const GULF_ZONES = new Set<ZoneId>(["gulf", "hormuz"]);

/**
 * The way in from Suez to the Gulf ports, one stop per sea lane, each
 * coloured by our level for it with the one fact that matters there.
 * Down the page on a phone, across it on a wide screen.
 */
export default function RouteIn({ m, go, zones, waits }: { m: Model; go: Go; zones: Record<ZoneId, ZoneSummary>; waits: Record<string, PortWait> }) {
  const s = m.hz?.status ?? null;
  const pw = m.hz?.ports?.ports ?? [];
  const jebelAli = pw.find((p) => PORTWATCH_PORT[p.slug] === "jebel-ali");
  const waiting = s ? s.fleet.waitingGulf + s.fleet.waitingOman : null;

  const factFor = (id: ZoneId, z: ZoneSummary): string => {
    if (id === "hormuz" && s) return `${s.last24h.total} crossed in 24 h, ${Math.round(s.status.pct)}% of normal`;
    if (id === "gulf" && jebelAli) return `Jebel Ali port calls at ${Math.round(jebelAli.pctCalls)}% of normal`;
    return z.headline ?? "No serious reports in the last 24 hours";
  };
  const metaFor = (id: ZoneId, z: ZoneSummary): string => {
    const parts = [`${z.events24h} ${z.events24h === 1 ? "report" : "reports"} in 24 h`];
    if (id === "hormuz" && waiting !== null) parts.push(`${fmt(waiting)} waiting at anchor`);
    else {
      const ships = m.zoneShips[id];
      parts.push(ships ? `${fmt(ships.ships)} ships on the chart` : "no ship feed");
    }
    return parts.join(" · ");
  };

  const gulfWaits = Object.values(waits).filter((w) => w.terminals.length && w.days !== null && GULF_ZONES.has(PORT_BY_ID[w.id]?.zone));
  const longer = gulfWaits.filter((w) => w.longer);
  const longest = [...gulfWaits].sort((a, b) => (b.days ?? 0) - (a.days ?? 0))[0];
  const hardest = pw.filter((p) => !p.lowBase && PORTWATCH_PORT[p.slug]).sort((a, b) => a.pctCalls - b.pctCalls)[0];

  return (
    <ol className="route" aria-label="The route in, from Suez to the Gulf ports" data-tour="now-route">
      {ROUTE.map((id, i) => {
        const z = zones[id];
        const meta = SEVERITY_META[z.level];
        return (
          <li key={id} className="route__stop" style={{ "--leg": meta.color } as React.CSSProperties}>
            <button className="route__btn" onClick={() => go.zone(id)}>
              <span className="route__mark">
                <SeverityMark level={z.level} size={30} />
                <small className="mono">{String(i + 1).padStart(2, "0")}</small>
              </span>
              <span className="route__name">{ZONE_BY_ID[id].name}</span>
              <span className="route__level" style={{ color: meta.color }}>{meta.word}</span>
              <span className="route__fact">{factFor(id, z)}</span>
              <span className="route__meta mono">{metaFor(id, z)}</span>
            </button>
          </li>
        );
      })}
      <li className="route__stop route__stop--end">
        <button className="route__btn" onClick={() => go.view("ports")}>
          <span className="route__mark route__mark--port"><AnchorIcon /></span>
          <span className="route__name">Gulf ports</span>
          <span className="route__level">Arrival</span>
          <span className="route__fact">
            {longest
              ? `${longer.length} of ${gulfWaits.length} ports waiting longer than usual`
              : hardest
                ? `Calls at ${PORT_BY_ID[PORTWATCH_PORT[hardest.slug]]?.name ?? hardest.name} down to ${Math.round(hardest.pctCalls)}% of normal`
                : "Port figures loading"}
          </span>
          <span className="route__meta mono">
            {longest?.days ? `Longest: ${PORT_BY_ID[longest.id]?.name} ${daysShort(longest.days)}` : longest ? "No queues at the terminals" : `${pw.length || "–"} ports tracked`}
          </span>
        </button>
      </li>
    </ol>
  );
}
