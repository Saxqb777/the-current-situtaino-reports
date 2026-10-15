"use client";

import { ago } from "@/lib/ui";
import { LEVEL_WORD, type PortWait, daysShort, daysWord, diffShort, hoursWord, indexLevel } from "@/lib/waits";
import Spark from "./viz/Spark";
import { WaitHistory } from "./viz/charts";
import { fmt } from "./viz/scale";

const HOUR = 3600_000;

/** How long ships queue at one port's container terminals now, against usual, with our own record and who waits off it. */
export default function Congestion({ w, now, compact, bare }: { w: PortWait | undefined; now: number; compact?: boolean; bare?: boolean }) {
  if (!w || (!w.terminals.length && !w.live)) {
    return (
      <section className="cong cong--none">
        <h4 className="cong__title">Waiting times</h4>
        <p className="muted">No wait figures for this port yet.</p>
      </section>
    );
  }
  const diff = w.days !== null && w.typical !== null ? w.days - w.typical : null;
  const lines = [...new Set(w.terminals.flatMap((t) => t.carriers))];
  return (
    <section className="cong" data-level={w.level ?? "none"}>
      <h4 className="cong__title">Container terminals{w.at ? ` · read ${ago(w.at, now)}` : ""}</h4>
      {w.terminals.length > 0 && (
        <>
          {!bare && <div className="cong__head">
            <b className="cong__days mono">{daysWord(w.days)}</b>
            <span className="cong__words">
              {w.level && <span className="cong__level">{LEVEL_WORD[w.level]}</span>}
              {w.waiting > 0 ? `average wait of the ${w.waiting} ${w.waiting === 1 ? "ship" : "ships"} queuing for a berth` : "no ships queuing for a berth now"}
            </span>
          </div>}
          <div className="cong__facts">
            <div><span>Usual here</span><b className="mono">{daysWord(w.typical)}</b></div>
            <div><span>Vs usual</span><b className="mono" data-up={w.longer}>{diffShort(diff)}</b></div>
            <div><span>Congestion index</span><b className="mono" data-level={w.level ?? "none"}>{w.index === null ? "–" : `${fmt(w.index, 1)} / 10`}</b></div>
            <div><span>Queuing · alongside</span><b className="mono">{w.waiting} · {w.alongside ?? "–"}</b></div>
          </div>
          {!compact && w.history.length > 1 && (
            <WaitHistory
              typical={w.typical}
              word={daysWord}
              points={w.history.map(([h, index, waiting, wh]) => ({ t: h * HOUR, index, waiting, days: wh === null ? null : wh / 24 }))}
            />
          )}
          {!compact && w.terminals.length > 1 && (
            <ul className="cong__terms" aria-label="Each terminal">
              <li className="cong__terms-head" aria-hidden="true"><span>Terminal</span><span>Index</span><span>Queuing</span><span>Wait</span></li>
              {w.terminals.map((t) => (
                <li key={t.id}>
                  <span>{t.name}</span>
                  <b className="mono" data-level={indexLevel(t.index) ?? "none"}>{t.index === null ? "–" : fmt(t.index, 1)}</b>
                  <span className="mono">{t.waiting ?? "–"}</span>
                  <span className="mono">{t.waiting && t.waitHours !== null ? daysShort(t.waitHours / 24) : "–"}</span>
                </li>
              ))}
            </ul>
          )}
          {!compact && lines.length > 0 && (
            <p className="cong__lines"><b>Lines calling</b> {lines.slice(0, 8).join(", ")}{lines.length > 8 ? ` and ${lines.length - 8} more` : ""}</p>
          )}
        </>
      )}
      {w.live && (
        <div className="cong__live">
          <p>
            <i className="kicker__live" data-on="true" aria-hidden="true" />
            <b>{fmt(w.live.waiting)} ships</b> of every kind waiting off {w.live.areaName} now
            {w.live.medianHours !== null && <>, typically for <b>{hoursWord(w.live.medianHours)}</b></>}.
            {w.live.over24h !== null && <> {fmt(w.live.over24h)} over a day{w.live.over7d ? `, ${fmt(w.live.over7d)} over a week` : ""}.</>}
          </p>
          {w.live.trend.length > 2 && <Spark values={w.live.trend} height={30} tone="ink" label={`Ships waiting off ${w.live.areaName}, day by day`} />}
        </div>
      )}
      <p className="cong__src">
        {w.terminals.length > 0 && "Container terminals: Kpler, read every hour."}
        {w.terminals.length > 0 && w.live && " "}
        {w.live && "Waiting off the port: hormuz.now (CC BY 4.0)."}
      </p>
    </section>
  );
}
