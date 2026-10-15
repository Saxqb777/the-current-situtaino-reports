"use client";

import { lin, useWidth } from "./scale";

interface Props {
  values: number[];
  height?: number;
  /** A reference level drawn as a dotted rule, such as the pre-crisis average. */
  reference?: number;
  /** Draws the last point as a dot. */
  dot?: boolean;
  tone?: "ink" | "olive" | "danger";
  label?: string;
}

/** A small line with a soft fill, sized to its container. */
export default function Spark({ values, height = 32, reference, dot = true, tone = "ink", label }: Props) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = values.length;
  const max = Math.max(1, ...values, reference ?? 0);
  const x = lin(0, Math.max(1, n - 1), 1, Math.max(2, w - 3));
  const y = lin(0, max, height - 2, 3);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <div ref={ref} className={`spark spark--${tone}`} style={{ height }} role={label ? "img" : undefined} aria-label={label}>
      {w > 0 && n > 1 && (
        <svg width={w} height={height} aria-hidden="true">
          {reference !== undefined && <line className="spark__ref" x1={0} x2={w} y1={y(reference)} y2={y(reference)} />}
          <path className="spark__area" d={`M${x(0)},${height} L${pts.join(" L")} L${x(n - 1)},${height} Z`} />
          <path className="spark__line" d={`M${pts.join(" L")}`} />
          {dot && <circle className="spark__dot" cx={x(n - 1)} cy={y(values[n - 1])} r={2.6} />}
        </svg>
      )}
    </div>
  );
}
