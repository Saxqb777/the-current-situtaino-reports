"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Width of an element in CSS pixels, kept current as the layout changes. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Linear map from [d0, d1] to [r0, r1]. */
export const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** A rounded top for a scale: 7 → 8, 13 → 15, 84 → 100, 105 → 120. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 1.2 ? 1.2 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
  return step * p;
}

/**
 * Scrubbing: drag or hover across a chart to read one column. Vertical
 * swipes still scroll the page (the chart sets touch-action: pan-y).
 */
export function useScrub(count: number, left: number, width: number) {
  const [index, setIndex] = useState<number | null>(null);
  const at = (e: React.PointerEvent<Element>) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    const x = e.clientX - r.left - left;
    const i = Math.round((x / Math.max(1, width)) * (count - 1));
    setIndex(Math.max(0, Math.min(count - 1, i)));
  };
  return {
    index,
    handlers: {
      onPointerDown: at,
      onPointerMove: (e: React.PointerEvent<Element>) => { if (e.pointerType === "mouse" || e.buttons) at(e); },
      onPointerLeave: () => setIndex(null),
      onPointerCancel: () => setIndex(null),
      onPointerUp: (e: React.PointerEvent<Element>) => { if (e.pointerType !== "mouse") setIndex(null); },
    },
  };
}

/** Plays once when the element first scrolls into view; instant when motion is reduced. */
export function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-14" → "14 Oct"; "2026-03" → "Mar 2026". */
export function shortDate(s: string): string {
  const [y, m, d] = s.split("-");
  return d ? `${Number(d)} ${MONTHS[Number(m) - 1]}` : `${MONTHS[Number(m) - 1]} ${y}`;
}
