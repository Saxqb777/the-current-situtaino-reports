import type { RefObject } from "react";
import type { Layers, Selection, VesselLite } from "@/lib/client";
import type { Snapshot, WatchEvent, ZoneId } from "@/lib/types";
import type { ChartHandle } from "./ChartMap";
import type { LogFilters } from "./Log";

/** Everything the phone and desktop layouts share, built once in Dashboard. */
export interface Model {
  snap: Snapshot;
  vessels: VesselLite[];
  track: [number, number][] | null;
  live: boolean;
  fresh: Set<string>;
  flash: WatchEvent | null;
  dismissFlash(): void;
  /** Wall clock, 0 until mounted so server and client render the same. */
  now: number;
  aisLive: boolean;

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

  layers: Layers;
  setLayers(l: Layers): void;
  counts: { ships: number; unifeeder: number; dark: number; ports: number; events: number };

  theme: string;
  setTheme(t: string): void;
  textSize: string;
  setTextSize(s: string): void;

  chart: RefObject<ChartHandle | null>;
  tour: { on: boolean; start(): void; end(): void };
}
