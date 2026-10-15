"use client";

import * as maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MLMap, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PORTS, ZONES, ZONE_BY_ID } from "@/lib/geo";
import type { Layers, Selection, VesselLite } from "@/lib/client";
import { readTokens } from "@/lib/client";
import type { WatchEvent, ZoneId } from "@/lib/types";
import { shipGroup } from "@/lib/ui";
import { ICON_PIXEL_RATIO, anchorIcon, incidentIcon, shipIcon } from "./chart-icons";
import Neatline from "./Neatline";
import Compass from "./Compass";

export interface ChartHandle {
  /** PNG of the chart as it looks now, for the PDF briefing. */
  snapshot(): string | null;
  /** `inset`: pixels covered at the bottom when the flight lands, if not the current coveredBottom. */
  flyToZone(zone: ZoneId | null, inset?: number): void;
  flyTo(position: [number, number], zoom?: number, inset?: number): void;
}

interface Props {
  events: WatchEvent[];
  vessels: VesselLite[];
  /** Recent positions of the selected ship. */
  track: [number, number][] | null;
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

/** Ports named at the widest zoom; the rest appear as you zoom in. */
const MAJOR_PORTS = new Set([
  "jebel-ali", "dammam", "sohar", "salalah", "jeddah", "king-abdullah", "djibouti", "aden", "hodeidah",
  "port-sudan", "suez", "bandar-abbas", "mogadishu", "berbera", "duqm", "aqaba", "bosaso",
]);

const geo = (name: string) => `/geo/${name}.json`;
const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

function baseStyle(t: Record<string, string>): StyleSpecification {
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
      ports: { type: "geojson", data: empty() },
      events: { type: "geojson", data: empty(), promoteId: "id" },
      vessels: { type: "geojson", data: empty(), promoteId: "mmsi" },
      track: { type: "geojson", data: empty() },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": t["sea-shallow"] } },
      { id: "d200", type: "fill", source: "d200", paint: { "fill-color": t["sea-200"] } },
      { id: "d200-line", type: "line", source: "d200", paint: { "line-color": t["ink-3"], "line-width": 0.5, "line-opacity": 0.45, "line-dasharray": [1, 3] } },
      { id: "d1000", type: "fill", source: "d1000", paint: { "fill-color": t["sea-1000"] } },
      { id: "d3000", type: "fill", source: "d3000", paint: { "fill-color": t["sea-3000"] } },
      { id: "reefs", type: "line", source: "reefs", paint: { "line-color": t["ink-3"], "line-width": 0.8, "line-dasharray": [0.5, 1.5] } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": t.land } },
      { id: "islands", type: "fill", source: "islands", paint: { "fill-color": t.land } },
      { id: "coast", type: "line", source: "land", paint: { "line-color": t["land-edge"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 1.2] } },
      { id: "island-coast", type: "line", source: "islands", paint: { "line-color": t["land-edge"], "line-width": 0.6 } },
      { id: "borders", type: "line", source: "borders", paint: { "line-color": t["border-line"], "line-width": 0.8, "line-dasharray": [4, 2, 1, 2] } },
      { id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": t.magenta, "fill-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.07, 0.025] } },
      { id: "areas-line", type: "line", source: "areas", paint: { "line-color": t.magenta, "line-width": 1.4, "line-dasharray": [3, 2], "line-opacity": 0.8 } },
      { id: "track", type: "line", source: "track", paint: { "line-color": t.magenta, "line-width": 1.6, "line-dasharray": [2, 1.5] } },
      {
        id: "vessels", type: "symbol", source: "vessels",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-rotate": ["get", "course"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.55, 7, 0.8, 10, 1],
        },
        paint: { "icon-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.25, 0.95] },
      },
      {
        id: "ports", type: "symbol", source: "ports",
        layout: { "icon-image": "anchor", "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 8, 1] },
      },
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

export default function ChartMap(
  { events, vessels, track, layers, selection, hoverEvent, theme, coveredBottom = 0, onSelect, onHoverEvent, handle, children }: Props,
) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [map, setMap] = useState<MLMap | null>(null);
  const [zoomBand, setZoomBand] = useState<"far" | "near">("far");
  const handlers = useRef({ onSelect, onHoverEvent });
  handlers.current = { onSelect, onHoverEvent };
  const covered = useRef(coveredBottom);
  covered.current = coveredBottom;
  const padding = (inset?: number) => ({ top: 0, left: 0, right: 0, bottom: inset ?? covered.current });

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
      if (!zone) m.fitBounds(HOME, { padding: { top: 30, left: 30, right: 30, bottom: 30 + (inset ?? covered.current) }, absolutePadding: true, duration: 1400 });
      else m.flyTo({ center: ZONE_BY_ID[zone].center, zoom: ZONE_BY_ID[zone].zoom, padding: padding(inset), duration: 1600, essential: true });
    },
    flyTo(position, zoom = 7.5, inset) {
      mapRef.current?.flyTo({ center: position, zoom: Math.max(zoom, mapRef.current.getZoom()), padding: padding(inset), duration: 1200 });
    },
  }), []);

  // Create the map once.
  useEffect(() => {
    if (!host.current) return;
    const t = readTokens();
    const m = new maplibregl.Map({
      container: host.current,
      style: baseStyle(t),
      bounds: HOME,
      fitBoundsOptions: { padding: { top: 30, left: 30, right: 30, bottom: 30 + covered.current } },
      // Low enough that a portrait phone can show the whole region at once.
      minZoom: 2.8,
      maxBounds: [[18, -10], [76, 40]],
      maxZoom: 12,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true, customAttribution: "Coastline and depths: Natural Earth · Ship positions: AIS" },
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    m.touchZoomRotate.disableRotation();
    m.on("load", () => {
      // Start with the attribution folded to its (i) button so it never covers the chart.
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      // Re-fit now that the phone sheet has been measured, so the whole region sits above it.
      if (covered.current) m.fitBounds(HOME, { padding: { top: 30, left: 30, right: 30, bottom: 30 + covered.current }, absolutePadding: true, duration: 0 });
      addIcons(m, t);
      (m.getSource("areas") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: ZONES.map((z, i) => ({ type: "Feature", id: i, properties: { id: z.id }, geometry: { type: "Polygon", coordinates: [z.area] } })),
      });
      (m.getSource("ports") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: PORTS.map((p) => ({ type: "Feature", properties: { id: p.id }, geometry: { type: "Point", coordinates: p.position } })),
      });
      mapRef.current = m;
      setMap(m);
    });

    // Nearest feature within a finger's width of the tap, not only what is exactly under it.
    const pick = (layer: string, e: MapMouseEvent) => {
      const { x, y } = e.point;
      const found = m.queryRenderedFeatures([[x - TAP_SLOP, y - TAP_SLOP], [x + TAP_SLOP, y + TAP_SLOP]], { layers: [layer] });
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
      const ev = m.getLayer("events") && pick("events", e);
      if (ev) return handlers.current.onSelect({ kind: "event", id: String(ev.properties.id) });
      const port = pick("ports", e);
      if (port) return handlers.current.onSelect({ kind: "port", id: String(port.properties.id) });
      const v = pick("vessels", e);
      if (v) return handlers.current.onSelect({ kind: "vessel", id: Number(v.properties.mmsi) });
    });
    let lastHover: string | null = null;
    m.on("mousemove", (e: MapMouseEvent) => {
      const f = m.queryRenderedFeatures(e.point, { layers: ["events", "ports", "vessels"] })[0];
      m.getCanvas().style.cursor = f ? "pointer" : "";
      const id = f?.layer.id === "events" ? String(f.properties.id) : null;
      if (id !== lastHover) { lastHover = id; handlers.current.onHoverEvent(id); }
    });
    m.on("zoom", () => setZoomBand(m.getZoom() >= 6 ? "near" : "far"));

    return () => { m.remove(); mapRef.current = null; };
  }, []);

  // Re-ink the chart when the theme changes.
  useEffect(() => {
    if (!map) return;
    const t = readTokens();
    const fresh = baseStyle(t);
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

  // Vessels
  useEffect(() => {
    if (!map) return;
    const shown = vessels.filter((v) => (v.dark ? layers.dark : v.unifeeder ? layers.unifeeder || layers.ships : layers.ships));
    (map.getSource("vessels") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((v) => ({
        type: "Feature",
        id: v.mmsi,
        properties: {
          mmsi: v.mmsi,
          course: v.course,
          icon: v.dark ? "ship-dark" : v.unifeeder ? "ship-unifeeder" : `ship-${shipGroup(v.type)}`,
        },
        geometry: { type: "Point", coordinates: [v.lon, v.lat] },
      })),
    });
  }, [map, vessels, layers.ships, layers.dark, layers.unifeeder]);

  // Layer switches
  useEffect(() => {
    if (!map) return;
    const vis = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("ports", layers.ports);
    vis("events", layers.events);
    vis("events-halo", layers.events);
    vis("areas-fill", layers.areas);
    vis("areas-line", layers.areas);
  }, [map, layers]);

  // Selected ship's track
  useEffect(() => {
    if (!map) return;
    (map.getSource("track") as GeoJSONSource).setData(
      selection?.kind === "vessel" && track && track.length > 1
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }] }
        : empty(),
    );
  }, [map, selection, track]);

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
      {map && <ChartLabels map={map} showPorts={layers.ports} zoomBand={zoomBand} />}
      {map && <Neatline map={map} />}
      <Compass />
      {children}
    </div>
  );
}

/** Water names in spaced italic capitals and port names, as HTML so the chart needs no font server. */
function ChartLabels({ map, showPorts, zoomBand }: { map: MLMap; showPorts: boolean; zoomBand: "far" | "near" }) {
  useEffect(() => {
    const markers: maplibregl.Marker[] = [];
    const WATER: [string, [number, number], boolean][] = [
      ["Arabian Gulf", [51.2, 27.6], true],
      ["Gulf of Oman", [61.0, 23.7], true],
      ["Strait of Hormuz", [56.95, 26.75], false],
      ["Red Sea", [38.6, 20.2], true],
      ["Gulf of Aden", [48.6, 13.3], true],
      ["Arabian Sea", [60.0, 16.0], true],
      ["Somali Basin", [53.0, 4.0], true],
    ];
    for (const [name, pos, always] of WATER) {
      if (!always && zoomBand === "far") continue;
      const el = document.createElement("div");
      el.className = "water-label";
      el.textContent = name;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map));
    }
    if (showPorts) {
      for (const p of PORTS) {
        if (zoomBand === "far" && !MAJOR_PORTS.has(p.id)) continue;
        const el = document.createElement("div");
        el.className = "port-label";
        el.textContent = p.name;
        markers.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [11, 0] }).setLngLat(p.position).addTo(map));
      }
    }
    return () => markers.forEach((m) => m.remove());
  }, [map, showPorts, zoomBand]);
  return null;
}
