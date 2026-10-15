/**
 * SAMPLE DATA FOR DESIGN REVIEW ONLY.
 * Loaded when SAMPLE_DATA=1. The UI shows a "Sample data" banner and every
 * link points at example.com, so none of this can pass for real reporting.
 */
import type { RawItem } from "./types";
import type { TrackedVessel } from "./ais";

const h = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const item = (sourceId: string, hoursAgo: number, title: string, summary = "", publisher?: string): RawItem => ({
  sourceId,
  title,
  summary,
  url: `https://example.com/sample/${sourceId}/${encodeURIComponent(title.slice(0, 40))}`,
  publishedAt: h(hoursAgo),
  publisher,
});

export function sampleItems(): RawItem[] {
  return [
    item("gn-official", 0.4, "UKMTO: vessel reports explosion in water near ship 60nm west of Hodeidah", "UKMTO says the master reported a splash and explosion close to the vessel in the Red Sea. Crew safe, vessel proceeding to next port of call.", "UKMTO"),
    item("gcaptain", 0.7, "Tanker reports explosion near hull off Hodeidah as Red Sea threat persists", "A Liberia-flagged tanker reported an explosion in the water close to the ship west of Hodeidah, according to UKMTO. No damage was reported."),
    item("aljazeera", 0.9, "Explosion reported near tanker off Yemen's Hodeidah, UKMTO says", "The UK maritime agency said the vessel and crew were safe."),
    item("gn-chokepoints", 1.6, "Two container lines extend Red Sea diversions via Cape of Good Hope into next quarter", "Carriers cite continued risk around Bab el-Mandeb; transit times on Asia–Europe loops rise by 10 to 14 days.", "Reuters"),
    item("splash247", 2.2, "Feeder operators add Jebel Ali–Sohar shuttle as mainline calls are rerouted", "Regional feeder capacity shifts to cover cargo diverted from Red Sea ports, with Unifeeder and others adjusting rotations."),
    item("gn-official", 3.1, "JMIC advisory: GPS interference reported across Strait of Hormuz and Gulf of Oman", "Masters are advised to navigate with caution and report jamming to UKMTO. Interference has been reported for several days.", "JMIC"),
    item("maritime-executive", 3.4, "Ships report GPS jamming in Strait of Hormuz, positions shown over land", "Vessels transiting Hormuz have reported spoofed positions, with some AIS tracks appearing inland near Bandar Abbas."),
    item("gn-somalia", 5.2, "Suspicious approach by skiff reported 180nm east of Eyl, Somalia", "A merchant vessel reported a skiff with five persons on board approaching at speed. Armed security team showed weapons and the skiff withdrew.", "UKMTO"),
    item("gn-somalia", 5.6, "Skiff approaches merchant ship off Somali coast, security team deters", "EUNAVFOR Atalanta said it is aware of the incident east of Eyl.", "EUNAVFOR"),
    item("gn-ports", 6.4, "Jebel Ali reports berth congestion as transshipment volumes surge", "Waiting times at Jebel Ali rose as carriers concentrate Gulf cargo on the hub, port users say.", "Lloyd's List"),
    item("thenational", 7.1, "AD Ports and DP World expand capacity at Khalifa Port and Jebel Ali", "New berths aim to absorb rerouted Gulf volumes, officials say."),
    item("bbc-me", 8.3, "Houthis claim missile attack on ship in Gulf of Aden", "The group said it targeted a vessel it linked to Israel. There was no immediate confirmation from UKMTO."),
    item("gn-official", 8.9, "UKMTO: vessel reports missile impact 90nm south-east of Aden, fire on board extinguished", "The crew is safe. Vessel is proceeding to the next port of call. Authorities are investigating.", "UKMTO"),
    item("gcaptain", 9.2, "Bulk carrier struck by missile in Gulf of Aden, fire extinguished", "The ship was hit south-east of Aden; the crew put out a fire and the vessel continued its voyage."),
    item("seatrade", 11.5, "War risk premiums for Red Sea transits climb again", "Underwriters raise additional premiums for ships calling Red Sea ports after the latest attacks."),
    item("arabnews", 13.0, "Saudi Mawani says Jeddah Islamic Port handled record transshipment in September", "Mawani credits new direct services."),
    item("gn-carriers", 14.2, "Maersk advises customers of Salalah schedule changes amid weather and congestion", "Customers should expect delays of 24 to 48 hours for Salalah calls this week.", "Maersk"),
    item("gn-chokepoints", 16.0, "Iran navy holds drills near Strait of Hormuz, says shipping not affected", "State media said naval units carried out exercises in the Gulf of Oman.", "AP"),
    item("aljazeera", 18.5, "Suez Canal revenues fall as shipping avoids Red Sea", "The canal authority says transits remain well below their level before attacks on shipping began."),
    item("gn-official", 22.0, "MARAD advisory updated for Red Sea, Bab el-Mandeb and Gulf of Aden", "US Maritime Administration extends advisory on threats to commercial vessels.", "MARAD"),
    item("splash247", 26.0, "Port Sudan operations slow as fuel shortages hit terminal equipment", "Shipping agents report delays at Port Sudan's south terminal."),
    item("gn-ports", 31.0, "Hamad Port and Sohar sign feeder connectivity agreement", "The deal adds weekly feeder calls linking Qatar and Oman.", "The Peninsula"),
    item("gcaptain", 40.0, "Tanker seized by Iranian forces in Gulf of Oman, says maritime security firm", "Ambrey said the vessel was boarded by armed personnel and directed towards Iranian waters."),
    item("gn-official", 41.0, "UKMTO: vessel boarded by unauthorised persons 20nm east of Khor Fakkan", "Vessel was directed to Iranian territorial waters. Authorities are investigating.", "UKMTO"),
    item("maritime-executive", 52.0, "Djibouti Doraleh terminal volumes rise as lines add Gulf of Aden calls", "Transshipment demand grows at Djibouti."),
    item("gn-somalia", 70.0, "Puntland maritime police intercept dhow with suspected pirates near Bosaso", "Officials say weapons and ladders were recovered.", "Garowe Online"),
    item("bbc-me", 96.0, "Aqaba port traffic recovers after months of disruption", "Jordan's only port reports improving vessel calls."),
    item("gn-chokepoints", 130.0, "Container ship reports suspicious approach in southern Red Sea near Bab el-Mandeb", "Small craft approached and later moved away.", "UKMTO"),
  ];
}

/** Generated traffic along the main lanes, for layout review only. */
export function sampleVessels(): TrackedVessel[] {
  const lanes: [number, number][][] = [
    [[48.6, 29.6], [50.4, 27.4], [52.6, 26.2], [55.0, 25.6], [56.3, 26.4], [57.2, 25.6], [58.6, 24.2], [60.5, 22.6]],
    [[51.6, 25.1], [53.4, 25.6], [55.0, 25.1]],
    [[56.4, 25.2], [57.0, 24.6], [58.8, 23.8]],
    [[32.5, 29.9], [34.0, 27.6], [36.0, 24.6], [38.4, 21.0], [40.6, 17.6], [42.4, 14.6], [43.3, 12.6], [45.4, 12.2], [48.6, 12.6], [51.6, 12.4], [55.0, 13.6]],
    [[43.2, 12.6], [43.6, 11.6]],
    [[51.4, 12.0], [51.8, 9.0], [50.0, 5.0], [47.2, 1.2]],
    [[54.0, 16.9], [56.0, 18.2], [58.0, 20.4], [59.4, 22.4]],
  ];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const names = ["GULF PEARL", "SEA FALCON", "AL DHAFRA", "NAJMAT", "ORIENT STAR", "BAHRI JAZAN", "MSC ARABIA", "MAERSK SOHAR", "UNIFEEDER JEBEL", "UNIFEEDER SOHAR", "DUBAI FORTUNE", "OCEAN CREST", "PACIFIC DAWN", "HAMAD EXPRESS", "AL RAYYAN", "BERBERA TRADER", "RED SEA ROSE", "KHALIFA BAY", "SALALAH SPIRIT", "ADEN STAR"];
  const out: TrackedVessel[] = [];
  let mmsi = 470_000_001;
  for (const lane of lanes) {
    const count = Math.round(lane.length * 6);
    for (let i = 0; i < count; i++) {
      const seg = Math.floor(rnd() * (lane.length - 1));
      const t = rnd();
      const [a, b] = [lane[seg], lane[seg + 1]];
      const off = (rnd() - 0.5) * 0.25;
      const lon = a[0] + (b[0] - a[0]) * t + off;
      const lat = a[1] + (b[1] - a[1]) * t - off;
      const reverse = rnd() > 0.5;
      const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + (reverse ? 180 : 0);
      const track: [number, number][] = Array.from({ length: 8 }, (_, k) => {
        const tt = Math.max(0, t - (reverse ? -1 : 1) * (8 - k) * 0.03);
        return [a[0] + (b[0] - a[0]) * Math.min(1, tt) + off, a[1] + (b[1] - a[1]) * Math.min(1, tt) - off];
      });
      track.push([lon, lat]);
      const name = names[Math.floor(rnd() * names.length)];
      const dark = rnd() < 0.05;
      const type = [70, 80, 71, 84, 70, 60][Math.floor(rnd() * 6)];
      out.push({
        mmsi: mmsi++, name: `${name} ${String.fromCharCode(65 + (mmsi % 26))}`, shipType: type,
        destination: ["JEBEL ALI", "SOHAR", "JEDDAH", "DJIBOUTI", "SALALAH", "HAMAD", "SUEZ"][Math.floor(rnd() * 7)],
        lon, lat, sog: 8 + rnd() * 9, cog: (bearing + 360) % 360, heading: Math.round((bearing + 360) % 360),
        lastSeen: new Date(Date.now() - (dark ? 3 * 3600_000 : rnd() * 600_000)).toISOString(),
        zone: null, dark, track, unifeeder: name.startsWith("UNIFEEDER"), length: 120 + Math.round(rnd() * 250),
      });
    }
  }
  return out;
}
