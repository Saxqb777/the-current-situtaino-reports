import type { RefObject } from "react";
import type { Layers, Selection, ShipFeeds, VesselLite } from "@/lib/client";
import type { HormuzBundle } from "@/lib/hormuz";
import type { ShipDetail } from "@/lib/hooks";
import type { Severity, Snapshot, WatchEvent, ZoneId } from "@/lib/types";
import type { ChartHandle } from "./ChartMap";
import type { LogFilters } from "./Log";

/** The four screens: the situation at a glance, the live chart, the strait, the ports. */
export type View = "now" | "map" | "hormuz" | "ports";

/** Ships seen in each zone, or null where no ship feed reaches. */
export type ZoneShips = Record<ZoneId, { ships: number; silent: number } | null>;

/** How a page sends the reader somewhere else; phone and desktop each wire it their own way. */
export interface Go {
  view(v: View): void;
  /** Opens the live chart on a zone, or the whole region. */
  zone(z: ZoneId | null): void;
  /** Opens the live chart with a report, port or ship picked. */
  select(sel: Selection): void;
  /** Opens the Log, optionally filtered to a zone. */
  log(z?: ZoneId | null): void;
}

/** Everything the phone and desktop layouts share, built once in Dashboard. */
export interface Model {
  snap: Snapshot;
  vessels: VesselLite[];
  feeds: ShipFeeds | null;
  /** hormuz.now's strait, traffic and port figures; null until loaded. */
  hz: HormuzBundle | null;
  hzFailed: boolean;
  zoneShips: ZoneShips;
  /** Our level for each sea lane. */
  levels: Partial<Record<ZoneId, Severity>>;
  shipDetail: ShipDetail | null;
  live: boolean;
  fresh: Set<string>;
  flash: WatchEvent | null;
  dismissFlash(): void;
  /** Wall clock, 0 until mounted so server and client render the same. */
  now: number;
  aisLive: boolean;

  view: View;
  setView(v: View): void;

  filters: LogFilters;
  setFilters(f: LogFilters): void;
  /** Filters to a zone and flies there; `inset` keeps the flight clear of a phone sheet. */
  focusZone(zone: ZoneId | null, inset?: number): void;
  asOf: number | null;
  setAsOf(t: number | null): void;
  /** Events up to the scrubber time, then after the Log filters. */
  timeEvents: WatchEvent[];
  shown: WatchEvent[];

  selection: Selection;
  select(sel: Selection, inset?: number): void;
  hover: string | null;
  setHover(id: string | null): void;

  picked: Set<string>;
  pickedEvents: WatchEvent[];
  togglePick(id: string): void;
  pickAllShown(): void;
  clearPicks(): void;

  layers: Layers;
  setLayers(l: Layers): void;
  counts: { ships: number; anchored: number; unifeeder: number; dark: number; ports: number; events: number };

  theme: string;
  setTheme(t: string): void;
  textSize: string;
  setTextSize(s: string): void;

  chart: RefObject<ChartHandle | null>;
  tour: { on: boolean; start(): void; end(): void };
}
