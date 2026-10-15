"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ZoneId } from "@/lib/types";

type Variant = "phone" | "desktop";
type ByVariant = string | { phone: string; desktop: string };

/** What the tour needs to see and do in the app. */
export interface TourModel {
  zone: ZoneId | null;
  picked: number;
  firstEventId: string | null;
  focusZone(zone: ZoneId | null): void;
  togglePick(id: string): void;
}

interface Step {
  id: string;
  /** data-tour value of the element to spotlight; none means a centred card. */
  target?: ByVariant;
  title: string;
  body: ByVariant;
  /** A "your turn" step: waits for the person to do it, or does it for them. */
  task?: {
    prompt: ByVariant;
    done(m: TourModel, atStart: TourModel): boolean;
    doIt(m: TourModel): void;
  };
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to Sea Lanes Watch",
    body: "A live report on shipping around the GCC: the Strait of Hormuz, the Gulf ports, the Red Sea and the Somali coast. This short tour shows you around. It takes about a minute.",
  },
  {
    id: "now",
    target: "now-verdict",
    title: "Our verdict",
    body: "Our own reading of the five sea lanes in one line, with the bottom line under it. Come back later and \"Since you last looked\" lists what changed. It all updates on its own.",
  },
  {
    id: "route",
    target: "now-route",
    title: "The route in",
    body: {
      phone: "Suez to the Gulf ports, one stop per sea lane, coloured by our level, with the one fact that matters there. Tap a stop to fly the chart to it.",
      desktop: "Suez to the Gulf ports, one stop per sea lane, coloured by our level, with the one fact that matters there. Click a stop to fly the chart to it.",
    },
  },
  {
    id: "zones",
    target: "zones",
    title: "Five watch zones",
    body: {
      phone: "On the chart, each card is one sea area. The word shows its level today: Normal, Elevated, High or Critical. Swipe sideways to see them all.",
      desktop: "Each column is one sea area. The word shows its level today: Normal, Elevated, High or Critical, with reports and ships underneath.",
    },
  },
  {
    id: "zone-task",
    target: "zone-hormuz",
    title: "Your turn",
    body: "Picking a zone flies the chart there and keeps only that zone's reports in the Log.",
    task: {
      prompt: { phone: "Tap Strait of Hormuz", desktop: "Click Strait of Hormuz" },
      done: (m) => m.zone === "hormuz",
      doIt: (m) => m.focusZone("hormuz"),
    },
  },
  {
    id: "chart",
    target: "chart",
    title: "The live chart",
    body: {
      phone: "Zoomed out, the green glow shows where ships crowd. Zoom in and arrows are ships under way, dots are ships stopped or at anchor. A dashed pink ship has lost its signal. Ports are ringed red where calls have collapsed. Tap anything for details.",
      desktop: "Zoomed out, the green glow shows where ships crowd. Zoom in and arrows are ships under way, dots are ships stopped or at anchor. A dashed pink ship has lost its signal. Ports are ringed red where calls have collapsed. Click anything for details.",
    },
  },
  {
    id: "search",
    target: "search",
    title: "Find a ship",
    body: "Type a ship's name to find it on the chart. Pick it and the Log shows the reports that name it, or the reports from the waters it is in when none do. Ports work the same way.",
  },
  {
    id: "layers",
    target: "layers",
    title: "Chart layers",
    body: "Show or hide ships, ships at anchor, the density glow, the Hormuz anchorages, ports and reports. It also says where each ship feed comes from.",
  },
  {
    id: "time",
    target: "time",
    title: "Look back in time",
    body: {
      phone: "Open the clock to drag back up to seven days and see the reports as they stood then.",
      desktop: "Drag back up to seven days to see the reports as they stood then. The bars show when reports came in, coloured by level.",
    },
  },
  {
    id: "log",
    target: "log",
    title: "The Log",
    body: "Every report, newest first. When many outlets report the same event it shows once, with all of its sources. Search or filter to narrow it down.",
  },
  {
    id: "pick-task",
    target: "pick",
    title: "Your turn",
    body: "Ticked reports go into your briefing.",
    task: {
      prompt: { phone: "Tick the first report", desktop: "Tick the first report" },
      done: (m, start) => m.picked > start.picked,
      doIt: (m) => { if (m.firstEventId) m.togglePick(m.firstEventId); },
    },
  },
  {
    id: "briefing",
    target: { phone: "briefing-btn", desktop: "briefing" },
    title: "Send a briefing",
    body: "Your ticked reports become a designed PDF with our verdict, the route in, the strait and port figures, and every source linked, ready to email or print. Clear all empties your picks.",
  },
  {
    id: "hormuz",
    target: { phone: "tab-hormuz", desktop: "vtab-hormuz" },
    title: "Hormuz in depth",
    body: "How far traffic is from normal, whether it is recovering, who still crosses and who is stuck at anchor, with our own reports on the strait. Drag across any chart to read it.",
  },
  {
    id: "ports",
    target: { phone: "tab-ports", desktop: "vtab-ports" },
    title: "Every Gulf port",
    body: {
      phone: "Every Gulf port: its calls and exports against before the crisis. Switch to Waiting times for the 16 GCC ports, read every hour: how long ships queue for a berth and how busy each port is. Tap a port for its terminals and history.",
      desktop: "Every Gulf port: its calls and exports against before the crisis. Switch to Waiting times for the 16 GCC ports, read every hour: how long ships queue for a berth and how busy each port is. Click a port for its terminals and history.",
    },
  },
  {
    id: "tv",
    target: "tv",
    title: "Live TV",
    body: {
      phone: "Al Jazeera English and Arabic, Sky News, France 24, DW and TRT World, live at the bottom of the Now page.",
      desktop: "Al Jazeera English and Arabic, Sky News, France 24, DW and TRT World, live inside the app.",
    },
  },
  {
    id: "display",
    target: "display",
    title: "Easier reading",
    body: {
      phone: "Tap Aa for bigger text or the night chart. Tour plays this walkthrough again any time.",
      desktop: "Make the text bigger or switch to the night chart here. Tour plays this walkthrough again any time.",
    },
  },
  {
    id: "finish",
    title: "You're on watch",
    body: "Everything updates on its own. When a new High or Critical report comes in, it flashes across the top of the screen.",
  },
];

const pick = (v: ByVariant, variant: Variant) => (typeof v === "string" ? v : v[variant]);
const PAD = 6;
/** Extra room around a "your turn" target, so a thumb that lands a little off still counts. */
const TASK_PAD = 12;
/** Steps counted in the progress bar: everything between the welcome and the finish. */
const COUNTED = STEPS.length - 2;

/**
 * Scrolls only real scrolling lists (overflow auto or scroll) so the target
 * shows. scrollIntoView would also nudge clipped panels and leave their
 * headers out of view after the tour.
 */
function reveal(el: HTMLElement) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const sx = /auto|scroll/.test(cs.overflowX) && p.scrollWidth > p.clientWidth;
    const sy = /auto|scroll/.test(cs.overflowY) && p.scrollHeight > p.clientHeight;
    if (!sx && !sy) continue;
    const r = el.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    if (sx && r.left < pr.left) p.scrollLeft -= pr.left - r.left + 16;
    else if (sx && r.right > pr.right) p.scrollLeft += r.right - pr.right + 16;
    if (sy && r.top < pr.top) p.scrollTop -= pr.top - r.top + 16;
    // A target taller than the list shows from its top.
    else if (sy && r.bottom > pr.bottom) p.scrollTop += Math.min(r.bottom - pr.bottom + 16, r.top - pr.top - 16);
  }
}

function findVisible(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

interface Box { top: number; left: number; width: number; height: number }

interface Props {
  variant: Variant;
  model: TourModel;
  /** Puts the screen in the right state for a step, such as opening the Log sheet on a phone. */
  prepare?(stepId: string): void;
  onEnd(): void;
}

/**
 * A first-visit walkthrough in the style of a game tutorial: it dims the
 * screen, cuts a window around one part of the app, explains it, and on
 * "your turn" steps waits for the person to try it themselves.
 */
export default function Tour({ variant, model, prepare, onEnd }: Props) {
  const [i, setI] = useState(0);
  const [hole, setHole] = useState<Box | null>(null);
  const [found, setFound] = useState(true);
  const [cardH, setCardH] = useState(220);
  const [completed, setCompleted] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const atStart = useRef(model);
  const latest = useRef(model);
  latest.current = model;
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;

  const step = STEPS[i];
  const target = step.target ? pick(step.target, variant) : null;
  const task = step.task && found ? step.task : undefined;
  const counted = i > 0 && i < STEPS.length - 1;

  const go = useCallback((n: number) => {
    if (n >= STEPS.length || n < 0) { if (n >= STEPS.length) onEnd(); return; }
    setI(n);
  }, [onEnd]);

  // Set the screen up for this step and remember where things stood.
  useEffect(() => {
    prepareRef.current?.(STEPS[i].id);
    atStart.current = latest.current;
    setCompleted(false);
  }, [i]);

  // Follow the target while it moves: sheets slide, the chart flies, lists scroll.
  const isTask = Boolean(step.task);
  useEffect(() => {
    if (!target) { setHole(null); setFound(true); return; }
    let raf = 0;
    let scrolled = false;
    let misses = 0;
    const tick = () => {
      const el = findVisible(target);
      if (el) {
        if (!scrolled) {
          scrolled = true;
          reveal(el);
        }
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = isTask ? TASK_PAD : PAD;
        const top = Math.max(4, r.top - pad);
        const left = Math.max(4, r.left - pad);
        const next = { top, left, width: Math.min(vw - 4, r.right + pad) - left, height: Math.min(vh - 4, r.bottom + pad) - top };
        setHole((h) => (h && Math.abs(h.top - next.top) < 0.5 && Math.abs(h.left - next.left) < 0.5 && Math.abs(h.width - next.width) < 0.5 && Math.abs(h.height - next.height) < 0.5 ? h : next));
        setFound(true);
        misses = 0;
      } else if (++misses > 20) {
        // Not on screen (for example no reports yet): explain it without a spotlight.
        setHole(null);
        setFound(false);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, i, isTask]);

  // A "your turn" step moves on by itself once it is done.
  const taskDone = task ? task.done(model, atStart.current) : false;
  useEffect(() => {
    if (!task || !taskDone || completed) return;
    setCompleted(true);
    const t = setTimeout(() => go(i + 1), 1100);
    return () => clearTimeout(t);
  }, [task, taskDone, completed, go, i]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
    card.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus({ preventScroll: true });
  }, [i, found, completed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest?.("input, textarea")) return;
      if (e.key === "Escape") { e.preventDefault(); onEnd(); }
      else if (e.key === "ArrowRight" && (!task || completed)) go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, task, completed, go, onEnd]);

  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const cardStyle = placeCard(variant, hole, cardH, vw, vh);
  const prompt = task ? pick(task.prompt, variant) : null;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-variant={variant}>
      {hole ? (
        <>
          <div className="tour__shade" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <div className="tour__shade" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour__shade" style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <div className="tour__shade" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          {/* Lets the person press the highlighted control only when it is their turn. */}
          {!task && <div className="tour__lid" style={hole} />}
          <div className="tour__ring" data-task={Boolean(task) && !completed} style={hole}>
            <i /><i /><i /><i />
          </div>
        </>
      ) : (
        <div className="tour__shade" style={{ inset: 0 }} />
      )}

      <div className="tour__card" ref={card} style={cardStyle} key={i} data-done={completed}>
        <div className="tour__meta">
          {counted ? (
            <>
              <span className="mono">Step {String(i).padStart(2, "0")} / {String(COUNTED).padStart(2, "0")}</span>
              <span className="tour__ticks" aria-hidden="true">
                {Array.from({ length: COUNTED }, (_, n) => <i key={n} data-on={n < i} />)}
              </span>
            </>
          ) : (
            <span className="mono">{i === 0 ? "Guided tour" : "Tour complete"}</span>
          )}
        </div>
        <h2 id="tour-title" className="tour__title">{step.title}</h2>
        {prompt && (
          <p className="tour__task" aria-live="polite">
            {completed ? <><b className="tour__check" aria-hidden="true">✓</b> Done</> : <><i className="tour__beacon" aria-hidden="true" />{prompt}</>}
          </p>
        )}
        <p className="tour__body">
          {!found && step.id === "pick-task"
            ? "When reports come in, tick them in the Log to add them to a briefing."
            : pick(step.body, variant)}
        </p>
        <div className="tour__foot">
          {i === 0 ? (
            <button className="tour__link" onClick={onEnd}>Skip</button>
          ) : i < STEPS.length - 1 ? (
            <>
              <button className="tour__link" onClick={() => go(i - 1)}>Back</button>
              <button className="tour__link" onClick={onEnd}>End tour</button>
            </>
          ) : (
            <button className="tour__link" onClick={() => go(i - 1)}>Back</button>
          )}
          <span className="tour__spacer" />
          {task && !completed ? (
            <button className="tool" data-primary="" onClick={() => task.doIt(latest.current)}>Show me</button>
          ) : (
            <button className="tool tool--primary" data-primary="" onClick={() => go(i + 1)} disabled={Boolean(task) && !completed}>
              {i === 0 ? "Start the tour" : i === STEPS.length - 1 ? "Start watching" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Phone: dock the card at the top or bottom, away from the spotlight. Desktop: beside the spotlight. */
function placeCard(variant: Variant, hole: Box | null, cardH: number, vw: number, vh: number): React.CSSProperties {
  const M = 12;
  if (variant === "phone") {
    if (!hole) return { left: M, right: M, top: Math.max(M, (vh - cardH) / 2) };
    const mid = hole.top + hole.height / 2;
    // A tall target reads from its top, so the card covers its far end.
    return mid < vh / 2 || hole.height > vh * 0.6
      ? { left: M, right: M, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${M}px)` }
      : { left: M, right: M, top: `calc(env(safe-area-inset-top, 0px) + ${M}px)` };
  }
  const W = 380;
  if (!hole) return { width: W, left: (vw - W) / 2, top: Math.max(M, (vh - cardH) / 2) };
  const clampX = (x: number) => Math.max(16, Math.min(vw - W - 16, x));
  const clampY = (y: number) => Math.max(16, Math.min(vh - cardH - 16, y));
  if (vh - (hole.top + hole.height) > cardH + 2 * M) return { width: W, left: clampX(hole.left), top: hole.top + hole.height + M };
  if (hole.top > cardH + 2 * M) return { width: W, left: clampX(hole.left), top: hole.top - cardH - M };
  if (vw - (hole.left + hole.width) > W + 2 * M) return { width: W, left: hole.left + hole.width + M, top: clampY(hole.top) };
  if (hole.left > W + 2 * M) return { width: W, left: hole.left - W - M, top: clampY(hole.top) };
  // Target fills the screen (the chart): float the card over its lower left.
  return { width: W, left: clampX(hole.left + 24), top: clampY(hole.top + hole.height - cardH - 24) };
}
