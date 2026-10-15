import { describe, expect, it } from "vitest";
import { AisTracker, DARK_AFTER_MS, isDark } from "./ais";
import { store, uniqueByUrl } from "./store";
import type { ClassifiedItem } from "./types";

const position = (mmsi: number, lon: number, lat: number, at: string, name = "TEST SHIP") => ({
  MessageType: "PositionReport",
  MetaData: { MMSI: mmsi, ShipName: name, latitude: lat, longitude: lon, time_utc: at },
  Message: { PositionReport: { Sog: 12, Cog: 90, TrueHeading: 91 } },
});

describe("ship feed", () => {
  it("builds a track and counts a Hormuz transit when the gate line is crossed", () => {
    const t = new AisTracker();
    t.ingest(position(1, 56.1, 26.3, "2026-10-15 06:00:00.000000000 +0000 UTC"));
    t.ingest(position(1, 56.4, 26.5, "2026-10-15 06:10:00.000000000 +0000 UTC"));
    const [v] = t.changed();
    expect(v.track).toHaveLength(2);
    expect(v.zone).toBe("hormuz");
    expect(t.transits.map((x) => x.chokepoint)).toEqual(["hormuz"]);
  });

  it("tags Unifeeder ships by name", () => {
    const t = new AisTracker();
    t.ingest(position(2, 55.0, 25.5, "2026-10-15 06:00:00 +0000 UTC", "UNIFEEDER EXPRESS"));
    expect(t.changed()[0].unifeeder).toBe(true);
  });

  it("calls a ship dark only after two hours of listening, and never near a port", () => {
    const lastSeen = "2026-10-15T00:00:00.000Z";
    const atSea = { mmsi: 3, name: "X", lon: 59.5, lat: 24.2, sog: 11, cog: 0, lastSeen, zone: "hormuz" as const, dark: false, track: [] };
    const seen = Date.parse(lastSeen);
    expect(isDark(atSea, seen + DARK_AFTER_MS - 1)).toBe(false);
    expect(isDark(atSea, seen + DARK_AFTER_MS + 1)).toBe(true);
    // Moored at Jebel Ali: not dark, just in port.
    expect(isDark({ ...atSea, lon: 55.03, lat: 25.01 }, seen + 10 * DARK_AFTER_MS)).toBe(false);
  });
});

describe("store without a database", () => {
  it("lets one refresh run at a time", async () => {
    const s = store();
    expect(await s.claimRefresh(60_000)).toBe(true);
    expect(await s.claimRefresh(60_000)).toBe(false);
    expect(await s.claimRefresh(0)).toBe(true);
  });

  it("counts transits in a time window and merges meta", async () => {
    const s = store();
    const now = Date.now();
    await s.addTransits([
      { chokepoint: "hormuz", mmsi: 1, at: new Date(now - 3600_000).toISOString() },
      { chokepoint: "hormuz", mmsi: 2, at: new Date(now - 30 * 3600_000).toISOString() },
    ]);
    expect((await s.transitsSince(now - 24 * 3600_000)).hormuz).toBe(1);
    await s.putMeta({ lastRefresh: "a" });
    await s.putMeta({ aisConnected: true });
    expect(await s.meta()).toMatchObject({ lastRefresh: "a", aisConnected: true });
  });
});

describe("saving reports", () => {
  it("sends each story once when two feeds return the same link", () => {
    const item = (url: string, title: string) => ({ url, title } as unknown as ClassifiedItem);
    const out = uniqueByUrl([item("a", "first"), item("b", "other"), item("a", "second")]);
    expect(out.map((i) => i.url)).toEqual(["a", "b"]);
    expect(out[0].title).toBe("second");
  });
});
