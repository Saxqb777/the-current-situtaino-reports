"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";

interface Props {
  snap: Snap;
  onSnap(snap: Snap): void;
  /** Height of the area the sheet slides up over. */
  stage: number;
  /** Height for "half"; defaults to a little over half the stage. */
  half?: number;
  /** Reports the visible height, so the chart can keep flights clear of the sheet. */
  onHeight?(px: number): void;
  label: string;
  children: React.ReactNode;
}

const GRIP = 22;
const DRAG_START = 6;
const FLICK = 0.45; // px per ms

/**
 * A bottom sheet with three resting heights, dragged by its grip or by any
 * header marked data-sheet-drag. "peek" shows the grip plus the first element
 * marked data-sheet-head, measured live so larger text never gets clipped.
 */
export default function Sheet({ snap, onSnap, stage, half, onHeight, label, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [peek, setPeek] = useState(110);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ id: number; y: number; h: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  // Measure the header that should stay visible when the sheet is down. The
  // header changes with the panel (Log, ship, TV), so it is looked up again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let watched: Element | null = null;
    const ro = new ResizeObserver(() => measure());
    function measure() {
      const head = el!.querySelector<HTMLElement>("[data-sheet-head]");
      if (head !== watched) {
        if (watched) ro.unobserve(watched);
        if (head) ro.observe(head);
        watched = head;
      }
      if (head) setPeek(Math.round(GRIP + head.offsetHeight));
    }
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

  const heights: Record<Snap, number> = {
    peek: Math.min(peek, stage),
    half: Math.min(Math.max(half ?? Math.round(stage * 0.56), peek + 80), stage),
    full: stage,
  };
  const height = dragH ?? heights[snap];

  useEffect(() => { if (dragH === null) onHeight?.(heights[snap]); });

  const order: Snap[] = ["peek", "half", "full"];
  const restingFor = (h: number, v: number): Snap => {
    // A flick goes to the next resting height in its direction; a slow drag settles on the nearest.
    if (v < -FLICK) return order.find((s) => heights[s] > h + 4) ?? "full";
    if (v > FLICK) return [...order].reverse().find((s) => heights[s] < h - 4) ?? "peek";
    return order.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (!t.closest("[data-sheet-drag], .sheet__grip")) return;
    if (t.closest("input, textarea, select")) return;
    drag.current = { id: e.pointerId, y: e.clientY, h: height, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (Math.abs(e.clientY - d.y) < DRAG_START) return;
      d.moved = true;
      ref.current?.setPointerCapture(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = 0.7 * ((e.clientY - d.lastY) / dt) + 0.3 * d.v;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragH(Math.max(heights.peek - 24, Math.min(stage, d.h - (e.clientY - d.y))));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      swallowClick.current = true;
      onSnap(restingFor(d.h - (e.clientY - d.y), d.v));
      setDragH(null);
    } else if ((e.target as Element).closest(".sheet__grip")) {
      onSnap(snap === "peek" ? "half" : "peek");
    }
  };

  return (
    <section
      ref={ref}
      className="sheet"
      aria-label={label}
      data-snap={snap}
      data-dragging={dragH !== null}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; setDragH(null); }}
      onClickCapture={(e) => {
        // A drag that ends over a button must not also press it.
        if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); swallowClick.current = false; }
      }}
    >
      <button
        className="sheet__grip"
        aria-label={snap === "peek" ? `Open ${label}` : `Lower ${label}`}
        aria-expanded={snap !== "peek"}
        onClick={(e) => { if (e.detail === 0) onSnap(snap === "peek" ? "half" : "peek"); }}
      >
        <span aria-hidden="true" />
      </button>
      <div className="sheet__body">{children}</div>
    </section>
  );
}
