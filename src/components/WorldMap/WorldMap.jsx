import { WORLD_MAP_SHAPES, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT } from './worldMapShapes.js';
import styles from './WorldMap.module.css';

// Clickable world map for the Explore view (rbr-rally-creator-web#106).
// Purely presentational: shape geometry comes from the vendored
// worldMapShapes.js (see its header for source + license), and which
// countries light up comes in via props -- this component holds no state
// and never touches the catalog itself.
//
// Accessibility: the whole SVG is aria-hidden. #106's keyboard/screen-
// reader path is ExploreView's country *list* (real buttons carrying the
// same data), so exposing 176 mouse-only paths to the accessibility tree
// would only add noise next to the list that actually works. Pointer users
// still get a native tooltip per country via <title>.
export function WorldMap({ summariesByShapeName, selectedShapeName, onSelect, onHover }) {
  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      // One leave handler on the svg instead of per-path onMouseLeave:
      // moving between two adjacent countries fires enter-before-leave in
      // some browsers, and clearing on every path boundary makes the hover
      // readout flicker across borders.
      onMouseLeave={() => onHover(null)}
    >
      {WORLD_MAP_SHAPES.map((shape) => {
        const summary = summariesByShapeName.get(shape.name);
        if (!summary) {
          // Stage-less landmass: quiet background geometry, no handlers --
          // pointer-events stay on so the svg-level mouseleave doesn't fire
          // while crossing it, but there's nothing to hover or click.
          return <path key={shape.name} className={styles.land} d={shape.d} />;
        }
        return (
          <path
            key={shape.name}
            className={styles.country}
            data-selected={shape.name === selectedShapeName}
            d={shape.d}
            onClick={() => onSelect(summary.country)}
            onMouseEnter={() => onHover(summary.country)}
          >
            {/* Native tooltip mirrors the hover readout for pointer users
                who pause on a shape. */}
            <title>{`${summary.country} — ${summary.stageCount} ${summary.stageCount === 1 ? 'stage' : 'stages'}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
