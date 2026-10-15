// Builds the chart basemap layers from Natural Earth (public domain).
// Downloads each layer, clips it to the watch area and writes a small GeoJSON to public/geo.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const BBOX = "18,-10,76,40"; // Libya to Pakistan, Kenya to Turkey: wider than the camera can pan
const LAYERS = [
  { src: "ne_10m_land", out: "land", simplify: "40%" },
  { src: "ne_10m_minor_islands", out: "islands", simplify: "60%" },
  { src: "ne_10m_admin_0_boundary_lines_land", out: "borders", simplify: "40%" },
  { src: "ne_10m_bathymetry_K_200", out: "depth-200", simplify: "25%" },
  { src: "ne_10m_bathymetry_J_1000", out: "depth-1000", simplify: "25%" },
  { src: "ne_10m_bathymetry_H_3000", out: "depth-3000", simplify: "25%" },
  { src: "ne_10m_reefs", out: "reefs", simplify: "60%" },
];

const cache = join(tmpdir(), "slw-geo");
mkdirSync(cache, { recursive: true });
mkdirSync("public/geo", { recursive: true });

for (const { src, out, simplify } of LAYERS) {
  const raw = join(cache, `${src}.geojson`);
  if (!existsSync(raw)) {
    const res = await fetch(`${BASE}/${src}.geojson`);
    if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  execFileSync("npx", [
    "mapshaper", raw,
    "-clip", `bbox=${BBOX}`,
    "-simplify", simplify, "keep-shapes",
    "-clean",
    "-filter-fields", "",
    "-o", `public/geo/${out}.json`, "format=geojson", "rfc7946", "precision=0.0001",
  ], { stdio: "inherit" });
}
console.log("Basemap layers written to public/geo");
