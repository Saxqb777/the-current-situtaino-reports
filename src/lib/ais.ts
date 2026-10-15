import WebSocket from "ws";
import { AIS_BOXES, CHOKEPOINTS, PORTS, distanceNm, segmentsCross, zoneAt } from "./geo";
import type { Vessel } from "./types";

const ENDPOINT = "wss://stream.aisstream.io/v0/stream";
/** A ship that stops reporting for this long while at sea in a watch zone is flagged as dark. */
export const DARK_AFTER_MS = 2 * 3600_000;
const TRACK_POINTS = 40;
const TRACK_SPACING_MS = 3 * 60_000;

/**
 * Vessels to tag as Unifeeder. AIS does not carry the operator, so the fleet
 * is matched by MMSI (UNIFEEDER_MMSI) or by name (UNIFEEDER_NAMES), both
 * comma-separated, plus any ship whose name starts with "Unifeeder".
 */
const UNIFEEDER_MMSI = new Set((process.env.UNIFEEDER_MMSI ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean));
const UNIFEEDER_NAMES = new Set((process.env.UNIFEEDER_NAMES ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
const UNIFEEDER_PREFIX = /^(UNIFEEDER|UNI[- ]?FEEDER)\b/i;

export const isUnifeeder = (mmsi: number, name: string) =>
  UNIFEEDER_MMSI.has(mmsi) || UNIFEEDER_NAMES.has(name.trim().toUpperCase()) || UNIFEEDER_PREFIX.test(name);

export interface TrackedVessel extends Vessel { unifeeder: boolean; length?: number }

export interface TransitEvent { chokepoint: string; mmsi: number; at: string }

interface AisMessage {
  MessageType: string;
  MetaData: { MMSI: number; ShipName?: string; latitude: number; longitude: number; time_utc: string };
  Message: Record<string, Record<string, unknown>>;
}

/**
 * Holds ship state and folds AIS messages into it. On Vercel it is filled
 * from the database, listens to the feed for a short window, and is saved back.
 */
export class AisTracker {
  vessels = new Map<number, TrackedVessel>();
  transits: TransitEvent[] = [];
  touched = new Set<number>();
  messages = 0;

  constructor(initial: TrackedVessel[] = []) {
    for (const v of initial) this.vessels.set(v.mmsi, v);
  }

  /** Listens to the live feed for `ms` milliseconds, then disconnects. */
  sample(apiKey: string, ms: number): Promise<{ connected: boolean; error?: string; frames: number }> {
    return new Promise((resolve) => {
      const started = Date.now();
      let connected = false;
      let settled = false;
      let frames = 0;
      const ws = new WebSocket(ENDPOINT);
      const finish = (error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* already closed */ }
        resolve({ connected, error, frames });
      };
      const timer = setTimeout(() => finish(), ms);
      ws.on("open", () => {
        connected = true;
        ws.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: AIS_BOXES,
          FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
        }));
      });
      ws.on("message", (buf) => {
        frames++;
        try {
          const msg = JSON.parse(buf.toString()) as AisMessage & { error?: string };
          if (msg.error) return finish(msg.error);
          this.ingest(msg);
        } catch { /* skip malformed frames */ }
      });
      ws.on("error", (err) => finish(err.message));
      // The feed hangs up on a bad key or subscription, sometimes without saying why.
      ws.on("close", (code, reason) => {
        const why = `code ${code}${reason.length ? `, ${reason.toString().slice(0, 120)}` : ""}`;
        if (!connected) return finish(`connection closed (${why})`);
        finish(`feed closed after ${Math.round((Date.now() - started) / 1000)} s (${why})`);
      });
    });
  }

  ingest(msg: AisMessage, now = Date.now()) {
    const { MMSI, ShipName, latitude, longitude, time_utc } = msg.MetaData;
    if (!MMSI) return;
    this.messages++;
    const v = this.vessels.get(MMSI) ?? this.blank(MMSI, ShipName);

    if (msg.MessageType === "ShipStaticData") {
      const s = msg.Message.ShipStaticData ?? {};
      v.name = String(s.Name ?? v.name).trim() || v.name;
      v.callSign = String(s.CallSign ?? "").trim() || v.callSign;
      v.shipType = Number(s.Type) || v.shipType;
      v.destination = String(s.Destination ?? "").trim() || v.destination;
      const dim = s.Dimension as { A?: number; B?: number } | undefined;
      if (dim?.A != null && dim?.B != null) v.length = dim.A + dim.B;
      v.unifeeder = isUnifeeder(MMSI, v.name);
      this.vessels.set(MMSI, v);
      this.touched.add(MMSI);
      return;
    }

    const r = msg.Message.PositionReport ?? msg.Message.StandardClassBPositionReport;
    if (!r || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) return;
    const pos: [number, number] = [+longitude.toFixed(4), +latitude.toFixed(4)];
    const seen = Date.parse(time_utc.replace(" +0000 UTC", "Z").replace(/\.\d+/, "").replace(" ", "T")) || now;

    if (v.track.length) this.countTransit(MMSI, v.track[v.track.length - 1], pos, seen);

    v.lon = pos[0];
    v.lat = pos[1];
    v.sog = Number(r.Sog ?? 0);
    v.cog = Number(r.Cog ?? 0);
    const hdg = Number(r.TrueHeading);
    v.heading = hdg >= 0 && hdg < 360 ? hdg : undefined;
    const prevSeen = Date.parse(v.lastSeen);
    if (!v.track.length || seen - prevSeen > TRACK_SPACING_MS) {
      v.track.push(pos);
      if (v.track.length > TRACK_POINTS) v.track.shift();
    } else {
      v.track[v.track.length - 1] = pos;
    }
    v.lastSeen = new Date(seen).toISOString();
    v.zone = zoneAt(pos);
    v.dark = false;
    if (ShipName && v.name.startsWith("MMSI ")) v.name = ShipName.trim();
    v.unifeeder = isUnifeeder(MMSI, v.name);
    this.vessels.set(MMSI, v);
    this.touched.add(MMSI);
  }

  private blank(mmsi: number, name?: string): TrackedVessel {
    return {
      mmsi, name: name?.trim() || `MMSI ${mmsi}`, lon: 0, lat: 0, sog: 0, cog: 0,
      lastSeen: new Date(0).toISOString(), zone: null, dark: false, track: [], unifeeder: false,
    };
  }

  private countTransit(mmsi: number, from: [number, number], to: [number, number], at: number) {
    for (const c of CHOKEPOINTS) {
      if (segmentsCross(from, to, c.gate[0], c.gate[1])) this.transits.push({ chokepoint: c.id, mmsi, at: new Date(at).toISOString() });
    }
  }

  /** Vessels that changed during this sample and have a position. */
  changed(): TrackedVessel[] {
    return [...this.touched].map((m) => this.vessels.get(m)!).filter((v) => v.track.length > 0);
  }
}

/**
 * A ship is dark when it was last heard at sea inside a watch zone, moving,
 * away from any port, and the feed has heard nothing from it for two hours
 * of listening. Measured against the last sample, not the clock, so a pause
 * in sampling does not turn every ship dark.
 */
export function isDark(v: Vessel, lastSample: number): boolean {
  if (v.zone === null || v.sog <= 0.5) return false;
  if (lastSample - Date.parse(v.lastSeen) < DARK_AFTER_MS) return false;
  return !PORTS.some((p) => distanceNm(p.position, [v.lon, v.lat]) < 8);
}
