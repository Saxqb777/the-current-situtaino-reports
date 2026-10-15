"use client";

import { useState } from "react";
import type { HzShip } from "@/lib/hormuz";
import { SEVERITIES, type Severity } from "@/lib/types";
import { SEVERITY_META, ago, agoMin, flagName, sourceLine, tonnes, utcDate, utcTime } from "@/lib/ui";
import type { Go, Model } from "../model";
import SeverityMark from "../SeverityMark";
import CountUp from "../viz/CountUp";
import { DailyBars, HourlyButterfly, MonthlyLine, Ruler, ShareBars } from "../viz/charts";
import { fmt } from "../viz/scale";
import { Credit, Delta, Kpi, Loading, Section, hoursWord, statusTone } from "./parts";

const DAY = 24 * 3600_000;
const TONE: Record<Severity, "ok" | "warn" | "danger" | "closed"> = { low: "ok", elevated: "warn", high: "danger", critical: "closed" };

const SIGNAL_NOTE: Record<string, string> = {
  nationality: "Ships broadcasting their crew or owner nationality, often to avoid being targeted.",
  "armed-guard": "Ships declaring armed guards on board.",
  scrap: "Ships whose destination says they are going for scrap.",
  orders: "Ships waiting for orders rather than heading to a port.",
  opl: "Ships waiting just outside port limits.",
};

/** The first full month of the crisis: a start late in a month counts from the next one. */
function crisisMonth(start: string): string {
  const [y, m, d] = start.split("-").map(Number);
  if (d < 15) return start.slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1));
  return next.toISOString().slice(0, 7);
}

/** The strait in depth: status, traffic since 2019, who is crossing and who is waiting. */
export default function HormuzPage({ m, go }: { m: Model; go: Go }) {
  const hz = m.hz;
  const s = hz?.status;
  const t = hz?.traffic;
  const a = hz?.areas;
  const [tab, setTab] = useState<"segments" | "flags" | "corridor">("segments");
  const now = m.now || Date.now();

  if (!s) return <div className="page page--hormuz" data-page="hormuz"><Loading failed={m.hzFailed} what="the Strait of Hormuz figures" /></div>;
  const st = s.status;
  const tone = statusTone(st.level);
  const showShip = (sh: HzShip) => {
    const id = `h${sh.id}`;
    if (m.vessels.some((v) => v.id === id)) go.select({ kind: "vessel", id });
    else go.zone("hormuz");
  };
  const zone = m.snap.zones.find((z) => z.zone === "hormuz");
  const level: Severity = zone?.level ?? "low";
  const serious = m.snap.events
    .filter((e) => e.zones.includes("hormuz") && (e.severity === "high" || e.severity === "critical") && now - Date.parse(e.lastSeen) < 3 * DAY)
    .sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  // "What our sources say" leads when there is something to say; the rest count on from it.
  const num = (i: number) => String(serious.length ? i : i - 1).padStart(2, "0");
  const months = (t?.monthly ?? []).map((x) => ({ month: x.month, value: x.portwatchDays ? x.portwatchAvg : x.oursAvg }));
  const waitingTotal = a?.waiting.total ?? s.fleet.waitingGulf + s.fleet.waitingOman;

  return (
    <div className="page page--hormuz" data-page="hormuz">
      <header className="hero hero--gate" data-tone={TONE[level]}>
        <p className="kicker mono">
          <SeverityMark level={level} size={16} />
          <span>Strait of Hormuz · our level <b style={{ color: SEVERITY_META[level].color }}>{SEVERITY_META[level].word}</b> · day {st.dayCount}</span>
        </p>
        <h1 className="gate__title">
          Traffic at <em data-tone={tone}><CountUp value={st.pct} digits={0} />%</em> of normal
        </h1>
        <p className="hero__deck">
          <b>{s.last24h.total} ships</b> crossed in the last 24 hours. This week averages <b>{fmt(st.ais7, 1)} a day</b>, against {fmt(st.baseline, 1)} a day before {utcDate(`${st.crisisStart}T00:00:00Z`)}. <b>{fmt(waitingTotal)} ships</b> are waiting at anchor, {fmt(s.fleet.waitingGulf)} on the Gulf side and {fmt(s.fleet.waitingOman)} on the Oman side.
        </p>
        <div className="gate__ruler"><Ruler value={st.ais7} normal={st.baseline} unit="crossings a day" tone={tone === "ok" ? "ok" : tone === "warn" ? "warn" : "danger"} /></div>
        <div className="hero__acts">
          <button className="act act--primary" onClick={() => go.zone("hormuz")}>See the strait on the chart</button>
          <button className="act" onClick={() => go.log("hormuz")}>Hormuz reports</button>
        </div>
      </header>

      <div className="kpis">
        <Kpi label="Crossed, last 24 h" value={<CountUp value={s.last24h.total} />} tone="danger" foot={t ? <Delta now={t.windows.last24h.total} before={t.windows.prev24h.total} /> : `${s.last24h.in} in · ${s.last24h.out} out`} />
        <Kpi label="Crossed, last 7 days" value={<CountUp value={s.last7d.total} />} foot={`${s.last7d.tankers} tankers · ${s.last7d.cargo} cargo`} />
        <Kpi label="Waiting at anchor" value={<CountUp value={waitingTotal} />} foot={`${s.fleet.waitingGulf} Gulf side · ${s.fleet.waitingOman} Oman side`} />
        <Kpi label="Our reports, 24 h" value={<CountUp value={zone?.events24h ?? 0} />} tone={TONE[level] === "ok" ? "ok" : "warn"} foot={`${serious.length} high or critical in 3 days`} />
      </div>

      {serious.length > 0 && (
        <section className="sect sect--said">
          <header className="sect__head">
            <span className="sect__n mono">01</span>
            <h2 className="sect__title">What our sources say</h2>
            <p className="sect__sub">The most serious reports on the strait, last three days</p>
          </header>
          <ol className="brief">
            {serious.slice(0, 3).map((e) => (
              <li key={e.id}>
                <button className="brief__row" onClick={() => go.select({ kind: "event", id: e.id })} style={{ "--entry-sev": SEVERITY_META[e.severity].color } as React.CSSProperties}>
                  <span className="brief__sev">{SEVERITY_META[e.severity].label}</span>
                  <span className="brief__title">{e.title}</span>
                  <span className="brief__meta mono">{ago(e.lastSeen, now)} · {sourceLine(e)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {s.lastCrossing && (
        <button className="lastx" onClick={() => go.select({ kind: "vessel", id: `h${s.lastCrossing!.vesselId}` })}>
          <span className="lastx__label">Last crossing</span>
          <span className="lastx__arrow" data-dir={s.lastCrossing.dir} aria-hidden="true">{s.lastCrossing.dir === "in" ? "↖" : "↘"}</span>
          <span className="lastx__name">{s.lastCrossing.name}</span>
          <span className="lastx__meta mono">{s.lastCrossing.segmentLabel || s.lastCrossing.type} · {s.lastCrossing.flagName} · {s.lastCrossing.dir === "in" ? "into the Gulf" : "out to sea"} · {ago(new Date(s.lastCrossing.t).toISOString(), now)}</span>
        </button>
      )}

      <div className="page__grid">
        {t && (
          <Section n={num(2)} title="Is it recovering?" sub="Crossings a day over the last 90 days, in and out, with the 7-day average" wide>
            <DailyBars days={t.daily} />
          </Section>
        )}

        {months.length > 1 && (
          <Section n={num(3)} title="How far from normal" sub="Average crossings a day, month by month since 2019. Drag across to read a month." wide>
            <MonthlyLine months={months} baseline={st.baseline} crisis={crisisMonth(st.crisisStart)} />
          </Section>
        )}

        {t && (
          <Section n={num(4)} title="Hour by hour" sub="The last 48 hours: into the Gulf above the line, out below">
            <HourlyButterfly hours={t.hourly} />
          </Section>
        )}

        {t && (
          <Section n={num(5)} title="Who still crosses" sub={`${t.windows.last7d.total} crossings in the last 7 days`}>
            <div className="seg seg--page" role="tablist" aria-label="Break down by">
              {(["segments", "flags", "corridor"] as const).map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                  {k === "segments" ? "Ship type" : k === "flags" ? "Flag" : "Side of strait"}
                </button>
              ))}
            </div>
            <ShareBars rows={tab === "segments" ? t.segments7d : tab === "flags" ? t.flags7d : t.corridor7d} max={7} tone={tab === "corridor" ? "ink" : "olive"} />
          </Section>
        )}

        {a && (
          <Section n={num(6)} title="Who is stuck, and for how long" sub={`${fmt(waitingTotal)} ships stopped near the strait`} wide>
            <div className="buckets" aria-hidden="true">
              {a.waiting.buckets.map((b, i) => (
                <span key={b.key} className="buckets__seg" data-i={i} style={{ flexGrow: Math.max(b.share, 0.012) }} />
              ))}
            </div>
            <ol className="buckets__key" aria-label="How long ships have been waiting">
              {a.waiting.buckets.map((b, i) => (
                <li key={b.key}><i data-i={i} aria-hidden="true" /><b className="mono">{b.count}</b><span>{b.label}</span></li>
              ))}
            </ol>
            <table className="ledger">
              <thead>
                <tr><th scope="col">Anchorage</th><th scope="col">Ships</th><th scope="col">Median wait</th><th scope="col">Over 7 days</th></tr>
              </thead>
              <tbody>
                {[...a.waiting.areas].sort((x, y) => y.count - x.count).map((w) => (
                  <tr key={w.id || w.name}>
                    <th scope="row">{w.name}<small>{w.side === "gulf" ? "Gulf side" : "Oman side"}</small></th>
                    <td className="mono"><span className="ledger__bar" style={{ "--wf": w.count / Math.max(...a.waiting.areas.map((x) => x.count)) } as React.CSSProperties} />{w.count}</td>
                    <td className="mono">{hoursWord(w.medianHours)}</td>
                    <td className="mono">{w.over7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="sect__minor">Longest waits</h3>
            <ol className="shiplist">
              {a.waiting.longest.slice(0, 6).map((sh) => (
                <li key={sh.id}>
                  <button onClick={() => showShip(sh)}>
                    <span className="shiplist__name">{sh.name}</span>
                    <span className="shiplist__meta">{sh.type} · {sh.flagName || flagName(sh.flag)} · {sh.areaName}</span>
                    <b className="shiplist__fig mono">{hoursWord(sh.hours ?? 0)}{sh.atLeast ? "+" : ""}</b>
                  </button>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {a && a.inStrait.length > 0 && (
          <Section n={num(7)} title="In the strait now" sub="Ships inside the narrows at this moment">
            <ol className="shiplist">
              {a.inStrait.map((sh) => (
                <li key={sh.id}>
                  <button onClick={() => showShip(sh)}>
                    <span className="shiplist__name">{sh.name}</span>
                    <span className="shiplist__meta">{sh.type} · {sh.flagName || flagName(sh.flag)}{sh.destination ? ` · to ${sh.destination}` : ""}</span>
                    <b className="shiplist__fig mono">{sh.speed.toFixed(1)} kn</b>
                  </button>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {a && (
          <Section n={num(8)} title="Warning signs" sub="What ships near the strait are broadcasting">
            <ul className="signals">
              {a.signals.map((sg) => (
                <li key={sg.signal}>
                  <b className="mono">{sg.count}</b>
                  <span><strong>{sg.label}</strong>{SIGNAL_NOTE[sg.signal] ?? ""}</span>
                </li>
              ))}
              <li data-tone="danger">
                <b className="mono">{a.aisSilent.length}</b>
                <span><strong>Signal lost</strong>Ships that stopped sending their position near the strait. Shown on the chart as dashed pink hulls.</span>
              </li>
            </ul>
            {a.aisSilent.length > 0 && (
              <ol className="shiplist shiplist--silent">
                {a.aisSilent.slice(0, 8).map((sh) => (
                  <li key={sh.id}>
                    <button onClick={() => showShip(sh)}>
                      <span className="shiplist__name">{sh.name}</span>
                      <span className="shiplist__meta">{sh.type} · {sh.flagName || flagName(sh.flag)}</span>
                      <b className="shiplist__fig mono">{agoMin(Math.max(0, (now - sh.posAt) / 60_000)).replace(" ago", "")}</b>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {hz && hz.crossings.length > 0 && (
          <Section n={num(9)} title="Latest crossings" sub="Commercial ships, last 48 hours" wide>
            <ol className="xings">
              {hz.crossings.slice(0, 14).map((c) => (
                <li key={c.id}>
                  <button onClick={() => go.select({ kind: "vessel", id: `h${c.vesselId}` })}>
                    <span className="xings__dir" data-dir={c.dir} aria-label={c.dir === "in" ? "Inbound" : "Outbound"}>{c.dir === "in" ? "IN" : "OUT"}</span>
                    <span className="xings__name">{c.name}</span>
                    <span className="xings__meta">{c.segmentLabel || c.type} · {c.flagName}{c.dwt ? ` · ${tonnes(c.dwt)}` : ""}</span>
                    <span className="xings__time mono">{utcTime(new Date(c.t).toISOString())}<small>{ago(new Date(c.t).toISOString(), now)}</small></span>
                  </button>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>

      <Credit>
        <p><b>Source</b> hormuz.now (CC BY 4.0). A crossing is a commercial ship seen on AIS passing the line between Musandam and Kuhestak. Before-crisis average: {s.baseline.label}.</p>
        <p>Ships that switch off their transponder are not counted, so real traffic may be a little higher.</p>
      </Credit>
    </div>
  );
}
