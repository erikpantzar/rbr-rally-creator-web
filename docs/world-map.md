# Vendored world map (Explore view)

The Explore view's world map (`src/components/WorldMap/worldMapShapes.js`,
issue #106) is vendored geometry, not a dependency.

- **Source:** `world-atlas@2.0.2` `countries-110m.json`
  (<https://github.com/topojson/world-atlas>) — license: **ISC**.
- **Underlying data:** Natural Earth 4.1.0, 1:110m Admin 0 country
  boundaries (<https://www.naturalearthdata.com/>) — **public domain**.
- **Transformations:** equirectangular projection (latitude clamped to
  [-56, 84], Antarctica removed), Douglas-Peucker simplification at 0.7 px
  on a 1000×389 viewBox, sub-4 px² islets dropped.

To regenerate (e.g. to change tolerance or the source edition), see
`scripts/generate-world-map.mjs` — a dependency-free Node script; usage in
its header comment.

Catalog country names are matched to these shapes by
`src/lib/countryExplore.js` (`resolveShapeName`); names the mapping can't
place are flagged in the UI as "not on map" rather than dropped.
