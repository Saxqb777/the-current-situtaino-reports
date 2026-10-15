/**
 * hormuz.now's 25 PortWatch ports, by slug, matched to the ports on our
 * chart. PortWatch gives no positions, so the chart's position is used.
 */
export const PORTWATCH_PORT: Record<string, string> = {
  "ras-tanura": "ras-tanura",
  juaymah: "juaymah",
  jubail: "jubail",
  "ras-laffan": "ras-laffan",
  mesaieed: "mesaieed",
  "mina-al-ahmadi": "mina-al-ahmadi",
  "umm-qasr": "umm-qasr",
  "kharg-island": "kharg",
  "bandar-e-pars": "bandar-e-pars",
  ruwais: "ruwais",
  "das-island": "das-island",
  sitrah: "sitrah",
  "jebel-ali": "jebel-ali",
  "khalifa-port": "khalifa",
  "hamad-port": "hamad",
  dammam: "dammam",
  "shahid-rajaee": "bandar-abbas",
  sharjah: "khalid",
  "mina-saqr": "saqr",
  fujairah: "fujairah",
  "khor-fakkan": "khor-fakkan",
  sohar: "sohar",
  duqm: "duqm",
  yanbu: "yanbu",
  chabahar: "chabahar",
};

/** Our port id to its PortWatch slug, the other way round. */
export const PORT_PORTWATCH: Record<string, string> = Object.fromEntries(Object.entries(PORTWATCH_PORT).map(([k, v]) => [v, k]));

/** Share of normal port calls to a reading: near normal, reduced, or hard hit. */
export function callsBand(pct: number): "normal" | "reduced" | "low" {
  if (pct >= 75) return "normal";
  if (pct >= 40) return "reduced";
  return "low";
}
