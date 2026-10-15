import type { Severity } from "@/lib/types";
import { SEVERITY_META } from "@/lib/ui";

/** The same incident mark the chart uses, so the Log, strip and chart read as one key. */
export default function SeverityMark({ level, size = 22 }: { level: Severity; size?: number }) {
  const color = SEVERITY_META[level].color;
  const ring = level === "critical" ? 13.5 : level === "high" ? 11 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      {ring > 0 && <circle cx="15" cy="15" r={ring} fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="2.5 2" />}
      <circle cx="15" cy="15" r="7.6" fill="var(--paper)" />
      <circle cx="15" cy="15" r="6" fill={color} />
      {level === "critical" && <path d="M12 12 L18 18 M18 12 L12 18" stroke="var(--paper)" strokeWidth="1.6" />}
    </svg>
  );
}
