"use client";

import { useMemo, useState } from "react";
import { PORTS, PORT_BY_ID, ZONE_BY_ID } from "@/lib/geo";
import { PORTWATCH_PORT, callsBand } from "@/lib/portwatch";
import { SEVERITIES, type Severity, type ZoneId, type ZoneSummary } from "@/lib/types";
import { SEVERITY_META, ZONE_ORDER, ago, agoMin, sourceLine, utcDate, utcTime } from "@/lib/ui";
import { type Seen, bottomLine, verdict, worstLevel } from "@/lib/verdict";
import { LEVEL_WORD, allWaits, daysShort } from "@/lib/waits";
import type { Go, Model } from "../model";
import Newsroom from "../Newsroom";
import RouteIn from "../RouteIn";
import SinceLast from "../SinceLast";
import CountUp from "../viz/CountUp";
import { blankZone } from "../WatchStrip";
import { Credit, Delta, Kpi, Section } from "./parts";

const DAY = 24 * 3600_000;

/** The hero's hazard tape and the first figure take the colour of the worst lane. */
const TONE: Record<Severity, "ok" | "warn" | "danger" | "closed"> = { low: "ok", elevated: "warn", high: "danger", critical: "closed" };
const TONE_KPI = TONE;

/** The front page: our verdict, the way in stop by stop, then the ports and the news. */
export default function NowPage({ m, go }: { m: Model; go: Go }) {
  const s = m.hz?.status ?? null;
  const st = s?.status;
  const pw = m.hz?.ports?.ports ?? [];
  const traffic = m.hz?.traffic ?? null;
  const now = m.now || Date.now();
  const events24 = m.snap.events.filter((e) => now - Date.parse(e.lastSeen) < DAY);
  const hot24 = events24.filter((e) => e.severity === "high" || e.severity === "critical");
  const zoneById = Object.fromEntries(ZONE_ORDER.map((id) => [id, m.snap.zones.find((z) => z.zone === id) ?? blankZone(id)])) as Record<ZoneId, ZoneSummary>;
  const zones = Object.values(zoneById);
  const worst = worstLevel(zones);
  const atHigh = zones.filter((z) => z.level === "high" || z.level === "critical").length;
  const latest = [...m.snap.events]
    .sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .filter((e) => now - Date.parse(e.lastSeen) < 3 * DAY)
    .slice(0, 5);
  const waiting = s ? s.fleet.waitingGulf + s.fleet.waitingOman : null;
  const hardest = pw.filter((p) => !p.lowBase && PORTWATCH_PORT[p.slug]).sort((a, b) => a.pctCalls - b.pctCalls).slice(0, 6);
  const clock = new Date(now).toISOString();
  const [portsBy, setPortsBy] = useState<"waits" | "calls">("waits");

  const waits = useMemo(() => allWaits(PORTS.map((p) => p.id), m.hz?.congestion, m.hz?.areas, now), [m.hz?.congestion, m.hz?.areas, now]);
  const withDays = Object.values(waits).filter((w) => w.days !== null);
  const longest = [...withDays].sort((a, b) => (b.days ?? 0) - (a.days ?? 0)).slice(0, 6);
  const longer = withDays.filter((w) => w.level === "high" || w.level === "elevated").length;
  const showWaits = portsBy === "waits" && longest.length > 0;

  const headline = verdict(zones, st ? st.pct : null);
  const bottom = bottomLine({
    zones,
    strait: st ? { ais7: st.ais7, baseline: st.baseline, waiting } : null,
    waits: withDays.map((w) => ({ name: PORT_BY_ID[w.id]?.name ?? w.id, days: w.days!, longer: w.level === "high" || w.level === "elevated" })),
  });
  const seen = useMemo<Seen | null>(
    () => (m.now && m.snap.lastRefresh ? { t: m.now, levels: Object.fromEntries(zones.map((z) => [z.zone, z.level])), serious: hot24.map((e) => e.id) } : null),
    // Levels and serious ids are what matter; recompute when the snapshot does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.snap.generatedAt, Boolean(m.now)],
  );

  return (
    <div className="page page--now" data-page="now">
      <header className="hero hero--verdict" data-tone={TONE[worst]}>
        <p className="kicker mono">
          <i className="kicker__live" data-on={m.live} aria-hidden="true" />
          Situation report · {m.now ? `${utcDate(clock)} · ${utcTime(clock)} UTC` : "loading"}
        </p>
        <h1 className="verdict" data-tour="now-verdict">
          {headline.map((seg, i) => (seg.level ? <em key={i} data-level={seg.level}>{seg.text}</em> : <span key={i}>{seg.text}</span>))}
        </h1>
        {bottom.length > 0 && (
          <div className="bottom">
            <h2 className="bottom__title mono">Bottom line</h2>
            <ul className="bottom__list">
              {bottom.map((b) => (
                <li key={b.label} style={{ "--c": b.level ? SEVERITY_META[b.level].color : "var(--ink)" } as React.CSSProperties}>
                  <b>{b.label}</b> {b.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <SinceLast cur={seen} />
        <p className="hero__meta mono">
          {st ? <>Hormuz crisis day {st.dayCount}, since {utcDate(`${st.crisisStart}T00:00:00Z`)} {st.crisisStart.slice(0, 4)} · </> : null}
          {m.snap.sources.filter((x) => x.ok).length} of {m.snap.sources.length} sources answering
        </p>
        <div className="hero__acts">
          <button className="act act--primary" onClick={() => go.zone(null)}>Open the live chart</button>
          <button className="act" onClick={() => go.view("hormuz")}>Hormuz in depth</button>
        </div>
      </header>

      <div className="kpis" data-tour="now-kpis">
        <Kpi label="Lanes high or worse" value={<CountUp value={atHigh} />} tone={TONE_KPI[worst]} foot={`of five · worst ${SEVERITY_META[worst].word.toLowerCase()}`} />
        <Kpi label="Serious reports" value={<CountUp value={hot24.length} />} tone={hot24.length ? "warn" : "ok"} foot={`High or critical, 24 h · ${events24.length} in all`} />
        <Kpi
          label="Crossed Hormuz"
          value={<CountUp value={s?.last24h.total} />}
          tone={st ? (st.pct < 50 ? "danger" : st.pct < 85 ? "warn" : "ok") : undefined}
          foot={traffic ? <>Last 24 h · <Delta now={traffic.windows.last24h.total} before={traffic.windows.prev24h.total} word="on the day before" /></> : s ? `${s.last24h.in} in · ${s.last24h.out} out` : null}
        />
        {withDays.length > 0 ? (
          <Kpi label="Ports waiting longer" value={<CountUp value={longer} />} tone={longer ? "warn" : "ok"} foot={`of ${withDays.length} ports, last full week`} />
        ) : (
          <Kpi label="Waiting at anchor" value={<CountUp value={waiting} />} foot={s ? `${s.fleet.waitingGulf} Gulf side · ${s.fleet.waitingOman} Oman side` : null} />
        )}
      </div>

      <div className="now-grid">
        <Section n="01" title="The route in" sub="Suez to the Gulf ports, stop by stop, with our level for each. Tap a stop to see it on the chart." wide>
          <RouteIn m={m} go={go} zones={zoneById} waits={waits} />
        </Section>

        {(longest.length > 0 || hardest.length > 0) && (
          <Section n="02" title="Ports to watch" sub={showWaits ? "Typical wait at anchor last full week, against usual" : "Port calls now, as a share of before the crisis"}>
            {longest.length > 0 && hardest.length > 0 && (
              <div className="seg seg--page" role="tablist" aria-label="Rank ports by">
                <button role="tab" aria-selected={portsBy === "waits"} aria-pressed={portsBy === "waits"} onClick={() => setPortsBy("waits")}>Longest waits</button>
                <button role="tab" aria-selected={portsBy === "calls"} aria-pressed={portsBy === "calls"} onClick={() => setPortsBy("calls")}>Fewest calls</button>
              </div>
            )}
            <ol className="pulse">
              {showWaits
                ? longest.map((w) => (
                  <li key={w.id}>
                    <button className="pulse__row" onClick={() => go.select({ kind: "port", id: w.id })}>
                      <span className="pulse__name">{PORT_BY_ID[w.id]?.name}<small>{PORT_BY_ID[w.id]?.country} · {w.level ? LEVEL_WORD[w.level].toLowerCase() : ""}</small></span>
                      <span className="pulse__bar" data-level={w.level ?? "none"}>
                        <i style={{ width: `${Math.min(100, ((w.days ?? 0) / 7) * 100)}%` }} />
                        {w.typical !== null && <em aria-hidden="true" style={{ left: `${Math.min(100, (w.typical / 7) * 100)}%` }} />}
                      </span>
                      <b className="pulse__pct mono" data-level={w.level ?? "none"}>{daysShort(w.days)}</b>
                    </button>
                  </li>
                ))
                : hardest.map((p) => {
                  const id = PORTWATCH_PORT[p.slug];
                  const band = callsBand(p.pctCalls);
                  return (
                    <li key={p.slug}>
                      <button className="pulse__row" onClick={() => go.select({ kind: "port", id })}>
                        <span className="pulse__name">{PORT_BY_ID[id]?.name ?? p.name}<small>{p.countryName}</small></span>
                        <span className="pulse__bar" data-band={band}>
                          <i style={{ width: `${Math.min(100, p.pctCalls)}%` }} />
                          <em aria-hidden="true" />
                        </span>
                        <b className="pulse__pct mono" data-band={band}>{Math.round(p.pctCalls)}%</b>
                      </button>
                    </li>
                  );
                })}
            </ol>
            <button className="act act--line" onClick={() => go.view("ports")}>All ports and wait times →</button>
          </Section>
        )}

        <Section n={longest.length > 0 || hardest.length > 0 ? "03" : "02"} title="Latest reports" sub={hot24.length ? `${hot24.length} high or critical in 24 h` : "Newest first"}>
          {latest.length === 0 ? (
            <p className="muted">No reports in the last three days yet. Sources are read every few minutes.</p>
          ) : (
            <ol className="brief">
              {latest.map((e) => (
                <li key={e.id}>
                  <button className="brief__row" onClick={() => go.select({ kind: "event", id: e.id })} style={{ "--entry-sev": SEVERITY_META[e.severity].color } as React.CSSProperties}>
                    <span className="brief__sev">{SEVERITY_META[e.severity].label}</span>
                    <span className="brief__title">{e.title}</span>
                    <span className="brief__meta mono">{e.zones.map((z) => ZONE_BY_ID[z].short).join(" / ")} · {ago(e.lastSeen, now)} · {sourceLine(e)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button className="act act--line" onClick={() => go.log(null)}>Open the full Log →</button>
        </Section>

        <Section n={longest.length > 0 || hardest.length > 0 ? "04" : "03"} title="Live TV" sub="News channels, live" wide>
          <Newsroom deferred />
        </Section>
      </div>

      <Credit>
        <p>
          <b>Strait and port figures</b> hormuz.now (CC BY 4.0), with port calls from IMF PortWatch.
          {s && <> Feed {s.feed.health}, updated {agoMin(Math.max(0, (now - s.generatedAt) / 60_000))}.</>}
        </p>
        <p>
          <b>Ships</b> {m.feeds ? `${m.feeds.hormuz.ships.toLocaleString("en-GB")} around Hormuz from hormuz.now, ${m.feeds.westGulf.ships} in the west Gulf from VesselAPI.` : "Loading."} No free feed reaches the Red Sea, Gulf of Aden or Somali coast yet.
        </p>
        <p><b>Reports</b> {m.snap.sources.filter((x) => x.ok).length} of {m.snap.sources.length} news and official sources answering{m.snap.lastRefresh ? `, read ${ago(m.snap.lastRefresh, now)}` : ""}.</p>
      </Credit>
    </div>
  );
}
