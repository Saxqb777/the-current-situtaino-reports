"use client";

import { useState } from "react";
import type { HormuzBundle } from "@/lib/hormuz";
import type { WatchEvent, ZoneSummary } from "@/lib/types";
import { SEVERITY_META, utcTime } from "@/lib/ui";

interface Props {
  events: WatchEvent[];
  zones: ZoneSummary[];
  hz: HormuzBundle | null;
  chartImage(): string | null;
  onDone(): void;
  /** Phone: each picked report gets a remove button, since the Log is not on screen. */
  onRemove?(id: string): void;
  /** Unticks every report. */
  onClear?(): void;
  /** Rendered next to the download button (the dialog's Cancel). */
  extraAction?: React.ReactNode;
}

/** Title, recipient, note and the picked reports, then builds the PDF in the browser. */
export default function BriefingForm({ events, zones, hz, chartImage, onDone, onRemove, onClear, extraAction }: Props) {
  const [title, setTitle] = useState("Gulf and Red Sea shipping situation");
  const [preparedFor, setPreparedFor] = useState("");
  const [note, setNote] = useState("");
  const [withChart, setWithChart] = useState(true);
  const [withStrait, setWithStrait] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { Briefing, registerFonts }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./pdf/Briefing"),
      ]);
      registerFonts(window.location.origin);
      const generatedAt = new Date().toISOString();
      const blob = await pdf(
        <Briefing
          title={title.trim() || "Shipping situation briefing"}
          preparedFor={preparedFor.trim()}
          note={note.trim()}
          generatedAt={generatedAt}
          events={events}
          zones={zones}
          chartImage={withChart ? chartImage() : null}
          hz={withStrait ? hz : null}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sea-lanes-briefing-${generatedAt.slice(0, 16).replace(/[:T]/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onDone();
    } catch (err) {
      setError(`The PDF could not be built: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="dialog__body">
        <label className="field">Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">Prepared for
          <input value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="Team or person receiving it" />
        </label>
        <label className="field">Opening note (optional)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One or two lines on what matters most today" />
        </label>
        <label className="check">
          <input type="checkbox" checked={withChart} onChange={(e) => setWithChart(e.target.checked)} />
          Include the chart as it looks now
        </label>
        {hz?.status && (
          <label className="check">
            <input type="checkbox" checked={withStrait} onChange={(e) => setWithStrait(e.target.checked)} />
            Add a page on the Strait of Hormuz and the ports
          </label>
        )}
        {onClear && events.length > 1 && (
          <div className="dialog__pickhead">
            <span>{events.length} reports ticked</span>
            <button className="tool" onClick={onClear}>Clear all</button>
          </div>
        )}
        <ul className="dialog__picked">
          {events.map((e) => (
            <li key={e.id} data-removable={Boolean(onRemove)}>
              <span className="mono" style={{ color: SEVERITY_META[e.severity].color }}>{utcTime(e.lastSeen)}</span>
              <span>{e.title}</span>
              {onRemove && (
                <button className="dialog__remove" onClick={() => onRemove(e.id)} aria-label={`Remove "${e.title}"`}>×</button>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="dialog__error" role="alert">{error}</p>}
      </div>
      <div className="dialog__foot">
        {extraAction}
        <button className="tool tool--primary tool--wide" onClick={generate} disabled={busy || events.length === 0}>
          {busy ? "Building PDF…" : "Download PDF"}
        </button>
      </div>
    </>
  );
}
