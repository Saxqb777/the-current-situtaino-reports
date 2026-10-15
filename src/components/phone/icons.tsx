/* Line icons drawn to sit with the chart: square ends, one stroke weight, no fills. */

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 22 22",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "square" as const,
  "aria-hidden": true,
};

export const ChartIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2.5" width="17" height="17" />
    <path d="M11 2.5v17M2.5 11h17" strokeDasharray="1.6 2.2" strokeWidth={1.2} />
    <path d="M13.5 6.5 L15.5 13.5 L13.5 12.4 L11.5 13.5 Z" fill="currentColor" strokeWidth={1} strokeLinejoin="miter" />
  </svg>
);

export const LogIcon = () => (
  <svg {...base}>
    <path d="M3 5h2M3 11h2M3 17h2" strokeWidth={2.4} />
    <path d="M8.5 5h10.5M8.5 11h10.5M8.5 17h7" />
  </svg>
);

export const BriefingIcon = () => (
  <svg {...base}>
    <path d="M4.5 2.5h9l4 4v13h-13z" strokeLinejoin="miter" />
    <path d="M13.5 2.5v4h4" strokeLinejoin="miter" />
    <path d="M7.5 10.5h7M7.5 13.5h7M7.5 16.5h4" strokeWidth={1.3} />
  </svg>
);

export const TvIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="4.5" width="17" height="11.5" />
    <path d="M7.5 19.5h7M11 16v3.5" />
    <path d="M9.4 7.8 L14 10.25 L9.4 12.7 Z" fill="currentColor" strokeWidth={1} strokeLinejoin="miter" />
  </svg>
);

export const LayersIcon = () => (
  <svg {...base}>
    <path d="M11 3 L20 7.5 L11 12 L2 7.5 Z" strokeLinejoin="miter" />
    <path d="M2 11.2 L11 15.7 L20 11.2M2 14.9 L11 19.4 L20 14.9" strokeLinejoin="miter" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="8.5" />
    <path d="M11 6v5.2l3.4 2.2" />
  </svg>
);

export const HomeViewIcon = () => (
  <svg {...base}>
    <path d="M2.5 7V2.5H7M15 2.5h4.5V7M19.5 15v4.5H15M7 19.5H2.5V15" />
    <circle cx="11" cy="11" r="2.6" />
  </svg>
);

export const TourIcon = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="11" cy="11" r="8.5" />
    <path d="M11 3v3M11 16v3M3 11h3M16 11h3" />
    <path d="M11 7.5 L13 11 L11 14.5 L9 11 Z" fill="currentColor" strokeWidth={1} strokeLinejoin="miter" />
  </svg>
);
