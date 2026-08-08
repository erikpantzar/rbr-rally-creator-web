import { useEffect, useRef, useState } from 'react';
import { WORLD_MAP_SHAPES, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT } from './worldMapShapes.js';
import styles from './WorldMap.module.css';

// Clickable, pannable, zoomable world map for the Explore view
// (rbr-rally-creator-web#106, pan/zoom revamp). Shape geometry comes from
// the vendored worldMapShapes.js (see its header for source + license), and
// which countries light up comes in via props. The only state this
// component owns is the view transform (pan offset + zoom scale) -- it
// still never touches the catalog itself.
//
// Accessibility: the whole SVG is aria-hidden. The keyboard/screen-reader
// path is ExploreView's country *list* (real buttons carrying the same
// data), so exposing 176 mouse-only paths to the accessibility tree would
// only add noise next to the list that actually works. The zoom buttons ARE
// exposed -- they're the keyboard path for the zoom feature itself. Pointer
// users still get a native tooltip per country via <title>.

const MIN_SCALE = 1;
const MAX_SCALE = 8;
// exp(-deltaY * sensitivity): one classic mouse-wheel notch (deltaY 100)
// zooms ~×1.25, and trackpad pinch (fine-grained deltas) stays smooth.
const WHEEL_SENSITIVITY = 0.0022;
// Pointer travel below this many client px is a click on a country;
// beyond it, the gesture becomes a pan and the click is suppressed.
const DRAG_THRESHOLD_PX = 4;
const BUTTON_ZOOM_STEP = 2;

const IDENTITY_TRANSFORM = { k: 1, x: 0, y: 0 };

// The rendered geometry spans [x, x + WIDTH*k]; clamping x to
// [WIDTH*(1-k), 0] (and y likewise) means the map's edges can never be
// dragged inside the viewport -- no empty void beyond the antimeridian,
// and at k=1 the map is exactly pinned in place.
function clampTransform({ k, x, y }) {
  const clampedK = Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
  return {
    k: clampedK,
    x: Math.min(0, Math.max(WORLD_MAP_WIDTH * (1 - clampedK), x)),
    y: Math.min(0, Math.max(WORLD_MAP_HEIGHT * (1 - clampedK), y)),
  };
}

// Rescale around a fixed point (viewBox coordinates): the map location
// under `point` stays under it after the zoom -- the Google Maps feel.
function zoomAt(transform, point, factor) {
  const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.k * factor));
  const ratio = k / transform.k;
  return clampTransform({
    k,
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
  });
}

// Client px -> viewBox coordinates, letterboxing and page scroll included --
// the browser already knows the exact mapping via the svg's screen matrix.
function clientToMapPoint(svg, clientX, clientY) {
  return new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM().inverse());
}

export function WorldMap({
  summariesByShapeName,
  selectedShapeName,
  onSelect,
  onHover,
  // Shape names (map's own naming, not catalog names) that already have at
  // least one stage in the current rally draft -- lights them up with the
  // "this builds" highlight tokens, on top of the normal catalog styling.
  // A Set (not part of the summary objects) because it changes independent
  // of the catalog -- adding a stage shouldn't force new summary objects.
  draftedShapeNames,
  // Starting (and reset-button) view -- lets the #okatwentytwo view open
  // already zoomed on the Nordics. Omitted = the whole world at 1:1.
  initialTransform,
  // 'beacon' is the #okatwentytwo look: dimmed land, glowing highlights.
  // Purely a styling switch -- see WorldMap.module.css.
  variant = 'default',
}) {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState(() =>
    clampTransform(initialTransform ?? IDENTITY_TRANSFORM)
  );
  const [dragging, setDragging] = useState(false);
  // Per-gesture bookkeeping lives in refs, not state -- pointermove fires
  // continuously and only the transform itself should trigger renders.
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);

  // Native non-passive listener instead of React's onWheel: the zoom must
  // preventDefault (otherwise the page scrolls and the map zooms at once),
  // and browsers register wheel listeners as passive by default.
  useEffect(() => {
    const svg = svgRef.current;
    function handleWheel(event) {
      event.preventDefault();
      const point = clientToMapPoint(svg, event.clientX, event.clientY);
      setTransform((prev) => zoomAt(prev, point, Math.exp(-event.deltaY * WHEEL_SENSITIVITY)));
    }
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, []);

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    suppressClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTransform: transform,
      captured: false,
    };
  }

  function handlePointerMove(event) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startClientX;
    const dy = event.clientY - gesture.startClientY;
    if (!gesture.captured) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      // Capture only once this is definitely a pan: capturing on pointerdown
      // would retarget the eventual click event away from the country path,
      // silently breaking country selection.
      svgRef.current.setPointerCapture(event.pointerId);
      gesture.captured = true;
      suppressClickRef.current = true;
      setDragging(true);
    }
    // getScreenCTM().a is the uniform client-px-per-viewBox-unit scale, so
    // dividing client deltas by it pans 1:1 with the cursor at any zoom.
    const pxPerUnit = svgRef.current.getScreenCTM().a;
    setTransform(
      clampTransform({
        k: gesture.startTransform.k,
        x: gesture.startTransform.x + dx / pxPerUnit,
        y: gesture.startTransform.y + dy / pxPerUnit,
      })
    );
  }

  function handlePointerEnd(event) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gestureRef.current = null;
    setDragging(false);
  }

  function handleDoubleClick(event) {
    const point = clientToMapPoint(svgRef.current, event.clientX, event.clientY);
    setTransform((prev) => zoomAt(prev, point, BUTTON_ZOOM_STEP));
  }

  // The visible area is always exactly the viewBox rect (the transform
  // moves the geometry under it), so its center IS the on-screen center.
  function zoomByStep(factor) {
    setTransform((prev) =>
      zoomAt(prev, { x: WORLD_MAP_WIDTH / 2, y: WORLD_MAP_HEIGHT / 2 }, factor)
    );
  }

  function resetView() {
    setTransform(clampTransform(initialTransform ?? IDENTITY_TRANSFORM));
  }

  return (
    <div className={styles.viewport} data-variant={variant}>
      <svg
        ref={svgRef}
        className={styles.map}
        viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
        data-dragging={dragging}
        // One leave handler on the svg instead of per-path onMouseLeave:
        // moving between two adjacent countries fires enter-before-leave in
        // some browsers, and clearing on every path boundary makes the hover
        // readout flicker across borders.
        onMouseLeave={() => onHover?.(null)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {WORLD_MAP_SHAPES.map((shape) => {
            const summary = summariesByShapeName.get(shape.name);
            if (!summary) {
              // Stage-less landmass: quiet background geometry, no handlers --
              // pointer-events stay on so the svg-level mouseleave doesn't fire
              // while crossing it, and so it's grabbable for panning.
              return <path key={shape.name} className={styles.land} d={shape.d} />;
            }
            return (
              <path
                key={shape.name}
                className={styles.country}
                data-selected={shape.name === selectedShapeName}
                data-drafted={draftedShapeNames?.has(shape.name) ?? false}
                d={shape.d}
                onClick={() => {
                  // A pan that happens to start and end on one country must
                  // not select it -- the threshold above decided this was a
                  // drag, so the trailing click is noise.
                  if (suppressClickRef.current) return;
                  onSelect?.(summary.country);
                }}
                onMouseEnter={() => onHover?.(summary.country)}
              >
                {/* Native tooltip mirrors the hover readout for pointer users
                    who pause on a shape. Count-less summaries (the easter
                    egg's decorative highlights) show just the name. */}
                <title>
                  {summary.stageCount == null
                    ? summary.country
                    : `${summary.country} — ${summary.stageCount} ${summary.stageCount === 1 ? 'stage' : 'stages'}`}
                </title>
              </path>
            );
          })}
        </g>
      </svg>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Zoom in"
          onClick={() => zoomByStep(BUTTON_ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Zoom out"
          onClick={() => zoomByStep(1 / BUTTON_ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Reset view"
          onClick={resetView}
        >
          ⌖
        </button>
      </div>
    </div>
  );
}
