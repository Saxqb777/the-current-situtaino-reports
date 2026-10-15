"use client";

import type { WatchEvent } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { SEVERITY_META, utcDate, utcTime } from "@/lib/ui";

const SPAN_H = 7 * 24;
const BIN_H = 3;

interface Props {
  events: WatchEvent[];
  now: number;
  asOf: number | null;
  setAsOf(t: number | null): void;
}

/** Drag back through the last seven days; the chart and Log show the picture as it stood then. */
export default function Scrubber({ events, now, asOf, setAsOf }: Props) {
  const start = now - SPAN_H * 3600_000;
  const bins = Array.from({ length: SPAN_H / BIN_H }, () => ({ n: 0, worst: -1 }));
  for (const e of events) {
    const i = Math.floor((Date.parse(e.firstSeen) - start) / (BIN_H * 3600_000));
    if (i < 0 || i >= bins.length) continue;
    bins[i].n++;
    bins[i].worst = Math.max(bins[i].worst, SEVERITIES.indexOf(e.severity));
  }
  const max = Math.max(1, ...bins.map((b) => b.n));
  const value = asOf ?? now;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 24 * 3600_000);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }).filter((t) => t > start && (t - start) / (SPAN_H * 3600_000) < 0.96);

  return (
    <div className="scrub">
      <div className="scrub__label">
        {asOf ? "Showing" : "Live"}
        <b>{asOf ? `${utcDate(new Date(asOf).toISOString())} ${utcTime(new Date(asOf).toISOString())}` : "Now"}</b>
      </div>
      <div className="scrub__track">
        <div className="scrub__bars" aria-hidden="true">
          {bins.map((b, i) => (
            <span
              key={i}
              className="scrub__bar"
              data-future={start + (i + 1) * BIN_H * 3600_000 > value + BIN_H * 3600_000}
              style={{ height: `${(b.n / max) * 100}%`, background: b.worst >= 0 ? SEVERITY_META[SEVERITIES[b.worst]].color : undefined }}
            />
          ))}
        </div>
        <div className="scrub__axis mono" aria-hidden="true">
          {days.map((t) => (
            <span key={t} style={{ left: `${((t - start) / (SPAN_H * 3600_000)) * 100}%` }}>{utcDate(new Date(t).toISOString())}</span>
          ))}
        </div>
        <input
          className="scrub__range"
          type="range"
          min={start}
          max={now}
          step={15 * 60_000}
          value={value}
          aria-label="Time shown on the chart"
          aria-valuetext={asOf ? new Date(asOf).toUTCString() : "Live"}
          onChange={(e) => {
            const t = Number(e.target.value);
            setAsOf(now - t < 20 * 60_000 ? null : t);
          }}
        />
      </div>
      <button className="tool" aria-pressed={asOf === null} onClick={() => setAsOf(null)}>Back to live</button>
    </div>
  );
}
