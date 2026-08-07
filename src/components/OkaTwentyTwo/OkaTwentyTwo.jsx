import { useEffect, useMemo, useRef, useState } from 'react';
import { getStages } from '../../lib/rallyApi.js';
import { aggregateStagesByCountry } from '../../lib/countryExplore.js';
import { createStageConfigForCatalogStage } from '../../lib/rallyPlan.js';
import { appendStageToCurrentDraft, countCurrentDraftStages } from '../../lib/rallyStorage.js';
import { Toast } from '../Toast/Toast.jsx';
import { WorldMap } from '../WorldMap/WorldMap.jsx';
import { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT } from '../WorldMap/worldMapShapes.js';
import styles from './OkaTwentyTwo.module.css';

// #okatwentytwo -- hidden easter egg, reachable only by typing the hash
// (App.jsx's hashchange effect; there is deliberately no nav link). The
// world map opens already zoomed on the Nordics with Sweden and Finland
// glowing (WorldMap's 'beacon' variant), and their stages are listed
// below with the same add-to-draft action as the Explore view -- the egg
// doubles as the fast lane for building a Nordic rally.

// Catalog country names, which for these two match the map's shape names
// exactly -- no resolveShapeName dance needed for a fixed pair.
const EGG_COUNTRIES = ['Sweden', 'Finland'];

// Same single-slot confirmation policy as ExploreView's add toast.
const ADD_TOAST_MS = 3500;

// The vendored map is an equirectangular projection: x spans lon
// [-180, 180] over WORLD_MAP_WIDTH, y spans lat [84, -56] top-to-bottom
// over WORLD_MAP_HEIGHT (see worldMapShapes.js's generator notes). That
// makes "open centered on (18E, 63N) at 6x" pure arithmetic instead of
// hand-tuned magic offsets.
const NORDIC_CENTER = { lon: 18, lat: 63 };
const NORDIC_ZOOM = 6;
const centerPoint = {
  x: ((NORDIC_CENTER.lon + 180) / 360) * WORLD_MAP_WIDTH,
  y: ((84 - NORDIC_CENTER.lat) / (84 - -56)) * WORLD_MAP_HEIGHT,
};
const NORDIC_TRANSFORM = {
  k: NORDIC_ZOOM,
  x: WORLD_MAP_WIDTH / 2 - centerPoint.x * NORDIC_ZOOM,
  y: WORLD_MAP_HEIGHT / 2 - centerPoint.y * NORDIC_ZOOM,
};

export function OkaTwentyTwo({ baseUrl }) {
  const [stages, setStages] = useState(null); // null = still loading
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  // Same "already in your rally" marker as ExploreView -- the map itself
  // skips it here since Sweden/Finland are already fully lit by the
  // beacon variant, but the stage rows below still benefit from it.
  const [draftedCounts, setDraftedCounts] = useState(() => countCurrentDraftStages());

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  // Own catalog fetch, same owns-its-catalog pattern (and cancellation
  // guard) as ExploreView -- the two views never show at the same time.
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
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const summaries = useMemo(
    () =>
      stages
        ? aggregateStagesByCountry(stages).filter((summary) =>
            EGG_COUNTRIES.includes(summary.country)
          )
        : [],
    [stages]
  );

  // Real stage counts in the beacon tooltips once the catalog is in;
  // before that (or if a catalog has no Swedish stages) the country still
  // glows via a count-less entry -- the egg never un-highlights its pair.
  const highlights = useMemo(() => {
    const byShapeName = new Map();
    for (const name of EGG_COUNTRIES) {
      byShapeName.set(name, summaries.find((summary) => summary.country === name) ?? { country: name });
    }
    return byShapeName;
  }, [summaries]);

  function handleAddStage(stage) {
    const count = appendStageToCurrentDraft(createStageConfigForCatalogStage(stage));
    setToastMessage(
      `Added ${stage.name} to rally draft (${count} ${count === 1 ? 'stage' : 'stages'})`
    );
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), ADD_TOAST_MS);
    setDraftedCounts(countCurrentDraftStages());
  }

  return (
    <div className={styles.egg}>
      <WorldMap
        summariesByShapeName={highlights}
        selectedShapeName={null}
        initialTransform={NORDIC_TRANSFORM}
        variant="beacon"
      />
      <p className={styles.caption}>OK A22 · Sverige &amp; Suomi · the homeland of flat-out</p>

      {error && <p className={styles.error}>{error}</p>}

      {stages && (
        <div className={styles.columns}>
          {EGG_COUNTRIES.map((country) => {
            const summary = summaries.find((s) => s.country === country);
            return (
              <section key={country} className={styles.country} aria-label={`${country} stages`}>
                <h3 className={styles.countryHeading}>
                  {country}
                  {summary && <span className={styles.countryCount}>{summary.stageCount}</span>}
                </h3>
                {summary ? (
                  <ul className={styles.stageList}>
                    {summary.stages.map((stage) => {
                      const draftedCount = draftedCounts.get(stage.id) ?? 0;
                      return (
                        <li key={stage.id} className={styles.stageRow} data-drafted={draftedCount > 0}>
                          <span className={styles.stageName}>{stage.name}</span>
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
                            onClick={() => handleAddStage(stage)}
                            aria-label={`Add ${stage.name} to rally draft`}
                          >
                            + Add
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.empty}>No stages in this catalog — flat out anyway.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}
