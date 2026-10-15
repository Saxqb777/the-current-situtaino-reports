"use client";

import { useEffect, useRef } from "react";
import type { WatchEvent, ZoneSummary } from "@/lib/types";
import BriefingForm from "./BriefingForm";

interface Props {
  open: boolean;
  onClose(): void;
  events: WatchEvent[];
  zones: ZoneSummary[];
  chartImage(): string | null;
}

export default function ExportDialog({ open, onClose, events, zones, chartImage }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="export-title">
      <div className="dialog__head">
        <h2 id="export-title">Export briefing</h2>
        <p>{events.length} {events.length === 1 ? "report" : "reports"} selected. They print newest first, each with its sources.</p>
      </div>
      <BriefingForm
        events={events}
        zones={zones}
        chartImage={chartImage}
        onDone={onClose}
        extraAction={<button className="tool" onClick={onClose}>Cancel</button>}
      />
    </dialog>
  );
}
