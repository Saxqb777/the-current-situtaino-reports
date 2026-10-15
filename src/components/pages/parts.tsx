"use client";

import type { HzStatus } from "@/lib/hormuz";

/** Strait status to a tone: open reads olive, restricted red, closed chart magenta. */
export function statusTone(level: string | undefined): "ok" | "warn" | "danger" | "closed" | "unknown" {
  if (level === "open") return "ok";
  if (level === "restricted") return "danger";
  if (level === "closed") return "closed";
  if (level === "disrupted" || level === "reduced") return "warn";
  return "unknown";
}

export function Section({ n, title, sub, children, id, wide }: { n: string; title: string; sub?: React.ReactNode; children: React.ReactNode; id?: string; wide?: boolean }) {
  return (
    <section className={wide ? "sect sect--wide" : "sect"} id={id} data-tour={id}>
      <header className="sect__head">
        <span className="sect__n mono">{n}</span>
        <h2 className="sect__title">{title}</h2>
        {sub && <p className="sect__sub">{sub}</p>}
      </header>
      {children}
    </section>
  );
}

export function Kpi({ value, label, foot, tone }: { value: React.ReactNode; label: string; foot?: React.ReactNode; tone?: "danger" | "warn" | "ok" | "closed" }) {
  return (
    <div className="kpi" data-tone={tone}>
      <span className="kpi__label">{label}</span>
      <b className="kpi__value">{value}</b>
      {foot && <span className="kpi__foot">{foot}</span>}
    </div>
  );
}

/** "▲ 3 on the day before" with the arrow coloured by whether more is better. */
export function Delta({ now, before, unit = "", moreIsGood = true, word = "on the day before" }: { now: number; before: number; unit?: string; moreIsGood?: boolean; word?: string }) {
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="delta">Same as {word.replace(/^on /, "")}</span>;
  const good = d > 0 === moreIsGood;
  return (
    <span className="delta" data-good={good}>
      <i aria-hidden="true">{d > 0 ? "▲" : "▼"}</i> {Math.abs(d)}{unit} {word}
    </span>
  );
}

export function Credit({ children }: { children: React.ReactNode }) {
  return <footer className="credit">{children}</footer>;
}

export function Loading({ failed, what }: { failed: boolean; what: string }) {
  return (
    <div className="page__loading" role="status">
      <span className="page__loading-bar" aria-hidden="true" />
      {failed ? `${what} could not be reached just now. It will retry on its own.` : `Loading ${what}…`}
    </div>
  );
}

export function dayOf(status: HzStatus["status"] | undefined): string | null {
  return status?.dayCount ? `Day ${status.dayCount}` : null;
}

/** "36.2" hours → "1.5 days"; under two days stays in hours. */
export function hoursWord(h: number): string {
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(h < 240 ? 1 : 0)} days`;
}
