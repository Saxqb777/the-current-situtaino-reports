/** A plain compass rose in chart style: true north up, with a degree ring. */
export default function Compass() {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <svg className="compass" viewBox="-60 -74 120 134" aria-hidden="true">
      <circle r="56" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle r="47" fill="none" stroke="currentColor" strokeWidth="0.5" />
      {ticks.map((d) => (
        <line key={d} x1="0" y1={-56} x2="0" y2={d % 30 === 0 ? -49 : -53} stroke="currentColor" strokeWidth={d % 30 === 0 ? 1 : 0.5} transform={`rotate(${d})`} />
      ))}
      <g fill="currentColor">
        <path d="M0,-44 L5,0 L0,6 L-5,0 Z" />
        <path d="M0,44 L5,0 L0,-6 L-5,0 Z" opacity="0.35" />
        <path d="M44,0 L0,4 L-6,0 L0,-4 Z" opacity="0.35" />
        <path d="M-44,0 L0,4 L6,0 L0,-4 Z" opacity="0.35" />
      </g>
      <circle r="2.4" fill="var(--paper)" stroke="currentColor" strokeWidth="0.8" />
      <text y="-62" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="12" fill="var(--magenta)">N</text>
    </svg>
  );
}
