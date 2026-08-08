import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getStages } from '../../lib/rallyApi.js';
import {
  aggregateStagesByCountry,
  annotateWithShapeNames,
  buildShapeNameIndex,
} from '../../lib/countryExplore.js';
import { createStageConfigForCatalogStage, formatKm } from '../../lib/rallyPlan.js';
import { appendStageToCurrentDraft, countCurrentDraftStages } from '../../lib/rallyStorage.js';
import { Toast } from '../Toast/Toast.jsx';
import { WorldMap } from '../WorldMap/WorldMap.jsx';
import { WORLD_MAP_SHAPES } from '../WorldMap/worldMapShapes.js';
import styles from './ExploreView.module.css';

// Standalone catalog-browsing view (rbr-rally-creator-web#106): world map
// first, click a country, see how many stages it has and what conditions
// they offer. No longer strictly read-only: each stage row's "Add" button
// appends the stage to the current rally draft (localStorage) without
// leaving the map -- the first slice of the "build the roadbook with the
// geography in mind" direction. The builder is still never touched
// directly; it re-reads the draft when it next mounts.
//
// Fetches its own copy of the stage catalog via getStages, same
// owns-its-catalog pattern as RallyBuilder -- the two views never show at
// the same time (App.jsx swaps them), so sharing one fetch would couple
// them for no visible benefit.

// Built once at module load: the map's shape names never change at runtime
// (worldMapShapes.js is vendored, static data), so there's no reason to
// rebuild the lowercase lookup index per render or per mount.
const SHAPE_NAME_INDEX = buildShapeNameIndex(WORLD_MAP_SHAPES.map((shape) => shape.name));

// How long the "Added ... to rally draft" confirmation stays up. Shorter
// than RoadBook's undo toast (5s) -- nothing here needs deciding, it's
// pure confirmation while the user keeps browsing.
const ADD_TOAST_MS = 3500;

export function ExploreView({ baseUrl }) {
  const [stages, setStages] = useState(null); // null = still loading
  const [error, setError] = useState(null);

  // Selected country lives in the URL (/explorer/:country) rather than
  // local state -- decoded once here since useParams hands back the raw
  // path segment, and every country name must round-trip through it (see
  // setSelectedCountry below, which is what encodes it going the other
  // way). Gives Explore real deep links: sharing/bookmarking/back-button
  // all land on the exact country that was showing.
  const { country: countryParam } = useParams();
  const selectedCountry = countryParam ? decodeURIComponent(countryParam) : null;
  const navigate = useNavigate();
  function setSelectedCountry(country) {
    navigate(country ? `/explorer/${encodeURIComponent(country)}` : '/explorer');
  }

  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  // Which catalog stages the draft already holds -- "already in your
  // rally" markers on the map and stage list. Lazy initializer reads
  // localStorage fresh on every mount (same reasoning as RallySidebar's
  // listRallies() initializer), so switching back into Explore always
  // reflects whatever the builder did to the draft meanwhile.
  const [draftedCounts, setDraftedCounts] = useState(() => countCurrentDraftStages());

  // Clear any pending toast timer on unmount so a late timeout can't
  // setState on the unmounted instance -- same guard as the fetch below.
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  function handleAddStage(stage) {
    const count = appendStageToCurrentDraft(createStageConfigForCatalogStage(stage));
    setToastMessage(
      `Added ${stage.name} to rally draft (${count} ${count === 1 ? 'stage' : 'stages'})`
    );
    // A second add while a toast is showing replaces it and restarts the
    // clock -- same single-slot policy as RoadBook's pendingUndo.
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), ADD_TOAST_MS);
    // Re-read rather than incrementing draftedCounts locally -- the source
    // of truth is the draft itself, and re-reading keeps this correct even
    // if a future caller writes to the draft some other way.
    setDraftedCounts(countCurrentDraftStages());
  }

  useEffect(() => {
    let cancelled = false;
    getStages(baseUrl)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setStages(res.data ?? []);
        } else {
          setError('Failed to fetch the stage catalog');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(`Error loading the stage catalog: ${err.message}`);
      });
    // Cancellation guard: switching back to the builder unmounts this view;
    // a late response must not setState on the unmounted instance.
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  // country summaries + which map shape each one highlights (shapeName is
  // null for catalog countries the vendored map has no shape for -- those
  // get the "not on map" flag below rather than being dropped, per #106).
  // draftedCount folds in here (not just per-stage) so the country list and
  // map only need to check one field, rather than re-scanning each
  // country's stages against draftedCounts on every render.
  const summaries = useMemo(() => {
    if (!stages) return [];
    return annotateWithShapeNames(aggregateStagesByCountry(stages), SHAPE_NAME_INDEX).map(
      (summary) => ({
        ...summary,
        draftedCount: summary.stages.reduce(
          (total, stage) => total + (draftedCounts.get(stage.id) ?? 0),
          0
        ),
      })
    );
  }, [stages, draftedCounts]);

  const summariesByShapeName = useMemo(() => {
    const byShape = new Map();
    for (const summary of summaries) {
      if (summary.shapeName) byShape.set(summary.shapeName, summary);
    }
    return byShape;
  }, [summaries]);

  const draftedShapeNames = useMemo(
    () =>
      new Set(
        summaries.filter((summary) => summary.shapeName && summary.draftedCount > 0)
          .map((summary) => summary.shapeName)
      ),
    [summaries]
  );

  const unmatched = summaries.filter((summary) => !summary.shapeName);
  const selected = summaries.find((summary) => summary.country === selectedCountry) ?? null;
  const hovered = summaries.find((summary) => summary.country === hoveredCountry) ?? null;

  if (error) return <p className={styles.error}>{error}</p>;
  if (!stages) return <p className={styles.status}>Loading stage catalog…</p>;
  if (summaries.length === 0) return <p className={styles.status}>The stage catalog is empty.</p>;

  return (
    <div className={styles.explore}>
      <WorldMap
        summariesByShapeName={summariesByShapeName}
        selectedShapeName={selected?.shapeName ?? null}
        onSelect={setSelectedCountry}
        onHover={setHoveredCountry}
        draftedShapeNames={draftedShapeNames}
      />

      {/* Hover readout under the map instead of a floating tooltip chasing
          the cursor -- fits the timing-sheet look, and a reserved line
          can't cover other countries or jitter the layout. aria-hidden:
          hover state is pointer-only by nature; keyboard/SR users get the
          same numbers from the country list, which is the real control. */}
      <p className={styles.mapReadout} aria-hidden="true">
        {hovered
          ? `${hovered.country} — ${hovered.stageCount} ${hovered.stageCount === 1 ? 'stage' : 'stages'}`
          : 'Highlighted countries have stages — click one to inspect'}
      </p>

      {/* #106: catalog country names the static name->shape mapping can't
          place on the map are flagged here, subtly, instead of silently
          missing from the picture -- they remain fully browsable through
          the list below. */}
      {unmatched.length > 0 && (
        <p className={styles.unmatchedNote}>
          Not on the map: {unmatched.map((summary) => summary.country).join(', ')} — see the
          country list.
        </p>
      )}

      <div className={styles.columns}>
        {/* The map's keyboard/screen-reader equivalent (#106): same
            countries, same counts, as real buttons. This list is the
            primary control; the map is the visual on top of it. */}
        <nav className={styles.countryList} aria-label="Countries with stages">
          <h3 className={styles.columnHeading}>Countries</h3>
          <ul className={styles.countryItems}>
            {summaries.map((summary) => (
              <li key={summary.country}>
                <button
                  type="button"
                  className={styles.countryButton}
                  data-drafted={summary.draftedCount > 0}
                  aria-pressed={summary.country === selectedCountry}
                  onClick={() => setSelectedCountry(summary.country)}
                >
                  {/* Empty-content dot instead of text -- the count already
                      says "N stages"; this only needs to say "some of them
                      are already in your rally" at a glance. */}
                  {summary.draftedCount > 0 && (
                    <span className={styles.draftedDot} aria-hidden="true" />
                  )}
                  <span className={styles.countryName}>{summary.country}</span>
                  {!summary.shapeName && <span className={styles.offMapTag}>not on map</span>}
                  <span className={styles.countryCount}>{summary.stageCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className={styles.detail} aria-live="polite">
          {selected ? (
            <CountryDetail summary={selected} draftedCounts={draftedCounts} onAddStage={handleAddStage} />
          ) : (
            <p className={styles.placeholder}>Select a country to see its stages and conditions.</p>
          )}
        </section>
      </div>

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}

// Detail panel for one country summary. Same file rather than its own
// component folder -- it renders one prop and has no behavior, the same
// "local helper, not a shared component" line StageConfigModal draws for
// its in-modal picker.
function CountryDetail({ summary, draftedCounts, onAddStage }) {
  const { kmRange } = summary;
  const distance = kmRange
    ? kmRange.min === kmRange.max
      ? formatKm(kmRange.min)
      : `${formatKm(kmRange.min)} – ${formatKm(kmRange.max)}`
    : '—';
  const weatherMore = summary.weatherTotal - summary.weatherSample.length;

  return (
    <>
      <h3 className={styles.detailHeading}>{summary.country}</h3>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Stages</dt>
          <dd>{summary.stageCount}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Length</dt>
          <dd>{distance}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Surfaces</dt>
          <dd>
            {summary.surfaces.length > 0
              ? summary.surfaces.map(({ surface, count }) => `${surface} ×${count}`).join(' · ')
              : '—'}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Wetness</dt>
          <dd>{summary.wetnessOptions.length > 0 ? summary.wetnessOptions.join(' · ') : '—'}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Weather</dt>
          <dd>
            {summary.weatherSample.length > 0 ? summary.weatherSample.join(' · ') : '—'}
            {weatherMore > 0 && <span className={styles.weatherMore}> +{weatherMore} more</span>}
          </dd>
        </div>
      </dl>

      <ul className={styles.stageList}>
        {summary.stages.map((stage) => {
          const draftedCount = draftedCounts.get(stage.id) ?? 0;
          return (
            <li key={stage.id} className={styles.stageRow} data-drafted={draftedCount > 0}>
              <span className={styles.stageName}>{stage.name}</span>
              {/* Duplicates are legal rally bricks (two runs of the same
                  stage), so this says "already in your rally" rather than
                  toggling on/off -- ×N confirms which count applies when a
                  stage's been added more than once. */}
              {draftedCount > 0 && (
                <span className={styles.draftedTag}>
                  ✓ in rally{draftedCount > 1 ? ` ×${draftedCount}` : ''}
                </span>
              )}
              <span className={styles.stageMeta}>
                {stage.surface} · {stage.length}
              </span>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => onAddStage(stage)}
                // The row already names the stage visually; the label makes
                // the button unambiguous in a screen-reader button list.
                aria-label={`Add ${stage.name} to rally draft`}
              >
                + Add
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
