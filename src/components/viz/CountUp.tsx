"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, useSeen } from "./scale";

/** A figure that counts up from zero the first time it scrolls into view. */
export default function CountUp({ value, digits = 0, ms = 900, className }: { value: number | null | undefined; digits?: number; ms?: number; className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (!seen || value == null) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, ms]);

  return (
    <span ref={ref} className={className}>
      {value == null ? "–" : fmt(seen ? shown : 0, digits)}
    </span>
  );
}
