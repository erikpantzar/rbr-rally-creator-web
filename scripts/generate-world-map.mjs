// Generates src/components/WorldMap/worldMapShapes.js from world-atlas's
// countries-110m.json (rbr-rally-creator-web#106).
//
// Why a build-your-own step instead of vendoring a ready-made SVG: #106
// requires a license-checked map with one addressable shape per country,
// styled entirely by the app's tokens. Pre-made "blank world map" SVGs
// either carry unclear licensing, weigh megabytes, or bake in their own
// styling. Natural Earth data is public domain and world-atlas is a
// clean ISC redistribution of it, so we derive our own tiny path set once
// and vendor the OUTPUT (worldMapShapes.js), not the dataset.
//
// Source data:  world-atlas@2.0.2 countries-110m.json
//               https://unpkg.com/world-atlas@2.0.2/countries-110m.json
//               License: ISC (https://github.com/topojson/world-atlas)
//   derived from Natural Earth 4.1.0, 1:110m Admin 0 country boundaries
//               https://www.naturalearthdata.com/ -- public domain
//
// Usage (one-off, only when regenerating the vendored file):
//   curl -sLo /tmp/countries-110m.json https://unpkg.com/world-atlas@2.0.2/countries-110m.json
//   node scripts/generate-world-map.mjs /tmp/countries-110m.json
//
// No dependencies on purpose -- the TopoJSON decode below is ~30 lines and
// pulling in topojson-client/d3-geo for a one-off script would violate the
// repo's no-new-deps stance for something this small.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/generate-world-map.mjs <countries-110m.json>');
  process.exit(1);
}

const topology = JSON.parse(readFileSync(inputPath, 'utf8'));

// --- TopoJSON decode (quantized, delta-encoded arcs -> lon/lat rings) ---

const { scale, translate } = topology.transform;

// Each arc is a run of delta-encoded integer points; absolute position is
// the running sum, mapped back to degrees via the topology's transform.
const arcs = topology.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

// A ring is a list of arc indices; negative (ones' complement) means "use
// that arc reversed". Consecutive arcs share their join point, so drop the
// first point of every arc after the first to avoid doubled vertices.
function decodeRing(arcIndices) {
  const ring = [];
  for (const index of arcIndices) {
    const arc = index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
    ring.push(...(ring.length ? arc.slice(1) : arc));
  }
  return ring;
}

// --- Projection ---
// Plain equirectangular onto a 1000-wide viewBox, latitude clamped to
// [-56, 84]: Antarctica is skipped below and nothing above 84N exists in
// the dataset, so the empty polar bands would only waste vertical space.
const WIDTH = 1000;
const LAT_MAX = 84;
const LAT_MIN = -56;
const HEIGHT = Math.round((WIDTH / 360) * (LAT_MAX - LAT_MIN)); // 389

function project([lon, lat]) {
  return [
    ((lon + 180) / 360) * WIDTH,
    ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * HEIGHT,
  ];
}

// --- Simplification (Douglas-Peucker) ---
// 110m data is already coarse, but at 1000px wide many vertices still land
// within a pixel of each other. A ~0.7px tolerance roughly halves the
// output size with no visible change at the sizes the app renders the map.
const TOLERANCE = 0.7;

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSq));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[last]];
  const left = simplify(points.slice(0, maxIndex + 1), tolerance);
  const right = simplify(points.slice(maxIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

// --- Path building ---

function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

// One decimal place: integer rounding visibly distorts small countries
// (Luxembourg collapses to a triangle) while .1 precision costs ~15% size.
const fmt = (n) => {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

function ringToPath(points) {
  // "M x y" then implicit-lineto coordinate pairs -- smallest valid encoding
  // without resorting to relative-delta tricks.
  const parts = points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`);
  return `M${parts.join(' ')}Z`;
}

const shapes = [];

for (const geometry of topology.objects.countries.geometries) {
  const name = geometry.properties?.name;
  if (!name) continue;
  // Antarctica: no rally stages there, and it's a third of the projected
  // map's height -- dropping it is what lets the layout breathe.
  if (name === 'Antarctica') continue;

  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.arcs]
      : geometry.type === 'MultiPolygon'
        ? geometry.arcs
        : [];

  const rings = [];
  for (const polygon of polygons) {
    // Only outer rings (index 0). Holes at 110m scale are lakes a few
    // pixels across -- invisible at render size, pure path-data weight.
    const ring = simplify(decodeRing(polygon[0]).map(project), TOLERANCE);
    if (ring.length >= 3) rings.push(ring);
  }
  if (rings.length === 0) continue;

  // Drop specks below ~4 px^2 (remote islets) but always keep a country's
  // largest ring so small island nations stay clickable.
  const largest = rings.reduce((a, b) => (ringArea(a) >= ringArea(b) ? a : b));
  const kept = rings.filter((ring) => ring === largest || ringArea(ring) >= 4);

  shapes.push({ name, d: kept.map(ringToPath).join('') });
}

shapes.sort((a, b) => a.name.localeCompare(b.name));

const header = `// GENERATED FILE -- do not edit by hand; regenerate with
// scripts/generate-world-map.mjs (see that file for the how and the why).
//
// Vendored world map geometry for the Explore view (rbr-rally-creator-web#106).
// Source: world-atlas@2.0.2 countries-110m.json -- license: ISC
//         (https://github.com/topojson/world-atlas)
// Derived from Natural Earth 4.1.0 1:110m cultural vectors -- public domain
//         (https://www.naturalearthdata.com/)
// Transformations applied: equirectangular projection (lat clamped to
// [-56, 84], Antarctica removed), Douglas-Peucker simplification at 0.7px
// on a ${WIDTH}x${HEIGHT} viewBox, sub-4px^2 islets dropped.
//
// \`name\` is Natural Earth's country name -- the key that
// lib/countryExplore.js's resolveShapeName() maps catalog country names
// onto. Purely presentational data; no runtime dependency involved.

export const WORLD_MAP_WIDTH = ${WIDTH};
export const WORLD_MAP_HEIGHT = ${HEIGHT};

export const WORLD_MAP_SHAPES = [
`;

const body = shapes
  .map((shape) => `  { name: ${JSON.stringify(shape.name)}, d: ${JSON.stringify(shape.d)} },`)
  .join('\n');

const output = `${header}${body}\n];\n`;

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'components',
  'WorldMap',
  'worldMapShapes.js'
);
writeFileSync(outPath, output);

console.log(`Wrote ${shapes.length} country shapes to ${outPath}`);
console.log(`Output size: ${(output.length / 1024).toFixed(1)} KB`);
console.log(shapes.map((s) => s.name).join(', '));
