import { describe, expect, it } from "vitest";
import { niceMax } from "@/components/viz/scale";
import { readWeeks, weekRanges } from "./congestion";
import { type HzAreas, readSnapshot } from "./hormuz";
import { type CongestionDoc, type CongestionWeek, daysShort, daysWord, isoWeek, portWait, waitLevel, weekStart } from "./waits";
import type { ZoneSummary } from "./types";
import { bottomLine, changesSince, verdict, verdictText, worstLevel } from "./verdict";
import { latestPerShip, spacing } from "./westgulf";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("port waits", () => {
  it("numbers weeks the ISO way, as MarineTraffic does", () => {
    expect(isoWeek(Date.UTC(2026, 9, 15))).toEqual({ year: 2026, week: 42 });
    // 1 January 2027 is a Friday, so it still belongs to the last week of 2026.
    expect(isoWeek(Date.UTC(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(Date.UTC(2027, 0, 4))).toEqual({ year: 2027, week: 1 });
    expect(weekStart(2026, 42)).toBe("2026-10-12");
    expect(weekStart(2027, 1)).toBe("2027-01-04");
  });

  it("asks for the last thirteen weeks, across the new year when needed", () => {
    expect(weekRanges(Date.UTC(2026, 9, 15))).toEqual([{ year: 2026, from: 30, to: 42 }]);
    expect(weekRanges(Date.UTC(2027, 0, 13))).toEqual([
      { year: 2026, from: 43, to: 53 },
      { year: 2027, from: 1, to: 2 },
    ]);
  });

  it("reads MarineTraffic rows as objects or as arrays, skipping rows without a week", () => {
    const fromObjects = readWeeks([{ PORT_ID: "790", YEAR: "2026", WEEK: "41", TIME_ANCH: "1.25", TIME_PORT: "0.8", VESSELS: "40", CALLS: "52" }]);
    expect(fromObjects).toEqual([{ year: 2026, week: 41, start: "2026-10-05", anchorDays: 1.25, portDays: 0.8, ships: 40, calls: 52 }]);
    const fromArrays = readWeeks({ DATA: [[790, 2026, 41, null, null, "", 0.8, 40, 52], [790, null, 40]] });
    expect(fromArrays).toEqual([{ year: 2026, week: 41, start: "2026-10-05", anchorDays: null, portDays: 0.8, ships: 40, calls: 52 }]);
    expect(readWeeks(null)).toEqual([]);
  });

  it("calls a wait congested only when it is both much longer and a day longer than usual", () => {
    expect(waitLevel(3, 1.5)).toBe("high");
    expect(waitLevel(0.6, 0.3)).toBe("normal");
    expect(waitLevel(2.1, 1.5)).toBe("elevated");
    expect(waitLevel(1.6, 1.5)).toBe("normal");
    expect(waitLevel(2, null)).toBe("normal");
    expect(waitLevel(null, 2)).toBeNull();
  });

  const week = (w: number, anchorDays: number | null, portDays = 1): CongestionWeek =>
    ({ year: 2026, week: w, start: weekStart(2026, w), anchorDays, portDays, ships: 10, calls: 12 });

  it("compares the newest finished week with the weeks before it, leaving out the week under way", () => {
    const doc: CongestionDoc = { at: null, ports: { fujairah: { at: "", weeks: [week(42, 9), week(41, 3), week(38, 1), week(39, 1.5), week(40, 2)] } } };
    const w = portWait("fujairah", doc, null, Date.UTC(2026, 9, 15));
    expect(w.measure).toBe("anchor");
    expect(w.latest?.week).toBe(41);
    expect(w.days).toBe(3);
    expect(w.typical).toBe(1.5);
    expect(w.level).toBe("high");
    expect(w.weeks.map((x) => x.week)).toEqual([38, 39, 40, 41, 42]);
  });

  it("falls back to days in port where a port has no anchorage figure", () => {
    const doc: CongestionDoc = { at: null, ports: { aden: { at: "", weeks: [week(40, null, 2), week(41, null, 2.5)] } } };
    const w = portWait("aden", doc, null, Date.UTC(2026, 9, 15));
    expect(w.measure).toBe("port");
    expect(w.days).toBe(2.5);
    expect(w.typical).toBe(2);
  });

  it("adds who is waiting off the port now, from hormuz.now", () => {
    const areas = {
      areas: [{ id: "dubai", name: "Dubai anchorage", waiting: 30, trend: [20, -1, 25, 30] }],
      waiting: { areas: [{ id: "dubai", name: "Dubai anchorage", count: 31, medianHours: 35, over24h: 12, over7d: 2 }] },
    } as unknown as HzAreas;
    const w = portWait("jebel-ali", null, areas, Date.UTC(2026, 9, 15));
    expect(w.days).toBeNull();
    expect(w.live).toMatchObject({ area: "dubai", areaName: "Dubai", waiting: 31, medianHours: 35, trend: [20, 25, 30] });
    expect(portWait("aden", null, areas, Date.UTC(2026, 9, 15)).live).toBeNull();
  });

  it("writes short waits in hours and long ones in days", () => {
    expect(daysWord(0.4)).toBe("10 h");
    expect(daysWord(2.35)).toBe("2.4 days");
    expect(daysShort(3.6)).toBe("3.6 d");
    expect(daysWord(null)).toBe("–");
  });
});

describe("west Gulf ships", () => {
  it("spreads the remaining calls until the allowance resets, and stops before the reserve", () => {
    const now = Date.UTC(2026, 9, 15);
    expect(spacing(106, 10, now, now + 10 * DAY)).toBe(DAY);
    // Never more often than every two hours.
    expect(spacing(1000, 1, now, now + DAY)).toBe(2 * HOUR);
    expect(spacing(10, 10, now, now + DAY)).toBeNull();
  });

  it("keeps each ship's newest position and drops glitches", () => {
    const ships = latestPerShip([
      { mmsi: 1, latitude: 26, longitude: 52, timestamp: "2026-10-15T06:00:00Z", vessel_name: " OLD " },
      { mmsi: 1, latitude: 26.1, longitude: 52.1, timestamp: "2026-10-15T07:00:00Z", vessel_name: "NEW", heading: 511 },
      { mmsi: 2, latitude: 0, longitude: 0, timestamp: "2026-10-15T08:00:00Z", suspected_glitch: true },
      { mmsi: 3, latitude: 25, longitude: 51, timestamp: "2026-10-15T08:00:00Z", heading: 90 },
    ]);
    expect(ships.map((s) => [s.mmsi, s.name, s.heading])).toEqual([[1, "NEW", null], [3, "MMSI 3", 90]]);
  });
});

describe("hormuz.now", () => {
  it("reads the compact ship snapshot and leaves out buoys", () => {
    const ships = readSnapshot({
      t: 0, n: 2,
      fields: ["id", "name", "lat", "lon", "category", "commercial"],
      rows: [["a", " TANKER ONE ", 26.5, 56.3, "tanker", 1], ["b", "BUOY", 26.4, 56.2, "navaid", 0]],
    });
    expect(ships).toHaveLength(1);
    expect(ships[0]).toMatchObject({ id: "a", name: "TANKER ONE", category: "tanker", commercial: true, speed: 0 });
    expect(readSnapshot(null)).toEqual([]);
  });
});

describe("chart scales", () => {
  it("rounds a scale's top up to a readable number", () => {
    expect([7, 13, 84, 105, 0].map(niceMax)).toEqual([8, 15, 100, 120, 1]);
  });
});

describe("our verdict", () => {
  const zone = (z: ZoneSummary["zone"], level: ZoneSummary["level"], headline: string | null = null): ZoneSummary =>
    ({ zone: z, level, events24h: 1, vessels: 0, dark: 0, transits24h: null, headline });

  it("leads with the worst lane, counts the rest, and adds Hormuz traffic", () => {
    const zones = [zone("redsea", "high"), zone("aden", "critical"), zone("somalia", "high"), zone("hormuz", "high"), zone("gulf", "elevated")];
    const segs = verdict(zones, 10.4);
    expect(verdictText(segs)).toBe("Bab el-Mandeb critical. Three more lanes high. Hormuz traffic at 10% of normal.");
    expect(segs.filter((s) => s.level).map((s) => [s.text, s.level])).toEqual([["critical", "critical"], ["high", "high"]]);
  });

  it("names a few high lanes and calls a quiet picture normal", () => {
    expect(verdictText(verdict([zone("redsea", "high"), zone("hormuz", "high"), zone("gulf", "low")], null))).toBe("Red Sea and Hormuz high.");
    expect(verdictText(verdict([zone("gulf", "low")], 96))).toBe("All five sea lanes normal. Hormuz traffic near normal.");
    expect(worstLevel([zone("gulf", "elevated"), zone("aden", "high")])).toBe("high");
  });

  it("writes the bottom line from the strait, the worst lane elsewhere and the ports", () => {
    const lines = bottomLine({
      zones: [zone("aden", "critical", "Bulk carrier struck by missile"), zone("redsea", "high", "Explosion near ship"), zone("hormuz", "high", "Tanker seized")],
      strait: { ais7: 8.94, baseline: 84.8, waiting: 659 },
      waits: [{ name: "Hodeidah", days: 6.5, longer: true }, { name: "Sohar", days: 0.4, longer: false }],
    });
    expect(lines.map((l) => l.label)).toEqual(["Hormuz", "Bab el-Mandeb", "Ports"]);
    expect(lines[0].text).toBe("659 ships are waiting at anchor near the strait. This week 8.9 a day are crossing, against 84.8 before the crisis.");
    expect(lines[1].text).toBe("Bulk carrier struck by missile.");
    expect(lines[2].text).toBe("1 of 2 have longer waits than usual. The longest is Hodeidah, at 6.5 days.");
  });

  it("lists levels that rose before ones that fell, then new serious reports", () => {
    const changes = changesSince(
      { t: 0, levels: { redsea: "elevated", aden: "high", gulf: "high" }, serious: ["a"] },
      { t: 1, levels: { redsea: "high", aden: "critical", gulf: "elevated" }, serious: ["a", "b", "c"] },
    );
    expect(changes.map((c) => c.text)).toEqual([
      "Bab el-Mandeb up to critical, from high",
      "Red Sea up to high, from elevated",
      "Arabian Gulf down to elevated, from high",
      "2 new serious reports",
    ]);
  });
});
