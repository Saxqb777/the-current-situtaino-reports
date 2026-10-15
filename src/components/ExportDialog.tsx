"use client";

import { useEffect, useRef, useState } from "react";
import type { WatchEvent, ZoneSummary } from "@/lib/types";
import { SEVERITY_META, utcTime } from "@/lib/ui";

interface Props {
  open: boolean;
  onClose(): void;
  events: WatchEvent[];
  zones: ZoneSummary[];
  chartImage(): string | null;
}

export default function ExportDialog({ open, onClose, events, zones, chartImage }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("Gulf and Red Sea shipping situation");
  const [preparedFor, setPreparedFor] = useState("");
  const [note, setNote] = useState("");
  const [withChart, setWithChart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

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
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sea-lanes-briefing-${generatedAt.slice(0, 16).replace(/[:T]/g, "-")}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onClose();
    } catch (err) {
      setError(`The PDF could not be built: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="export-title">
      <div className="dialog__head">
        <h2 id="export-title">Export briefing</h2>
        <p>{events.length} {events.length === 1 ? "report" : "reports"} selected. They print newest first, each with its sources.</p>
      </div>
      <div className="dialog__body">
        <label className="field">Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">Prepared for
          <input value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="Team or person receiving the briefing" />
        </label>
        <label className="field">Opening note (optional)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One or two lines on what matters most today" />
        </label>
        <label className="check">
          <input type="checkbox" checked={withChart} onChange={(e) => setWithChart(e.target.checked)} />
          Include the chart as it looks now
        </label>
        <ul className="dialog__picked">
          {events.map((e) => (
            <li key={e.id}>
              <span className="mono" style={{ color: SEVERITY_META[e.severity].color }}>{utcTime(e.lastSeen)}</span>
              <span>{e.title}</span>
            </li>
          ))}
        </ul>
        {error && <p className="dialog__error" role="alert">{error}</p>}
      </div>
      <div className="dialog__foot">
        <button className="tool" onClick={onClose}>Cancel</button>
        <button className="tool tool--primary" onClick={generate} disabled={busy || events.length === 0}>
          {busy ? "Building PDF…" : "Download PDF"}
        </button>
      </div>
    </dialog>
  );
}
