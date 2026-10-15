"use client";

import { LEVEL_WORD, type PortWait, daysWord, hoursWord } from "@/lib/waits";
import Spark from "./viz/Spark";
import { WaitWeeks } from "./viz/charts";
import { fmt, shortDate } from "./viz/scale";

const WEEK_MS = 7 * 24 * 3600_000;

/** How long ships wait at one port: the newest week against usual, week by week, and who is waiting off it now. */
export default function Congestion({ w, now, compact, bare }: { w: PortWait | undefined; now: number; compact?: boolean; bare?: boolean }) {
  if (!w || (w.days === null && !w.live)) {
    return (
      <section className="cong cong--none">
        <h4 className="cong__title">Waiting times</h4>
        <p className="muted">No wait figures for this port yet.</p>
      </section>
    );
  }
  const what = w.measure === "port" ? "in port" : "at anchor";
  const diff = w.days !== null && w.typical !== null ? w.days - w.typical : null;
  const latestCalls = w.latest?.calls ?? null;
  return (
    <section className="cong" data-level={w.level ?? "none"}>
      <h4 className="cong__title">Waiting times{bare && w.latest ? `, week of ${shortDate(w.latest.start)}` : ""}</h4>
      {w.days !== null && (
        <>
          {!bare && <div className="cong__head">
            <b className="cong__days mono">{daysWord(w.days)}</b>
            <span className="cong__words">
              {w.level && <span className="cong__level">{LEVEL_WORD[w.level]}</span>}
              typical wait {what}
              <small>week of {shortDate(w.latest!.start)}</small>
            </span>
          </div>}
          <div className="cong__facts">
            <div><span>Usual here</span><b className="mono">{daysWord(w.typical)}</b></div>
            <div><span>Change</span><b className="mono" data-up={diff !== null && diff > 0}>{diff === null ? "–" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${daysWord(Math.abs(diff))}`}</b></div>
            {w.measure === "anchor" && <div><span>In port</span><b className="mono">{daysWord(w.latest?.portDays ?? null)}</b></div>}
            <div><span>Calls that week</span><b className="mono">{latestCalls ?? "–"}</b></div>
          </div>
          {!compact && (
            <WaitWeeks
              what={what}
              typical={w.typical}
              weeks={w.weeks.map((x) => ({
                start: x.start,
                days: w.measure === "port" ? x.portDays : x.anchorDays,
                calls: x.calls,
                partial: Date.parse(x.start) + WEEK_MS > now,
              }))}
            />
          )}
        </>
      )}
      {w.live && (
        <div className="cong__live">
          <p>
            <i className="kicker__live" data-on="true" aria-hidden="true" />
            <b>{fmt(w.live.waiting)} ships</b> waiting off {w.live.areaName} now
            {w.live.medianHours !== null && <>, typically for <b>{hoursWord(w.live.medianHours)}</b></>}.
            {w.live.over24h !== null && <> {fmt(w.live.over24h)} over a day{w.live.over7d ? `, ${fmt(w.live.over7d)} over a week` : ""}.</>}
          </p>
          {w.live.trend.length > 2 && <Spark values={w.live.trend} height={30} tone="ink" label={`Ships waiting off ${w.live.areaName}, day by day`} />}
        </div>
      )}
      <p className="cong__src">
        {w.days !== null && "Weekly medians, all ship types: MarineTraffic."}
        {w.days !== null && w.live && " "}
        {w.live && "Waiting now: hormuz.now (CC BY 4.0)."}
      </p>
    </section>
  );
}
