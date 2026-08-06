// Pure catalog-aggregation helpers for the Explore view
// (rbr-rally-creator-web#106): world map -> click a country -> how many
// stages it has and what conditions they offer. Framework-agnostic (no
// React) and side-effect free, same convention as rallyPlan.js, so the
// summaries are unit-testable without mounting anything.
import { parseStageKm } from './rallyPlan.js';

// Canonical wetness display order -- matches the service's own
// wetnessOptions enum order (dry -> damp -> wet, see /catalog/rally-options)
// rather than alphabetical, which would read damp/dry/wet and look wrong to
// anyone who knows the game's menus.
const WETNESS_ORDER = ['dry', 'damp', 'wet'];

// How many distinct weather strings a country summary carries verbatim.
// Finland's fully-featured stages alone have 11 -- listing every one turns
// the panel into a wall of text, so the summary keeps a small sample plus a
// "+N more" count (weatherTotal below) for the UI to render.
export const WEATHER_SAMPLE_SIZE = 4;

// Aggregates the raw stage catalog (GET /catalog/stages shape, see
// mockData.js's MOCK_STAGES for a verbatim sample) into one summary per
// country, sorted by country name:
//   {
//     country:        catalog country name, verbatim
//     stageCount:     number of stages
//     stages:         the stages themselves, sorted by name (detail list)
//     surfaces:       [{ surface, count }] sorted by count desc, then name
//     wetnessOptions: union across stages, in WETNESS_ORDER
//     weatherSample:  up to WEATHER_SAMPLE_SIZE distinct weather strings
//     weatherTotal:   total distinct weather strings (for "+N more")
//     kmRange:        { min, max } over parseable lengths, or null
//   }
export function aggregateStagesByCountry(stages) {
  const byCountry = new Map();
  for (const stage of stages) {
    // A catalog row without a usable country string still represents a real
    // stage -- bucket it under a literal 'Unknown' entry rather than
    // dropping it, per #106's "flag, don't silently drop" rule (the same
    // rule resolveShapeName applies to names the map doesn't know).
    const country =
      typeof stage.country === 'string' && stage.country.trim() ? stage.country.trim() : 'Unknown';
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(stage);
  }

  return [...byCountry.entries()]
    .map(([country, countryStages]) => summarizeCountry(country, countryStages))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function summarizeCountry(country, stages) {
  const surfaceCounts = new Map();
  const wetness = new Set();
  const weather = new Set();
  let minKm = Infinity;
  let maxKm = -Infinity;

  for (const stage of stages) {
    if (stage.surface) {
      surfaceCounts.set(stage.surface, (surfaceCounts.get(stage.surface) ?? 0) + 1);
    }
    for (const option of stage.wetnessOptions ?? []) wetness.add(option);
    for (const option of stage.weatherOptions ?? []) {
      // 'default' is the catalog's placeholder for stages with no real
      // weather variants (see MOCK_STAGES id 1008) -- it's not a condition
      // a user can meaningfully compare, so it stays out of the summary.
      if (option !== 'default') weather.add(option);
    }
    const km = parseStageKm(stage);
    // parseStageKm returns 0 for missing/unparseable lengths -- excluded so
    // one malformed row can't drag every country's minimum down to 0.0 km.
    if (km > 0) {
      minKm = Math.min(minKm, km);
      maxKm = Math.max(maxKm, km);
    }
  }

  const surfaces = [...surfaceCounts.entries()]
    .map(([surface, count]) => ({ surface, count }))
    .sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));

  // Known wetness values in canonical order first, then any future/unknown
  // ones alphabetically at the end instead of vanishing.
  const wetnessOptions = [
    ...WETNESS_ORDER.filter((option) => wetness.has(option)),
    ...[...wetness].filter((option) => !WETNESS_ORDER.includes(option)).sort(),
  ];

  const weatherAll = [...weather];

  return {
    country,
    stageCount: stages.length,
    stages: [...stages].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    surfaces,
    wetnessOptions,
    weatherSample: weatherAll.slice(0, WEATHER_SAMPLE_SIZE),
    weatherTotal: weatherAll.length,
    kmRange: Number.isFinite(minKm) ? { min: minKm, max: maxKm } : null,
  };
}

// Catalog-name -> Natural Earth-name bridge (rbr-rally-creator-web#106).
// The catalog carries free-text country names with no ISO codes, and the
// vendored map (WorldMap/worldMapShapes.js) keys its shapes by Natural
// Earth's names -- which abbreviate ("Czechia", "Dominican Rep.") and treat
// the UK as one shape. This static table covers every known divergence;
// anything it misses resolves to null and the UI flags the country as "not
// on the map" instead of dropping it (the real catalog is 512 stages across
// 30+ countries, far more than the 15-stage dev mock exercises, so unknown
// names WILL show up here before this table learns about them).
const SHAPE_NAME_ALIASES = {
  'bosnia and herzegovina': 'Bosnia and Herz.',
  'czech republic': 'Czechia',
  'dominican republic': 'Dominican Rep.',
  'east timor': 'Timor-Leste',
  england: 'United Kingdom',
  'great britain': 'United Kingdom',
  holland: 'Netherlands',
  'ivory coast': "Côte d'Ivoire",
  korea: 'South Korea',
  'north macedonia': 'Macedonia',
  'northern ireland': 'United Kingdom',
  'republic of ireland': 'Ireland',
  scotland: 'United Kingdom',
  swaziland: 'eSwatini',
  uk: 'United Kingdom',
  'united states': 'United States of America',
  usa: 'United States of America',
  wales: 'United Kingdom',
};

// Resolves a catalog country name to the map shape it should highlight.
// `shapeNamesByLower` is built once by buildShapeNameIndex below -- passing
// the index in (rather than importing worldMapShapes.js here) keeps this
// module free of the 70+ KB geometry payload, so unit tests stay fast and
// the aggregation stays usable without the map.
export function resolveShapeName(countryName, shapeNamesByLower) {
  if (typeof countryName !== 'string') return null;
  const lower = countryName.trim().toLowerCase();
  if (!lower) return null;
  const direct = shapeNamesByLower.get(lower);
  if (direct) return direct;
  const alias = SHAPE_NAME_ALIASES[lower];
  // The alias table is trusted but still verified against the actual shape
  // set -- if a regenerated map ever renames a shape, the alias fails
  // closed (flagged in the UI) instead of silently pointing at nothing.
  if (alias && shapeNamesByLower.get(alias.toLowerCase())) return alias;
  return null;
}

// lowercased shape name -> canonical shape name, for case-insensitive
// matching ("finland" in some future catalog row still hits "Finland").
export function buildShapeNameIndex(shapeNames) {
  const index = new Map();
  for (const name of shapeNames) index.set(name.toLowerCase(), name);
  return index;
}

// Convenience join of the two halves above: each country summary gains a
// `shapeName` (string, or null when the map has no shape for it -- the
// UI's cue to show its subtle "not on map" flag).
export function annotateWithShapeNames(summaries, shapeNamesByLower) {
  return summaries.map((summary) => ({
    ...summary,
    shapeName: resolveShapeName(summary.country, shapeNamesByLower),
  }));
}
