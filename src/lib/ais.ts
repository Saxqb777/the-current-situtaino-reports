import WebSocket from "ws";
import { AIS_BOXES, CHOKEPOINTS, PORTS, distanceNm, segmentsCross, zoneAt } from "./geo";
import type { Vessel, ZoneId } from "./types";

const ENDPOINT = "wss://stream.aisstream.io/v0/stream";
/** A ship that stops reporting for this long while at sea in a watch zone is flagged as dark. */
export const DARK_AFTER_MS = 2 * 3600_000;
const FORGET_AFTER_MS = 24 * 3600_000;
const TRACK_POINTS = 60;
const TRACK_SPACING_MS = 3 * 60_000;

/**
 * Vessels to tag as Unifeeder. AIS does not carry the operator, so the fleet
 * is matched by MMSI (set UNIFEEDER_MMSI as a comma-separated list) or by name.
 */
const UNIFEEDER_MMSI = new Set((process.env.UNIFEEDER_MMSI ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean));
const UNIFEEDER_NAME = /^(UNIFEEDER|UNI[- ]?FEEDER)\b/i;

export interface TrackedVessel extends Vessel { unifeeder: boolean; length?: number }

interface AisMessage {
  MessageType: string;
  MetaData: { MMSI: number; ShipName?: string; latitude: number; longitude: number; time_utc: string };
  Message: Record<string, Record<string, unknown>>;
}

export class AisTracker {
  vessels = new Map<number, TrackedVessel>();
  transits = new Map<string, number[]>(CHOKEPOINTS.map((c) => [c.id, []]));
  connected = false;
  lastMessage: string | null = null;
  private ws: WebSocket | null = null;
  private retry = 0;

  constructor(private readonly apiKey: string | undefined) {}

  get configured() { return Boolean(this.apiKey); }

  start() {
    if (!this.apiKey || this.ws) return;
    const ws = new WebSocket(ENDPOINT);
    this.ws = ws;
    ws.on("open", () => {
      this.connected = true;
      this.retry = 0;
      ws.send(JSON.stringify({
        APIKey: this.apiKey,
        BoundingBoxes: AIS_BOXES,
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
      }));
    });
    ws.on("message", (buf) => {
      try { this.ingest(JSON.parse(buf.toString()) as AisMessage); } catch { /* skip malformed frames */ }
    });
    const reconnect = () => {
      this.connected = false;
      this.ws = null;
      const wait = Math.min(60_000, 2000 * 2 ** this.retry++);
      setTimeout(() => this.start(), wait).unref?.();
    };
    ws.on("close", reconnect);
    ws.on("error", () => ws.close());
  }

  ingest(msg: AisMessage, now = Date.now()) {
    const { MMSI, ShipName, latitude, longitude, time_utc } = msg.MetaData;
    if (!MMSI) return;
    this.lastMessage = new Date(now).toISOString();
    const v = this.vessels.get(MMSI) ?? this.blank(MMSI, ShipName);

    if (msg.MessageType === "ShipStaticData") {
      const s = msg.Message.ShipStaticData ?? {};
      v.name = String(s.Name ?? v.name).trim() || v.name;
      v.callSign = String(s.CallSign ?? "").trim() || v.callSign;
      v.shipType = Number(s.Type) || v.shipType;
      v.destination = String(s.Destination ?? "").trim() || v.destination;
      const dim = s.Dimension as { A?: number; B?: number } | undefined;
      if (dim?.A != null && dim?.B != null) v.length = dim.A + dim.B;
      v.unifeeder = UNIFEEDER_MMSI.has(MMSI) || UNIFEEDER_NAME.test(v.name);
      this.vessels.set(MMSI, v);
      return;
    }

    const r = msg.Message.PositionReport ?? msg.Message.StandardClassBPositionReport;
    if (!r || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) return;
    const pos: [number, number] = [longitude, latitude];
    const seen = Date.parse(time_utc.replace(" +0000 UTC", "Z").replace(/\.\d+/, "").replace(" ", "T")) || now;

    if (v.track.length) this.countTransit(v.track[v.track.length - 1], pos, seen);

    v.lon = longitude;
    v.lat = latitude;
    v.sog = Number(r.Sog ?? 0);
    v.cog = Number(r.Cog ?? 0);
    const hdg = Number(r.TrueHeading);
    v.heading = hdg >= 0 && hdg < 360 ? hdg : undefined;
    const prevSeen = Date.parse(v.lastSeen);
    if (!v.track.length || seen - prevSeen > TRACK_SPACING_MS) {
      v.track.push(pos);
      if (v.track.length > TRACK_POINTS) v.track.shift();
    }
    v.lastSeen = new Date(seen).toISOString();
    v.zone = zoneAt(pos);
    v.dark = false;
    if (ShipName && v.name.startsWith("MMSI ")) v.name = ShipName.trim();
    v.unifeeder = v.unifeeder || UNIFEEDER_MMSI.has(MMSI) || UNIFEEDER_NAME.test(v.name);
    this.vessels.set(MMSI, v);
  }

  private blank(mmsi: number, name?: string): TrackedVessel {
    return {
      mmsi, name: name?.trim() || `MMSI ${mmsi}`, lon: 0, lat: 0, sog: 0, cog: 0,
      lastSeen: new Date(0).toISOString(), zone: null, dark: false, track: [], unifeeder: false,
    };
  }

  private countTransit(from: [number, number], to: [number, number], at: number) {
    for (const c of CHOKEPOINTS) {
      if (segmentsCross(from, to, c.gate[0], c.gate[1])) this.transits.get(c.id)!.push(at);
    }
  }

  /** Marks ships that went quiet at sea and forgets ones not heard from in a day. */
  sweep(now = Date.now()) {
    for (const [mmsi, v] of this.vessels) {
      const age = now - Date.parse(v.lastSeen);
      if (age > FORGET_AFTER_MS) { this.vessels.delete(mmsi); continue; }
      const nearPort = PORTS.some((p) => distanceNm(p.position, [v.lon, v.lat]) < 8);
      v.dark = age > DARK_AFTER_MS && v.zone !== null && !nearPort && v.sog > 0.5;
    }
    for (const [id, list] of this.transits) {
      this.transits.set(id, list.filter((t) => now - t < 24 * 3600_000));
    }
  }

  transits24h(zone: ZoneId): number | null {
    if (!this.configured) return null;
    const c = CHOKEPOINTS.find((x) => x.zone === zone);
    return c ? this.transits.get(c.id)!.length : null;
  }

  list(): TrackedVessel[] {
    return [...this.vessels.values()].filter((v) => v.track.length > 0);
  }
}
