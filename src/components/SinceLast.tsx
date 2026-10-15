"use client";

import { useEffect, useState } from "react";
import { SEVERITY_META, agoMin } from "@/lib/ui";
import { type Seen, changesSince } from "@/lib/verdict";

const KEY = "slw-seen";
/** Shorter gaps than this are the same visit. */
const SAME_VISIT_MS = 15 * 60_000;

function read(): Seen | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
}

/**
 * What changed since this reader last looked: levels that moved and serious
 * reports that are new to them. The last look lives in their browser only.
 */
export default function SinceLast({ cur }: { cur: Seen | null }) {
  // Read once, before this visit overwrites it.
  const [prev, setPrev] = useState<Seen | null | undefined>(undefined);
  useEffect(() => setPrev(read()), []);
  useEffect(() => {
    if (prev === undefined || !cur) return;
    // Within one visit keep the older look, so the comparison holds still while the page is open.
    if (prev && cur.t - prev.t < SAME_VISIT_MS) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(cur));
    } catch {
      /* private mode: nothing to remember */
    }
  }, [prev, cur]);

  if (!prev || !cur || cur.t - prev.t < SAME_VISIT_MS) return null;
  const changes = changesSince(prev, cur);
  const when = agoMin((cur.t - prev.t) / 60_000);
  return (
    <div className="since" role="status">
      <p className="since__head mono">Since you last looked, {when}</p>
      {changes.length === 0 ? (
        <p className="since__none">No level has changed and no new serious reports.</p>
      ) : (
        <ul className="since__list">
          {changes.map((c) => (
            <li key={c.text} style={{ "--c": c.level ? SEVERITY_META[c.level].color : "var(--ink)" } as React.CSSProperties}>
              <i aria-hidden="true">{c.up ? "▲" : "▼"}</i>
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
