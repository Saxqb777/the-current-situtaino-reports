import { afterEach, describe, expect, it, vi } from "vitest";
import { niceMax } from "@/components/viz/scale";
import { addHistory, groupUrl, readTerminals, refreshCongestion } from "./congestion";
import { type HzAreas, readSnapshot } from "./hormuz";
import { store } from "./store";
import { type CongestionDoc, type TerminalReading, daysShort, daysWord, diffShort, indexLevel, isLonger, portFigures, portWait } from "./waits";
import type { ZoneSummary } from "./types";
import { gstDate, gstHour, gstLongDate, gstMidnight, gstTime } from "./ui";
import { bottomLine, changesSince, verdict, verdictText, worstLevel } from "./verdict";
import { latestPerShip, spacing } from "./westgulf";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** One Kpler page: a congestion item per terminal, with its port and terminal included. */
function kplerPage(rows: { port: string; code: string; terminal: string; index: number; waiting: number; wait: number; usual: number; carriers?: string[] }[], next?: string) {
  return {
    data: rows.map((r) => ({
      id: `tc-${r.terminal}`,
      type: "terminal_congestion",
      attributes: {
        carriers: (r.carriers ?? []).map((name) => ({ name, scac: "X", services: [] })),
        liveMetrics: { vesselsStay: 3, lastUpdatedAt: "2026-10-15T09:00:00Z", vesselsWaiting: r.waiting, congestionIndex: r.index, vesselsStayAvgTime: 30, vesselsWaitingAvgTime: r.wait },
        performanceInsights: { avgStayTime: 28, lastUpdatedAt: "2026-10-15T00:00:00Z", avgWaitingTime: r.usual, performanceIndex: 5 },
      },
      relationships: { port: { data: { id: r.port, type: "port" } }, terminal: { data: { id: r.terminal, type: "terminal" } } },
    })),
    included: [
      ...rows.map((r) => ({ id: r.port, type: "port", attributes: { unlocode: r.code, name: r.code, lat: 25, lon: 55 } })),
      ...rows.map((r) => ({ id: r.terminal, type: "terminal", attributes: { name: `Terminal ${r.terminal}`, lat: 25, lon: 55 } })),
    ],
    links: next ? { next } : {},
  };
}

const term = (index: number | null, waiting: number | null, waitHours: number | null, usualHours: number | null = 24): TerminalReading =>
  ({ id: `t${index}${waiting}`, name: "T", index, waiting, waitHours, usualHours, alongside: 2, stayHours: null, usualStayHours: null, carriers: [], at: null });

describe("port waits", () => {
  it("reads Kpler's terminals, grouped by port code, with the lines calling", () => {
    const read = readTerminals([
      kplerPage([
        { port: "102", code: "AEJEA", terminal: "1", index: 5.1, waiting: 4, wait: 57.6, usual: 9, carriers: ["MSC", "Maersk", "MSC"] },
        { port: "18560", code: "aeklf", terminal: "2", index: 8.4, waiting: 15, wait: 209, usual: 138 },
      ]),
      // The same item again on a later page counts once.
      kplerPage([{ port: "102", code: "AEJEA", terminal: "1", index: 5.1, waiting: 4, wait: 57.6, usual: 9 }]),
    ]);
    expect(Object.keys(read)).toEqual(["AEJEA", "AEKLF"]);
    expect(read.AEJEA).toHaveLength(1);
    expect(read.AEJEA[0]).toMatchObject({ name: "Terminal 1", index: 5.1, waiting: 4, waitHours: 57.6, usualHours: 9, alongside: 3, carriers: ["MSC", "Maersk"] });
    expect(readTerminals([{}])).toEqual({});
  });

  it("takes the busiest terminal's index and weights the wait by ships queuing, leaving out stale waits", () => {
    const f = portFigures([term(3, 1, 10), term(8.3, 3, 30), term(6.7, 2, 4301)]);
    expect(f.index).toBe(8.3);
    expect(f.waiting).toBe(6);
    expect(f.waitHours).toBe(25);
    expect(portFigures([term(2, 0, 50), term(1, 0, null)]).waitHours).toBe(0);
    expect(portFigures([]).index).toBeNull();
  });

  it("grades by index the owner's way and calls a wait longer only when it clearly is", () => {
    expect([9, 7, 6.9, 4, 3.9, null].map(indexLevel)).toEqual(["high", "high", "elevated", "elevated", "normal", null]);
    expect(isLonger(8.7, 5.75)).toBe(true);
    expect(isLonger(0.4, 0.25)).toBe(false);
    expect(isLonger(2, null)).toBe(false);
  });

  it("builds a port's wait from the stored doc and ignores the old weekly shape", () => {
    const doc: CongestionDoc = { v: 2, at: "2026-10-15T09:00:00Z", ports: { "khor-fakkan": { code: "AEKLF", at: "2026-10-15T09:00:00Z", terminals: [term(8.4, 15, 209, 138)] } }, history: { "khor-fakkan": [[493_000, 8.1, 12, 190]] } };
    const w = portWait("khor-fakkan", doc, null);
    expect(w).toMatchObject({ index: 8.4, level: "high", waiting: 15, longer: true, at: "2026-10-15T09:00:00Z" });
    expect(w.days).toBeCloseTo(209 / 24);
    expect(w.typical).toBeCloseTo(138 / 24);
    expect(w.history).toHaveLength(1);
    const old = { at: null, ports: { fujairah: { at: "", weeks: [] } } } as unknown as CongestionDoc;
    expect(portWait("fujairah", old, null).terminals).toEqual([]);
  });

  it("adds who is waiting off the port now, from hormuz.now", () => {
    const areas = {
      areas: [{ id: "dubai", name: "Dubai anchorage", waiting: 30, trend: [20, -1, 25, 30] }],
      waiting: { areas: [{ id: "dubai", name: "Dubai anchorage", count: 31, medianHours: 35, over24h: 12, over7d: 2 }] },
    } as unknown as HzAreas;
    const w = portWait("jebel-ali", null, areas);
    expect(w.days).toBeNull();
    expect(w.live).toMatchObject({ area: "dubai", areaName: "Dubai", waiting: 31, medianHours: 35, trend: [20, 25, 30] });
    expect(portWait("aden", null, areas).live).toBeNull();
  });

  it("keeps a point every three hours for thirty days", () => {
    const ports = { sohar: { code: "OMSOH", at: "", terminals: [term(4.2, 2, 12)] } };
    const t = Date.UTC(2026, 9, 15, 9);
    const h = t / HOUR;
    const first = addHistory({ sohar: [[h - 31 * 24, 1, 0, 0]] }, ports, ["sohar"], t);
    expect(first.sohar).toEqual([[h, 4.2, 2, 12]]);
    expect(addHistory(first, ports, ["sohar"], t + 2 * HOUR).sohar).toHaveLength(1);
    expect(addHistory(first, ports, ["sohar"], t + 3 * HOUR).sohar).toHaveLength(2);
  });

  it("writes short waits in hours, long ones in days, and no queue as such", () => {
    expect(daysWord(0.4)).toBe("10 h");
    expect(daysWord(2.35)).toBe("2.4 days");
    expect(daysWord(0)).toBe("No queue");
    expect(daysShort(3.6)).toBe("3.6 d");
    expect(daysWord(null)).toBe("–");
    expect([2.95, -0.25, 0.01, null].map(diffShort)).toEqual(["+3.0 d", "−6 h", "same", "–"]);
  });
});

describe("reading Kpler", () => {
  const key = "test-key";
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MARINETRAFFIC_API_KEY;
  });

  it("writes the call exactly as BMB Tracker does", () => {
    expect(groupUrl(["AEJEA"])).toBe("https://api.kpler.com/v1/logistics/containers/terminal-congestions?filter[port.unlocode][]=AEJEA&include=terminals,ports");
    expect(groupUrl(["AEJEA", "AEKLF"])).toContain("filter[port.unlocode][]=AEJEA&filter[port.unlocode][]=AEKLF&");
  });

  it("asks for the sixteen ports five at a time with the key in a header, follows Kpler's next page only, and waits an hour", async () => {
    process.env.MARINETRAFFIC_API_KEY = ` ${key}\n`;
    await store().putDoc("congestion", null);
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      expect(init.headers).toEqual({ "X-Container-API-Key": key, Accept: "application/json" });
      expect(url).not.toContain(key);
      const codes = new URL(url).searchParams.getAll("filter[port.unlocode][]");
      if (codes.includes("AEJEA") && !url.includes("page=2")) {
        return Response.json(kplerPage([{ port: "102", code: "AEJEA", terminal: "1", index: 5.1, waiting: 4, wait: 57.6, usual: 9 }], `${url}&page=2`));
      }
      if (url.includes("page=2")) return Response.json(kplerPage([{ port: "18560", code: "AEKLF", terminal: "2", index: 8.4, waiting: 15, wait: 209, usual: 138 }], "https://elsewhere.example/steal"));
      return Response.json({ data: [], included: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const t = Date.UTC(2026, 9, 15, 9);
    const run = await refreshCongestion(t);
    expect(run).toMatchObject({ ran: true, calls: 5, ports: 2, terminals: 2 });
    expect(run.missing).toHaveLength(14);
    expect(urls.map((u) => new URL(u).searchParams.getAll("filter[port.unlocode][]").length)).toEqual([5, 5, 5, 5, 1]);
    expect(urls.every((u) => u.startsWith("https://api.kpler.com/"))).toBe(true);

    const doc = await store().doc<CongestionDoc>("congestion");
    expect(Object.keys(doc!.ports).sort()).toEqual(["jebel-ali", "khor-fakkan"]);
    expect(doc!.history["khor-fakkan"]).toHaveLength(1);
    expect(await refreshCongestion(t + 30 * 60_000)).toEqual({ ran: false });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("stops at a refused key and keeps the last good figures", async () => {
    process.env.MARINETRAFFIC_API_KEY = key;
    const before = await store().doc<CongestionDoc>("congestion");
    const fetchMock = vi.fn(async () => Response.json({ errors: [{ code: "invalid_api_key", detail: `bad key ${key}` }] }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const run = await refreshCongestion(Date.UTC(2026, 9, 15, 10, 5));
    expect(run).toMatchObject({ ran: true, calls: 0, ports: 0, error: "HTTP 401 invalid_api_key" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const after = await store().doc<CongestionDoc>("congestion");
    expect(after!.ports).toEqual(before!.ports);
    expect(JSON.stringify(after)).not.toContain(key);
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

  it("says so when no ships are queuing at the ports", () => {
    const lines = bottomLine({ zones: [], strait: null, waits: [{ name: "Sohar", days: 0, longer: false }, { name: "Dammam", days: 0.04, longer: false }] });
    expect(lines[0].text).toBe("0 of 2 have longer waits than usual. The longest is Dammam, at 1 hour.");
    expect(bottomLine({ zones: [], strait: null, waits: [{ name: "Sohar", days: 0, longer: false }] })[0].text).toBe("0 of 1 have longer waits than usual. No ships are queuing for a berth.");
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

describe("Dubai time", () => {
  it("writes every time four hours ahead of UTC, rolling the day at Dubai midnight", () => {
    expect(gstTime("2026-10-15T10:16:00Z")).toBe("14:16");
    expect(gstHour(Date.UTC(2026, 9, 15, 9))).toBe("13:00");
    expect(gstDate("2026-10-15T19:59:00Z")).toBe("15 Oct");
    expect(gstDate("2026-10-15T20:00:00Z")).toBe("16 Oct");
    expect(gstTime("2026-10-15T20:30:00Z")).toBe("00:30");
    expect(gstLongDate("2026-12-31T21:00:00Z")).toBe("1 Jan 2027");
  });

  it("finds midnight in Dubai", () => {
    expect(new Date(gstMidnight(Date.UTC(2026, 9, 15, 10))).toISOString()).toBe("2026-10-14T20:00:00.000Z");
    expect(new Date(gstMidnight(Date.UTC(2026, 9, 15, 21))).toISOString()).toBe("2026-10-15T20:00:00.000Z");
  });
});
