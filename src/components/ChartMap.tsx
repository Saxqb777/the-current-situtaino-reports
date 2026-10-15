"use client";

import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, Map as MLMap, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PORTS, ZONES, ZONE_BY_ID } from "@/lib/geo";
import type { Layers, Selection, VesselLite } from "@/lib/client";
import { readTokens } from "@/lib/client";
import type { HormuzBundle } from "@/lib/hormuz";
import { PORT_PORTWATCH, callsBand } from "@/lib/portwatch";
import type { WatchEvent, ZoneId } from "@/lib/types";
import { ICON_PIXEL_RATIO, anchorIcon, incidentIcon, shipIcon } from "./chart-icons";
import Neatline from "./Neatline";
import Compass from "./Compass";

export interface ChartHandle {
  /** PNG of the chart as it looks now, for the PDF briefing. */
  snapshot(): string | null;
  /** `inset`: pixels covered at the bottom when the flight lands, if not the current coveredBottom. */
  flyToZone(zone: ZoneId | null, inset?: number): void;
  flyTo(position: [number, number], zoom?: number, inset?: number): void;
  /** Keeps the map sized right after its container was hidden and shown again. */
  resize(): void;
}

interface Props {
  events: WatchEvent[];
  vessels: VesselLite[];
  /** Recent positions of the selected ship. */
  track: [number, number][] | null;
  hz: HormuzBundle | null;
  layers: Layers;
  selection: Selection;
  hoverEvent: string | null;
  theme: string;
  /** Pixels of the chart covered at the bottom, by the phone's sheet, so flights land in the visible part. */
  coveredBottom?: number;
  onSelect(sel: Selection): void;
  onHoverEvent(id: string | null): void;
  handle?: React.Ref<ChartHandle>;
  children?: React.ReactNode;
}

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const HOME: [[number, number], [number, number]] = [[31.5, 3.5], [61.5, 30.8]];
/** How far from a tap a ship, port or report still counts as tapped. */
const TAP_SLOP = 14;
/** Below this zoom ships show as a density glow; above it, one by one. */
const SHIPS_FROM = 5.4;
const SHIP_LAYERS = ["ships-dark", "ships", "ships-anchored"];
/** Below this zoom only the major ports are drawn, so the wide view stays readable. */
const PORTS_ALL_FROM = 5.6;
const PORT_LAYERS = ["ports", "ports-minor"];

/** Ports drawn at the widest zoom, most important first: when labels collide, the earlier one keeps its name. */
const MAJOR_ORDER = [
  "jebel-ali", "dammam", "bandar-abbas", "hamad", "fujairah", "sohar", "jeddah", "suez", "djibouti", "aden",
  "hodeidah", "port-sudan", "salalah", "duqm", "king-abdullah", "aqaba", "berbera", "bosaso", "mogadishu",
];
const MAJOR_PORTS = new Set(MAJOR_ORDER);

type ZoomBand = "far" | "near" | "close";
const bandAt = (z: number): ZoomBand => (z >= 7.5 ? "close" : z >= 6 ? "near" : "far");

const geo = (name: string) => `/geo/${name}.json`;
const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** "#849e34" → "rgba(132,158,52,0.5)", for colours the map needs with transparency. */
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(0,0,0,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const shipColor = (t: Record<string, string>): ExpressionSpecification => [
  "case", ["get", "u"], t.olive,
  ["match", ["get", "g"], "tanker", t["ship-tanker"], "cargo", t["ship-cargo"], t["ship-other"]],
];

function baseStyle(t: Record<string, string>, night: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      land: { type: "geojson", data: geo("land") },
      islands: { type: "geojson", data: geo("islands") },
      borders: { type: "geojson", data: geo("borders") },
      d200: { type: "geojson", data: geo("depth-200") },
      d1000: { type: "geojson", data: geo("depth-1000") },
      d3000: { type: "geojson", data: geo("depth-3000") },
      reefs: { type: "geojson", data: geo("reefs") },
      areas: { type: "geojson", data: empty() },
      hz: { type: "geojson", data: empty() },
      ports: { type: "geojson", data: empty() },
      events: { type: "geojson", data: empty(), promoteId: "id" },
      ships: { type: "geojson", data: empty(), promoteId: "id" },
      track: { type: "geojson", data: empty() },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": t["sea-shallow"] } },
      { id: "d200", type: "fill", source: "d200", paint: { "fill-color": t["sea-200"] } },
      { id: "d200-line", type: "line", source: "d200", paint: { "line-color": t["ink-3"], "line-width": 0.5, "line-opacity": 0.45, "line-dasharray": [1, 3] } },
      { id: "d1000", type: "fill", source: "d1000", paint: { "fill-color": t["sea-1000"] } },
      { id: "d3000", type: "fill", source: "d3000", paint: { "fill-color": t["sea-3000"] } },
      { id: "reefs", type: "line", source: "reefs", paint: { "line-color": t["ink-3"], "line-width": 0.8, "line-dasharray": [0.5, 1.5] } },
      {
        id: "density", type: "heatmap", source: "ships", maxzoom: 7.2,
        filter: ["!", ["get", "d"]],
        paint: {
          "heatmap-weight": ["case", ["get", "m"], 1, 0.6],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2.8, 5, 5, 10, 7, 16, 9, 22],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2.8, 0.4, 6, 0.9, 9, 1.3],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 4.5, 0.95, 6, 0.4, 7, 0],
          "heatmap-color": night
            ? ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.12, rgba(t.olive, 0.22), 0.35, rgba(t.olive, 0.5), 0.65, rgba(t.olive, 0.72), 1, rgba(t.olive, 0.9)]
            : ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.12, rgba(t.olive, 0.2), 0.35, rgba(t.olive, 0.48), 0.65, rgba(t["olive-ink"], 0.66), 1, rgba(t["olive-ink"], 0.84)],
        },
      },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": t.land } },
      { id: "islands", type: "fill", source: "islands", paint: { "fill-color": t.land } },
      { id: "coast", type: "line", source: "land", paint: { "line-color": t["land-edge"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 1.2] } },
      { id: "island-coast", type: "line", source: "islands", paint: { "line-color": t["land-edge"], "line-width": 0.6 } },
      { id: "borders", type: "line", source: "borders", paint: { "line-color": t["border-line"], "line-width": 0.8, "line-dasharray": [4, 2, 1, 2] } },
      { id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": t.magenta, "fill-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.07, 0.025] } },
      { id: "areas-line", type: "line", source: "areas", paint: { "line-color": t.magenta, "line-width": 1.4, "line-dasharray": [3, 2], "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 7, 0.3] } },
      { id: "hz-lanes", type: "line", source: "hz", filter: ["==", ["get", "kind"], "lane"], minzoom: 5.5, paint: { "line-color": t["ink-3"], "line-width": 1, "line-opacity": 0.55, "line-dasharray": [6, 3] } },
      { id: "hz-area-fill", type: "fill", source: "hz", filter: ["==", ["get", "kind"], "area"], minzoom: 5.5, paint: { "fill-color": t.olive, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0, 7, 0.07] } },
      { id: "hz-area-line", type: "line", source: "hz", filter: ["==", ["get", "kind"], "area"], minzoom: 5.5, paint: { "line-color": t["olive-ink"], "line-width": 1.3, "line-dasharray": [0.6, 1.6], "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0, 6.5, 0.7] } },
      { id: "hz-gate", type: "line", source: "hz", filter: ["==", ["get", "kind"], "gate"], paint: { "line-color": t.magenta, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.4, 9, 2.6], "line-dasharray": [2.5, 1.5] } },
      { id: "track", type: "line", source: "track", paint: { "line-color": t.magenta, "line-width": 1.8, "line-dasharray": [2, 1.5] } },
      {
        id: "ships-anchored", type: "circle", source: "ships", minzoom: SHIPS_FROM,
        filter: ["all", ["!", ["get", "m"]], ["!", ["get", "d"]]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], SHIPS_FROM, 1.1, 8, 2.4, 11, 4.2],
          "circle-color": shipColor(t),
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], SHIPS_FROM, 0, 6.3, 0.85],
          "circle-stroke-color": t.paper,
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 0.8],
        },
      },
      {
        id: "ships", type: "symbol", source: "ships", minzoom: SHIPS_FROM,
        filter: ["all", ["get", "m"], ["!", ["get", "d"]]],
        layout: {
          "icon-image": ["case", ["get", "u"], "ship-unifeeder", ["concat", "ship-", ["get", "g"]]],
          "icon-rotate": ["get", "c"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], SHIPS_FROM, 0.42, 7, 0.68, 10, 1],
        },
        paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], SHIPS_FROM, 0, 6.3, 0.95] },
      },
      {
        id: "ships-dark", type: "symbol", source: "ships",
        filter: ["get", "d"],
        layout: {
          "icon-image": "ship-dark",
          "icon-rotate": ["get", "c"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 7, 0.8, 10, 1],
        },
      },
      {
        id: "ship-selected", type: "circle", source: "ships", filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 15, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": t.magenta, "circle-stroke-width": 2 },
      },
      ...(["", "-minor"] as const).flatMap((suffix) => {
        const major = suffix === "";
        const only: ExpressionSpecification = major ? ["get", "major"] : ["!", ["get", "major"]];
        const from = major ? {} : { minzoom: PORTS_ALL_FROM };
        return [
          {
            id: `port-rings${suffix}`, type: "circle", source: "ports", ...from, filter: ["all", only, ["!=", ["get", "band"], "none"]],
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 9, 8, 14],
              "circle-color": "rgba(0,0,0,0)",
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 8, 3],
              "circle-stroke-color": ["match", ["get", "band"], "low", t["sev-high"], "reduced", t["sev-elevated"], t.olive],
            },
          },
          {
            id: `ports${suffix}`, type: "symbol", source: "ports", ...from, filter: only,
            layout: { "icon-image": "anchor", "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 8, 1] },
          },
        ] as LayerSpecification[];
      }),
      {
        id: "events-halo", type: "circle", source: "events",
        paint: {
          "circle-radius": 18,
          "circle-color": t.magenta,
          "circle-opacity": ["case", ["boolean", ["feature-state", "hot"], false], 0.18, 0],
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "hot"], false], 1.5, 0],
          "circle-stroke-color": t.magenta,
        },
      },
      {
        id: "events", type: "symbol", source: "events",
        layout: {
          "icon-image": ["concat", "inc-", ["get", "severity"]],
          "icon-allow-overlap": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 8, 1],
          "symbol-sort-key": ["get", "rank"],
        },
      },
    ],
  };
}

function addIcons(map: MLMap, t: Record<string, string>) {
  const put = (id: string, img: ImageData) => {
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, img, { pixelRatio: ICON_PIXEL_RATIO });
  };
  put("ship-tanker", shipIcon(t["ship-tanker"], t.paper));
  put("ship-cargo", shipIcon(t["ship-cargo"], t.paper));
  put("ship-other", shipIcon(t["ship-other"], t.paper));
  put("ship-unifeeder", shipIcon(t.olive, t.ink));
  put("ship-dark", shipIcon(t.magenta, t.paper, true));
  put("anchor", anchorIcon(t.ink, t.paper));
  put("inc-low", incidentIcon(t["sev-low"], t.paper, "none"));
  put("inc-elevated", incidentIcon(t["sev-elevated"], t.paper, "none"));
  put("inc-high", incidentIcon(t["sev-high"], t.paper, "single"));
  put("inc-critical", incidentIcon(t["sev-critical"], t.paper, "double"));
}

const SEV_RANK = { low: 0, elevated: 1, high: 2, critical: 3 } as const;
const GROUP_WORD = { tanker: "Tanker", cargo: "Cargo", other: "Other" };

interface Tip { x: number; y: number; title: string; sub: string }

export default function ChartMap(
  { events, vessels, track, hz, layers, selection, hoverEvent, theme, coveredBottom = 0, onSelect, onHoverEvent, handle, children }: Props,
) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [map, setMap] = useState<MLMap | null>(null);
  const [zoomBand, setZoomBand] = useState<ZoomBand>("far");
  const [tip, setTip] = useState<Tip | null>(null);
  const handlers = useRef({ onSelect, onHoverEvent });
  handlers.current = { onSelect, onHoverEvent };
  const byId = useRef(new Map<string, VesselLite>());
  // False while the chart still shows the whole region as it opened; then a resize re-fits the region.
  const moved = useRef(false);
  const covered = useRef(coveredBottom);
  covered.current = coveredBottom;
  const padding = (inset?: number) => ({ top: 0, left: 0, right: 0, bottom: inset ?? covered.current });
  const homePad = (inset?: number) => {
    const side = (host.current?.clientWidth ?? 1000) < 600 ? 14 : 30;
    // On a laptop the layers key stands at the left of the chart; fit the region beside it.
    const key = host.current?.parentElement?.querySelector<HTMLElement>('.chart__legend[data-open="true"]')?.offsetWidth ?? 0;
    return { top: 30, left: key ? key + 44 : side, right: side, bottom: 30 + (inset ?? covered.current) };
  };

  useImperativeHandle(handle, () => ({
    snapshot() {
      const m = mapRef.current;
      if (!m) return null;
      m.triggerRepaint();
      return m.getCanvas().toDataURL("image/png");
    },
    flyToZone(zone, inset) {
      const m = mapRef.current;
      if (!m) return;
      moved.current = !!zone;
      if (!zone) m.fitBounds(HOME, { padding: homePad(inset), absolutePadding: true, duration: 1400 });
      else m.flyTo({ center: ZONE_BY_ID[zone].center, zoom: ZONE_BY_ID[zone].zoom, padding: padding(inset), duration: 1600, essential: true });
    },
    flyTo(position, zoom = 7.5, inset) {
      moved.current = true;
      mapRef.current?.flyTo({ center: position, zoom: Math.max(zoom, mapRef.current.getZoom()), padding: padding(inset), duration: 1200 });
    },
    resize() { mapRef.current?.resize(); },
  }), []);

  // Create the map once.
  useEffect(() => {
    if (!host.current) return;
    const t = readTokens();
    const m = new maplibregl.Map({
      container: host.current,
      style: baseStyle(t, document.documentElement.dataset.theme === "night"),
      bounds: HOME,
      fitBoundsOptions: { padding: homePad() },
      // Low enough that a portrait phone can show the whole region at once.
      minZoom: 2.8,
      maxBounds: [[18, -10], [76, 40]],
      maxZoom: 12.5,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: {
        compact: true,
        customAttribution: "Coast and depths: Natural Earth · Ships: hormuz.now (CC BY 4.0), VesselAPI, AIS · Port calls: IMF PortWatch",
      },
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    m.touchZoomRotate.disableRotation();
    m.on("load", () => {
      // Start with the attribution folded to its (i) button so it never covers the chart.
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      // Re-fit now that the phone sheet has been measured, so the whole region sits above it.
      if (covered.current) m.fitBounds(HOME, { padding: homePad(), absolutePadding: true, duration: 0 });
      addIcons(m, t);
      (m.getSource("areas") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: ZONES.map((z, i) => ({ type: "Feature", id: i, properties: { id: z.id }, geometry: { type: "Polygon", coordinates: [z.area] } })),
      });
      mapRef.current = m;
      setMap(m);
      setZoomBand(bandAt(m.getZoom()));
      // Lets the local screenshot scripts find ships on the chart; never in production.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __slwMap?: MLMap }).__slwMap = m;
    });

    // Nearest feature within a finger's width of the tap, not only what is exactly under it.
    const pick = (layers: string[], e: MapMouseEvent) => {
      const { x, y } = e.point;
      const live = layers.filter((l) => m.getLayer(l));
      if (!live.length) return undefined;
      const found = m.queryRenderedFeatures([[x - TAP_SLOP, y - TAP_SLOP], [x + TAP_SLOP, y + TAP_SLOP]], { layers: live });
      let best: (typeof found)[number] | undefined;
      let bestD = Infinity;
      for (const f of found) {
        if (f.geometry.type !== "Point") continue;
        const p = m.project(f.geometry.coordinates as [number, number]);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      }
      return best;
    };

    m.on("click", (e: MapMouseEvent) => {
      const ev = pick(["events"], e);
      if (ev) return handlers.current.onSelect({ kind: "event", id: String(ev.properties.id) });
      const port = pick(PORT_LAYERS, e);
      if (port) return handlers.current.onSelect({ kind: "port", id: String(port.properties.id) });
      const v = pick(SHIP_LAYERS, e);
      if (v) return handlers.current.onSelect({ kind: "vessel", id: String(v.properties.id) });
      // A tap on the glow at wide zoom takes you in to where the ships are.
      if (m.getZoom() < SHIPS_FROM) {
        const near = m.queryRenderedFeatures([[e.point.x - 20, e.point.y - 20], [e.point.x + 20, e.point.y + 20]], { layers: ["ships-dark"] });
        if (!near.length && byId.current.size) {
          let count = 0;
          for (const s of byId.current.values()) {
            const p = m.project([s.lon, s.lat]);
            if (Math.abs(p.x - e.point.x) < 24 && Math.abs(p.y - e.point.y) < 24) count++;
            if (count > 2) break;
          }
          if (count > 2) m.flyTo({ center: e.lngLat, zoom: 7, padding: padding(), duration: 1100 });
        }
      }
    });

    let lastHover: string | null = null;
    let lastTip: string | null = null;
    m.on("mousemove", (e: MapMouseEvent) => {
      const live = ["events", ...PORT_LAYERS, ...SHIP_LAYERS].filter((l) => m.getLayer(l));
      const f = m.queryRenderedFeatures(e.point, { layers: live })[0];
      m.getCanvas().style.cursor = f ? "pointer" : "";
      const id = f?.layer.id === "events" ? String(f.properties.id) : null;
      if (id !== lastHover) { lastHover = id; handlers.current.onHoverEvent(id); }
      const ship = f && SHIP_LAYERS.includes(f.layer.id) ? byId.current.get(String(f.properties.id)) : undefined;
      if (ship) {
        const sub = ship.dark
          ? "Signal lost"
          : `${ship.unifeeder ? "Unifeeder" : GROUP_WORD[ship.group]} · ${ship.moving ? `${ship.sog.toFixed(1)} kn` : "stopped"}${ship.destination ? ` · ${ship.destination}` : ""}`;
        lastTip = ship.id;
        setTip({ x: e.point.x, y: e.point.y, title: ship.name, sub });
      } else if (lastTip) {
        lastTip = null;
        setTip(null);
      }
    });
    m.on("mouseout", () => { lastTip = null; setTip(null); });
    m.on("zoom", () => setZoomBand(bandAt(m.getZoom())));
    // A hand on the chart means the reader has chosen a view; keep it through later resizes.
    m.on("movestart", (e) => { if ((e as { originalEvent?: Event }).originalEvent) moved.current = true; });
    // The chart can open hidden at another size (under a page on a laptop); show the whole region once it is seen.
    m.on("resize", () => { if (!moved.current) m.fitBounds(HOME, { padding: homePad(), absolutePadding: true, duration: 0 }); });
    m.on("movestart", () => { if (lastTip) { lastTip = null; setTip(null); } });

    return () => { m.remove(); mapRef.current = null; };
  }, []);

  // Re-ink the chart when the theme changes.
  useEffect(() => {
    if (!map) return;
    const t = readTokens();
    const fresh = baseStyle(t, theme === "night");
    for (const layer of fresh.layers) {
      const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
      for (const [k, v] of Object.entries(paint)) map.setPaintProperty(layer.id, k as never, v as never);
    }
    addIcons(map, t);
  }, [map, theme]);

  // Events
  useEffect(() => {
    if (!map) return;
    (map.getSource("events") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: events.map((e) => ({
        type: "Feature",
        id: e.id,
        properties: { id: e.id, severity: e.severity, rank: SEV_RANK[e.severity] },
        geometry: { type: "Point", coordinates: e.position },
      })),
    });
  }, [map, events]);

  // Ports, ringed by how their calls compare with before the crisis.
  const pw = hz?.ports?.ports;
  useEffect(() => {
    if (!map) return;
    const bySlug = new Map((pw ?? []).map((p) => [p.slug, p]));
    (map.getSource("ports") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: PORTS.map((p) => {
        const s = PORT_PORTWATCH[p.id] ? bySlug.get(PORT_PORTWATCH[p.id]) : undefined;
        return {
          type: "Feature",
          properties: { id: p.id, major: MAJOR_PORTS.has(p.id), band: s && !s.lowBase ? callsBand(s.pctCalls) : "none" },
          geometry: { type: "Point", coordinates: p.position },
        };
      }),
    });
  }, [map, pw]);

  // hormuz.now's anchorages, counting line and traffic lanes.
  const hzGeo = hz?.geo;
  useEffect(() => {
    if (!map || !hzGeo) return;
    (map.getSource("hz") as GeoJSONSource).setData(hzGeo as unknown as FeatureCollection);
  }, [map, hzGeo]);

  // Ships: short property names keep the 1,600-ship update light.
  useEffect(() => {
    if (!map) return;
    byId.current = new Map(vessels.map((v) => [v.id, v]));
    const shown = vessels.filter((v) => (v.dark ? layers.dark : v.unifeeder ? layers.unifeeder : true));
    (map.getSource("ships") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((v) => ({
        type: "Feature",
        properties: { id: v.id, c: v.course, g: v.group, m: v.moving, d: v.dark, u: v.unifeeder },
        geometry: { type: "Point", coordinates: [v.lon, v.lat] },
      })),
    });
  }, [map, vessels, layers.dark, layers.unifeeder]);

  // Layer switches
  useEffect(() => {
    if (!map) return;
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    for (const id of [...PORT_LAYERS, "port-rings", "port-rings-minor"]) vis(id, layers.ports);
    vis("events", layers.events);
    vis("events-halo", layers.events);
    vis("areas-fill", layers.areas);
    vis("areas-line", layers.areas);
    vis("ships", layers.ships);
    vis("ships-anchored", layers.anchored);
    vis("density", layers.density);
    for (const id of ["hz-lanes", "hz-area-fill", "hz-area-line", "hz-gate"]) vis(id, layers.hormuz);
  }, [map, layers]);

  // Selected ship: a ring, and its recent track.
  const selectedShip = selection?.kind === "vessel" ? selection.id : "";
  useEffect(() => {
    if (!map) return;
    map.setFilter("ship-selected", ["==", ["get", "id"], selectedShip]);
    (map.getSource("track") as GeoJSONSource).setData(
      selectedShip && track && track.length > 1
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }] }
        : empty(),
    );
  }, [map, selectedShip, track]);

  // Hover and selection glow on incidents
  const prevHot = useRef<string[]>([]);
  const markHot = useCallback((ids: string[]) => {
    if (!map) return;
    for (const id of prevHot.current) map.setFeatureState({ source: "events", id }, { hot: false });
    for (const id of ids) map.setFeatureState({ source: "events", id }, { hot: true });
    prevHot.current = ids;
  }, [map]);
  useEffect(() => {
    const ids = [hoverEvent, selection?.kind === "event" ? selection.id : null].filter(Boolean) as string[];
    markHot(ids);
  }, [hoverEvent, selection, markHot, events]);

  return (
    <div className="chart" data-zoom={zoomBand}>
      <div ref={host} className="chart__map" data-tour="chart" role="region" aria-label="Live chart of the Gulf, Red Sea and Gulf of Aden" />
      {map && <ChartLabels map={map} hz={hz} showPorts={layers.ports} showHz={layers.hormuz} zoomBand={zoomBand} />}
      {map && <Neatline map={map} />}
      <Compass />
      {tip && (
        <div className="shiptip" style={{ transform: `translate(${tip.x + 14}px, ${tip.y - 12}px)` }} aria-hidden="true">
          <b>{tip.title}</b>
          <span>{tip.sub}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** Rough centre of a polygon's outer ring, good enough to hang a label on. */
function ringCentre(f: Feature<Polygon>): [number, number] {
  const ring = f.geometry.coordinates[0];
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return [x / ring.length, y / ring.length];
}

/**
 * Water names in spaced italic capitals, port names with their share of
 * normal calls, and the names of the anchorages with ships waiting, all as
 * HTML so the chart needs no font server.
 */
function ChartLabels({ map, hz, showPorts, showHz, zoomBand }: { map: MLMap; hz: HormuzBundle | null; showPorts: boolean; showHz: boolean; zoomBand: ZoomBand }) {
  const ports = hz?.ports?.ports;
  const areas = hz?.areas?.areas;
  const waits = hz?.areas?.waiting?.areas;
  const geoFeatures = hz?.geo?.features;
  useEffect(() => {
    const markers: maplibregl.Marker[] = [];
    // Every label with its rank (lower wins a collision) and whether it may swap to the left of its point.
    const labels: { el: HTMLElement; rank: number; flip?: boolean; at?: [number, number] }[] = [];
    const WATER: [string, [number, number], boolean][] = [
      ["Arabian Gulf", [50.6, 28.0], true],
      ["Gulf of Oman", [61.0, 23.7], true],
      ["Strait of Hormuz", [56.95, 26.75], false],
      ["Red Sea", [40.0, 17.8], true],
      ["Gulf of Aden", [48.6, 13.3], true],
      ["Arabian Sea", [60.0, 16.0], true],
      ["Somali Basin", [51.6, 3.4], true],
    ];
    for (const [name, pos, always] of WATER) {
      if (!always && zoomBand === "far") continue;
      const el = document.createElement("div");
      el.className = "water-label";
      el.textContent = name;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map));
      // Sea names give way only to the three biggest Gulf ports.
      labels.push({ el, rank: 2.5 });
    }
    if (showPorts) {
      const bySlug = new Map((ports ?? []).map((p) => [p.slug, p]));
      // At the widest zoom a phone has no room for the percentages; the coloured rings carry the same news.
      const pct = zoomBand !== "far" || map.getContainer().clientWidth >= 900;
      for (const [i, p] of PORTS.entries()) {
        const major = MAJOR_ORDER.indexOf(p.id);
        if (zoomBand === "far" && major < 0) continue;
        const s = PORT_PORTWATCH[p.id] ? bySlug.get(PORT_PORTWATCH[p.id]) : undefined;
        const el = document.createElement("div");
        el.className = "port-label";
        el.textContent = p.name;
        if (pct && s && !s.lowBase) {
          const b = document.createElement("b");
          b.className = "port-label__pct";
          b.dataset.band = callsBand(s.pctCalls);
          b.textContent = `${Math.round(s.pctCalls)}%`;
          b.title = "Port calls against before the crisis";
          el.append(b);
        }
        markers.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [13, 0] }).setLngLat(p.position).addTo(map));
        labels.push({ el, rank: major < 0 ? 100 + i : major, flip: true, at: p.position });
      }
    }
    if (showHz && geoFeatures && zoomBand !== "far") {
      const waiting = new Map((areas ?? []).map((a) => [a.id, a.waiting]));
      const typical = new Map((waits ?? []).map((a) => [a.id, a.medianHours]));
      for (const f of geoFeatures) {
        if (f.properties.kind === "gate" && f.geometry.type === "LineString") {
          const [[x1, y1], [x2, y2]] = f.geometry.coordinates as [number, number][];
          const el = document.createElement("div");
          el.className = "gate-label";
          el.textContent = "Counting line";
          markers.push(new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] }).setLngLat([(x1 + x2) / 2, (y1 + y2) / 2]).addTo(map));
          labels.push({ el, rank: 2.2 });
        }
        if (zoomBand !== "close" || f.properties.kind !== "area" || f.geometry.type !== "Polygon") continue;
        const n = waiting.get(f.properties.id ?? "") ?? 0;
        if (n < 5) continue;
        const el = document.createElement("div");
        el.className = "anch-label";
        el.innerHTML = "";
        const name = document.createElement("span");
        name.textContent = (f.properties.name ?? "").replace(/ anchorage$/i, "");
        const count = document.createElement("b");
        const h = typical.get(f.properties.id ?? "");
        count.textContent = h ? `${n} waiting · ${h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`} typical` : `${n} waiting`;
        el.append(name, count);
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(ringCentre(f as unknown as Feature<Polygon>)).addTo(map));
        labels.push({ el, rank: 2.3 });
      }
    }

    // Keep the chart readable: a label that would run off the right edge moves to the left of its port,
    // and a label that still overlaps a more important one, another port's anchor, or the edge, is hidden until you zoom in.
    labels.sort((a, b) => a.rank - b.rank);
    let frame = 0;
    const declutter = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = map.getContainer().getBoundingClientRect();
        const overlaps = (r: DOMRect, k: DOMRect) => r.left < k.right + 3 && r.right > k.left - 3 && r.top < k.bottom + 1 && r.bottom > k.top - 1;
        const off = (r: DOMRect) => r.left < box.left + 2 || r.right > box.right - 2 || r.top < box.top || r.bottom > box.bottom;
        const anchors = labels.flatMap((l) => {
          if (!l.at) return [];
          const p = map.project(l.at);
          return [{ l, r: new DOMRect(box.left + p.x - 7, box.top + p.y - 7, 14, 14) }];
        });
        const kept: DOMRect[] = [];
        for (const l of labels) {
          l.el.style.visibility = "";
          l.el.style.marginLeft = "";
          const right = l.el.getBoundingClientRect();
          // A port's name may not cover a more important port's anchor; sea names only avoid other names.
          const clear = (r: DOMRect) => !off(r) && !kept.some((k) => overlaps(r, k)) && (!l.at || !anchors.some((a) => a.l.rank < l.rank && overlaps(r, a.r)));
          if (clear(right)) { kept.push(right); continue; }
          if (l.flip) {
            const shift = right.width + 26;
            const left = new DOMRect(right.left - shift, right.top, right.width, right.height);
            if (clear(left)) { l.el.style.marginLeft = `${-shift}px`; kept.push(left); continue; }
          }
          l.el.style.visibility = "hidden";
        }
      });
    };
    declutter();
    map.on("moveend", declutter);
    map.on("resize", declutter);
    document.fonts?.ready.then(declutter);
    return () => {
      cancelAnimationFrame(frame);
      map.off("moveend", declutter);
      map.off("resize", declutter);
      markers.forEach((m) => m.remove());
    };
  }, [map, ports, areas, waits, geoFeatures, showPorts, showHz, zoomBand]);
  return null;
}
