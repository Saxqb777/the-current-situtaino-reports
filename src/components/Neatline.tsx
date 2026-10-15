"use client";

import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useState } from "react";

const W = 9; // border width in px

/**
 * The alternating black-and-white degree scale printed around the edge of a
 * nautical chart, redrawn as the chart pans and zooms.
 */
export default function Neatline({ map }: { map: MLMap }) {
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => tick((n) => n + 1)); };
    map.on("move", redraw);
    map.on("resize", redraw);
    return () => { map.off("move", redraw); map.off("resize", redraw); cancelAnimationFrame(raf); };
  }, [map]);

  const c = map.getContainer();
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return null;
  const b = map.getBounds();
  const span = Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth());
  const unit = span > 16 ? 1 : span > 6 ? 0.5 : span > 2 ? 1 / 6 : 1 / 12;
  const every = span > 16 ? 5 : span > 6 ? 2 : span > 2 ? 1 : 0.5;

  const bars: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  const lonStart = Math.floor(b.getWest() / unit) * unit;
  for (let lon = lonStart, i = Math.round(lonStart / unit); lon < b.getEast() + unit; lon += unit, i++) {
    const x0 = map.project([lon, b.getSouth()]).x;
    const x1 = map.project([lon + unit, b.getSouth()]).x;
    if (i % 2 === 0) {
      bars.push(<rect key={`t${i}`} x={x0} y={0} width={x1 - x0} height={W} />);
      bars.push(<rect key={`b${i}`} x={x0} y={h - W} width={x1 - x0} height={W} />);
    }
    const r = Math.round(lon * 1000) / 1000;
    if (Math.abs(r / every - Math.round(r / every)) < 1e-6 && x0 > 30 && x0 < w - 30) {
      labels.push(<text key={`lt${i}`} x={x0 + 3} y={W + 11}>{`${Math.abs(r)}°${r >= 0 ? "E" : "W"}`}</text>);
    }
  }
  const latStart = Math.floor(b.getSouth() / unit) * unit;
  for (let lat = latStart, i = Math.round(latStart / unit); lat < b.getNorth() + unit; lat += unit, i++) {
    const y0 = map.project([b.getWest(), lat]).y;
    const y1 = map.project([b.getWest(), lat + unit]).y;
    if (i % 2 === 0) {
      bars.push(<rect key={`l${i}`} x={0} y={y1} width={W} height={y0 - y1} />);
      bars.push(<rect key={`r${i}`} x={w - W} y={y1} width={W} height={y0 - y1} />);
    }
    const r = Math.round(lat * 1000) / 1000;
    if (Math.abs(r / every - Math.round(r / every)) < 1e-6 && y0 > 30 && y0 < h - 30) {
      labels.push(<text key={`ll${i}`} x={W + 4} y={y0 - 3}>{`${Math.abs(r)}°${r >= 0 ? "N" : "S"}`}</text>);
    }
  }

  return (
    <svg className="neatline" width={w} height={h} aria-hidden="true">
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill="none" stroke="var(--ink)" />
      <rect x={W} y={W} width={w - 2 * W} height={h - 2 * W} fill="none" stroke="var(--ink)" />
      <g fill="var(--ink)">{bars}</g>
      <g>{labels}</g>
    </svg>
  );
}
