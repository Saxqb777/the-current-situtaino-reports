"use client";

import { useId } from "react";
import { fmt, lin, niceMax, shortDate, useScrub, useWidth } from "./scale";

/* Charts drawn in SVG at their real pixel width, so text stays crisp and
   nothing stretches. Each one can be scrubbed: hover, or drag a finger
   sideways, to read a single day, month or hour. */

const PAD = { l: 30, r: 8, t: 8, b: 22 };

function Grid({ w, y, ticks }: { w: number; y: (v: number) => number; ticks: number[] }) {
  return (
    <g className="viz__grid">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} />
          <text x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}

function Readout({ children }: { children: React.ReactNode }) {
  return <div className="viz__readout mono" aria-live="off">{children}</div>;
}

export interface DayPoint {
  date: string; in: number; out: number; total: number; avg7: number; partial?: boolean; portwatch: number; hasPortwatch: boolean;
}

/** Crossings a day, inbound and outbound stacked, with the 7-day average over the top. */
export function DailyBars({ days, height = 190 }: { days: DayPoint[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const hatch = useId();
  const n = days.length;
  const plotW = Math.max(1, w - PAD.l - PAD.r);
  const max = niceMax(Math.max(4, ...days.map((d) => Math.max(d.total, d.avg7, d.hasPortwatch ? d.portwatch : 0))));
  const y = lin(0, max, height - PAD.b, PAD.t);
  const step = plotW / Math.max(1, n);
  const bw = Math.max(1, step - (step > 4 ? 1.2 : 0.6));
  const x = (i: number) => PAD.l + i * step;
  const { index, handlers } = useScrub(n, PAD.l + step / 2, plotW - step);
  const lastFull = days[n - 1]?.partial ? n - 2 : n - 1;
  const d = days[index ?? lastFull];
  const avgPath = days.map((p, i) => `${i ? "L" : "M"}${(x(i) + step / 2).toFixed(1)},${y(p.avg7).toFixed(1)}`).join("");

  return (
    <figure className="viz">
      {d && (
        <Readout>
          <b>{shortDate(d.date)}</b>
          <span><i className="key key--in" />{d.in} in</span>
          <span><i className="key key--out" />{d.out} out</span>
          <span><i className="key key--avg" />7-day avg {fmt(d.avg7, 1)}</span>
          {d.partial && <em>so far today</em>}
        </Readout>
      )}
      <div ref={ref} className="viz__plot" {...handlers}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={`Strait crossings a day for the last ${n} days`}>
            <defs>
              <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="4" className="viz__hatch-bg" />
                <line x1="0" y1="0" x2="0" y2="4" className="viz__hatch" />
              </pattern>
            </defs>
            <Grid w={w} y={y} ticks={[0, max / 2, max]} />
            {days.map((p, i) => {
              const yIn = y(p.in);
              const yTop = y(p.in + p.out);
              const on = index === i;
              return (
                <g key={p.date} className={on ? "viz__col is-on" : "viz__col"}>
                  <rect x={x(i)} y={yIn} width={bw} height={y(0) - yIn} className="viz__in" fill={p.partial ? `url(#${hatch})` : undefined} />
                  <rect x={x(i)} y={yTop} width={bw} height={yIn - yTop} className="viz__out" fill={p.partial ? `url(#${hatch})` : undefined} />
                </g>
              );
            })}
            <path d={avgPath} className="viz__avg" />
            {days.map((p, i) => (p.date.endsWith("-01") ? (
              <g key={`m${p.date}`} className="viz__axis">
                <line x1={x(i)} x2={x(i)} y1={height - PAD.b} y2={height - PAD.b + 4} />
                <text x={x(i)} y={height - 6} textAnchor="start">{shortDate(p.date.slice(0, 7)).slice(0, 3)}</text>
              </g>
            ) : null))}
            {index !== null && <line className="viz__cursor" x1={x(index) + bw / 2} x2={x(index) + bw / 2} y1={PAD.t} y2={height - PAD.b} />}
          </svg>
        )}
      </div>
    </figure>
  );
}

export interface MonthPoint { month: string; value: number }

/** Crossings a day, month by month since 2019, with the crisis marked. */
export function MonthlyLine({ months, baseline, crisis, height = 200 }: { months: MonthPoint[]; baseline: number; crisis: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = months.length;
  const plotW = Math.max(1, w - PAD.l - PAD.r);
  // Headroom above the busiest month keeps the notes clear of the line.
  const max = niceMax(Math.max(baseline, ...months.map((m) => m.value)) * 1.35);
  const y = lin(0, max, height - PAD.b, PAD.t);
  const x = lin(0, Math.max(1, n - 1), PAD.l, PAD.l + plotW);
  const { index, handlers } = useScrub(n, PAD.l, plotW);
  const ci = months.findIndex((m) => m.month >= crisis);
  const pts = months.map((m, i) => `${x(i).toFixed(1)},${y(m.value).toFixed(1)}`);
  const m = months[index ?? n - 1];
  const before = ci > 0 ? months.slice(Math.max(0, ci - 12), ci) : [];
  const beforeAvg = before.length ? before.reduce((a, b) => a + b.value, 0) / before.length : baseline;

  return (
    <figure className="viz">
      {m && (
        <Readout>
          <b>{shortDate(m.month)}</b>
          <span>{fmt(m.value, 1)} a day</span>
          <span className="viz__muted">{fmt((m.value / baseline) * 100)}% of normal</span>
        </Readout>
      )}
      <div ref={ref} className="viz__plot" {...handlers}>
        {w > 0 && n > 1 && (
          <svg width={w} height={height} role="img" aria-label={`Average crossings a day each month since ${shortDate(months[0].month)}`}>
            <Grid w={w} y={y} ticks={[0, max / 2, max]} />
            {ci > 0 && <rect className="viz__crisis-band" x={x(ci) - (x(1) - x(0)) / 2} y={PAD.t} width={x(n - 1) - x(ci) + (x(1) - x(0)) / 2} height={height - PAD.b - PAD.t} />}
            <line className="viz__baseline" x1={PAD.l} x2={w - PAD.r} y1={y(baseline)} y2={y(baseline)} />
            <path className="viz__area" d={`M${x(0)},${y(0)} L${pts.join(" L")} L${x(n - 1)},${y(0)} Z`} />
            <path className="viz__line" d={`M${pts.join(" L")}`} />
            <text className="viz__note viz__halo" x={PAD.l + 4} y={PAD.t + 12}>{w < 560 ? `Dotted: ${fmt(baseline, 1)} a day before` : `Dotted line: before the crisis, ${fmt(baseline, 1)} a day`}</text>
            {ci > 0 && (
              <g className="viz__crisis">
                <line x1={x(ci)} x2={x(ci)} y1={PAD.t} y2={height - PAD.b} />
                <text className="viz__halo" x={x(ci) - 5} y={PAD.t + 12} textAnchor="end">Crisis</text>
                <text x={x(ci) - 5} y={PAD.t + 25} textAnchor="end" className="viz__note viz__halo">−{fmt(100 - (months[ci].value / beforeAvg) * 100)}% in a month</text>
              </g>
            )}
            {months.map((p, i) => (p.month.endsWith("-01") ? (
              <g key={p.month} className="viz__axis">
                <line x1={x(i)} x2={x(i)} y1={height - PAD.b} y2={height - PAD.b + 4} />
                <text x={x(i)} y={height - 6} textAnchor="start">{w < 420 ? `’${p.month.slice(2, 4)}` : p.month.slice(0, 4)}</text>
              </g>
            ) : null))}
            {index !== null && (
              <g>
                <line className="viz__cursor" x1={x(index)} x2={x(index)} y1={PAD.t} y2={height - PAD.b} />
                <circle className="viz__point" cx={x(index)} cy={y(months[index].value)} r={3.5} />
              </g>
            )}
            {index === null && <circle className="viz__point viz__point--now" cx={x(n - 1)} cy={y(months[n - 1].value)} r={3.5} />}
          </svg>
        )}
      </div>
    </figure>
  );
}

/** The last 48 hours: inbound above the line, outbound below. */
export function HourlyButterfly({ hours, height = 140 }: { hours: { t: number; in: number; out: number }[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = hours.length;
  const plotW = Math.max(1, w - PAD.l - PAD.r);
  const max = Math.max(2, ...hours.map((h) => Math.max(h.in, h.out)));
  const mid = PAD.t + (height - PAD.t - PAD.b) / 2;
  const half = (height - PAD.t - PAD.b) / 2 - 2;
  const step = plotW / Math.max(1, n);
  const bw = Math.max(1, step - 1.5);
  const x = (i: number) => PAD.l + i * step;
  const { index, handlers } = useScrub(n, PAD.l + step / 2, plotW - step);
  const h = hours[index ?? n - 1];
  const hh = (t: number) => `${String(new Date(t).getUTCHours()).padStart(2, "0")}:00`;
  const total = hours.reduce((a, b) => ({ in: a.in + b.in, out: a.out + b.out }), { in: 0, out: 0 });

  return (
    <figure className="viz">
      {h && (
        <Readout>
          {index === null ? <b>Last 48 h</b> : <b>{hh(h.t)} UTC</b>}
          <span><i className="key key--in" />{index === null ? total.in : h.in} in</span>
          <span><i className="key key--out" />{index === null ? total.out : h.out} out</span>
        </Readout>
      )}
      <div ref={ref} className="viz__plot" {...handlers}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label="Crossings each hour over the last 48 hours, inbound above and outbound below">
            <g className="viz__axis">
              <text x={PAD.l - 6} y={mid - half / 2} textAnchor="end" dy="0.32em">In</text>
              <text x={PAD.l - 6} y={mid + half / 2} textAnchor="end" dy="0.32em">Out</text>
            </g>
            {hours.map((p, i) => (
              <g key={p.t} className={index === i ? "viz__col is-on" : "viz__col"}>
                {p.in > 0 && <rect className="viz__in" x={x(i)} y={mid - (p.in / max) * half} width={bw} height={(p.in / max) * half} />}
                {p.out > 0 && <rect className="viz__out" x={x(i)} y={mid + 1} width={bw} height={(p.out / max) * half} />}
                {p.in === 0 && p.out === 0 && <rect className="viz__nil" x={x(i)} y={mid - 0.5} width={bw} height={1} />}
              </g>
            ))}
            <line className="viz__mid" x1={PAD.l} x2={w - PAD.r} y1={mid} y2={mid} />
            {hours.map((p, i) => (new Date(p.t).getUTCHours() % 12 === 0 ? (
              <g key={`t${p.t}`} className="viz__axis">
                <line x1={x(i)} x2={x(i)} y1={height - PAD.b} y2={height - PAD.b + 4} />
                <text x={x(i)} y={height - 6} textAnchor="middle">{hh(p.t)}</text>
              </g>
            ) : null))}
          </svg>
        )}
      </div>
    </figure>
  );
}

export interface Share { key: string; label: string; count: number; share: number }

/** Labelled horizontal bars for a breakdown, largest first. */
export function ShareBars({ rows, max = 6, tone = "olive" }: { rows: Share[]; max?: number; tone?: "olive" | "ink" | "danger" }) {
  const shown = rows.slice(0, max);
  const top = Math.max(...shown.map((r) => r.share), 0.0001);
  return (
    <ol className={`shares shares--${tone}`}>
      {shown.map((r) => (
        <li key={r.key || r.label}>
          <span className="shares__label">{r.label || "Not known"}</span>
          <span className="shares__bar"><i style={{ width: `${(r.share / top) * 100}%` }} /></span>
          <span className="shares__n mono">{r.count}</span>
          <span className="shares__pct mono">{fmt(r.share * 100)}%</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A chart-style scale ruler: how far today's figure gets toward normal.
 * The gap to normal is hatched, so the shortfall reads at a glance.
 */
export function Ruler({ value, normal, unit, tone = "danger" }: { value: number; normal: number; unit: string; tone?: "danger" | "warn" | "ok" }) {
  const top = niceMax(Math.max(value, normal) * 1.08);
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  const ticks = Array.from({ length: 11 }, (_, i) => (top / 10) * i);
  return (
    <div className={`ruler ruler--${tone}`} role="img" aria-label={`${fmt(value, 1)} ${unit}, against ${fmt(normal, 1)} before the crisis`}>
      <div className="ruler__track">
        <div className="ruler__gap" style={{ left: pct(value), width: `calc(${pct(normal)} - ${pct(value)})` }} />
        <div className="ruler__fill" style={{ width: pct(value) }} />
        <div className="ruler__normal" style={{ left: pct(normal) }}><span>Normal {fmt(normal, 1)}</span></div>
        <div className="ruler__now" style={{ left: pct(value) }}><span>Now {fmt(value, 1)}</span></div>
      </div>
      <div className="ruler__ticks mono" aria-hidden="true">
        {ticks.map((t, i) => <span key={i} style={{ left: pct(t) }}>{i % 2 === 0 ? fmt(t) : ""}</span>)}
      </div>
    </div>
  );
}

/** Weekly port calls as slim columns, the latest week in full colour. */
export function WeekBars({ weeks, reference, height = 64 }: { weeks: number[]; reference?: number; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = weeks.length;
  const max = niceMax(Math.max(1, ...weeks, reference ?? 0));
  const y = lin(0, max, height - 2, 4);
  const step = w / Math.max(1, n);
  const { index, handlers } = useScrub(n, step / 2, w - step);
  const at = index ?? n - 1;
  return (
    <figure className="viz viz--weeks">
      <Readout>
        <b>{index === null ? "Latest week" : `${n - 1 - at} ${n - 1 - at === 1 ? "week" : "weeks"} ago`}</b>
        <span>{weeks[at] ?? 0} calls</span>
        {reference !== undefined && <span className="viz__muted">normal about {fmt(reference)}</span>}
      </Readout>
      <div ref={ref} className="viz__plot" {...handlers} style={{ height }}>
        {w > 0 && (
          <svg width={w} height={height} aria-hidden="true">
            {reference !== undefined && <line className="viz__baseline" x1={0} x2={w} y1={y(reference)} y2={y(reference)} />}
            {weeks.map((v, i) => (
              <rect key={i} className={i === at ? "viz__wk is-on" : "viz__wk"} x={i * step + 0.5} y={y(v)} width={Math.max(1, step - 2)} height={height - 2 - y(v)} />
            ))}
          </svg>
        )}
      </div>
    </figure>
  );
}

export interface WaitHistoryPoint { t: number; days: number | null; waiting: number; index: number | null }

const when = (t: number) => {
  const d = new Date(t);
  return `${shortDate(d.toISOString().slice(0, 10))} ${d.toISOString().slice(11, 13)}:00`;
};

/** Our own record of a port, a point every few hours: how long the queue had waited, with the usual wait dotted across. */
export function WaitHistory({ points, typical, word, height = 96 }: { points: WaitHistoryPoint[]; typical: number | null; word: (days: number) => string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = points.length;
  const max = niceMax(Math.max(0.5, ...points.map((p) => p.days ?? 0), typical ?? 0));
  const base = height - 16;
  const y = lin(0, max, base, 6);
  const x = lin(0, Math.max(1, n - 1), 1, Math.max(2, w - 1));
  const { index, handlers } = useScrub(n, 1, w - 2);
  const at = index ?? n - 1;
  const p = points[at];
  // A reading Kpler did not give breaks the line rather than dropping to zero.
  const runs: { i: number; v: number }[][] = [];
  points.forEach((q, i) => {
    if (q.days === null) return;
    const last = runs.at(-1);
    if (last && last.at(-1)!.i === i - 1) last.push({ i, v: q.days });
    else runs.push([{ i, v: q.days }]);
  });
  const line = (r: { i: number; v: number }[]) => r.map((q, k) => `${k ? "L" : "M"}${x(q.i).toFixed(1)},${y(q.v).toFixed(1)}`).join("");
  const days = Math.round((points[n - 1]?.t - points[0]?.t) / 86_400_000);
  return (
    <figure className="viz viz--waits">
      <Readout>
        <b>{p ? when(p.t) : "–"}</b>
        <span>{p?.days == null ? "no figure" : word(p.days)}</span>
        {p && <span className="viz__muted">{p.waiting} queuing</span>}
        {p?.index != null && <span className="viz__muted">index {fmt(p.index, 1)}</span>}
      </Readout>
      <div ref={ref} className="viz__plot" {...handlers} style={{ height }}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={`Wait at this port over the last ${days || 1} days`}>
            {runs.map((r) => (
              <g key={r[0].i}>
                {r.length > 1 && <path className="viz__area" d={`${line(r)} L${x(r.at(-1)!.i).toFixed(1)},${base} L${x(r[0].i).toFixed(1)},${base} Z`} />}
                <path className="viz__line" d={line(r)} />
              </g>
            ))}
            {typical !== null && <line className="viz__baseline" x1={0} x2={w} y1={y(typical)} y2={y(typical)} />}
            {p?.days != null && <circle className={`viz__point${index === null ? " viz__point--now" : ""}`} cx={x(at)} cy={y(p.days)} r={3.5} />}
            {index !== null && <line className="viz__cursor" x1={x(index)} x2={x(index)} y1={4} y2={base} />}
            <g className="viz__axis">
              <text x={1} y={height - 3} textAnchor="start">{points[0] ? shortDate(new Date(points[0].t).toISOString().slice(0, 10)) : ""}</text>
              {typical !== null && <text x={w / 2} y={height - 3} textAnchor="middle">Dotted: usual, {word(typical)}</text>}
              <text x={w - 1} y={height - 3} textAnchor="end">Now</text>
            </g>
          </svg>
        )}
      </div>
    </figure>
  );
}
