import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '../Input/Input.jsx';
import { loadStagePickerFilters, saveStagePickerFilters } from '../../lib/stagePickerFilters.js';
import { getStageThumbnailsEnabled, setStageThumbnailsEnabled } from '../../lib/settings.js';
import styles from './StagePicker.module.css';

// rbr-rally-creator-web#100: how long a card must be hovered before the
// larger preview appears -- long enough that just sweeping the pointer
// across the grid to scan names doesn't pop up a preview per card, short
// enough that pausing on one still feels responsive.
const THUMBNAIL_PREVIEW_DELAY_MS = 500;

// Click-to-select stage picker. Lived inside StageConfigModal.jsx since the
// modal was built; extracted to its own file for rbr-rally-creator-web#107
// (docs/redesign/07-picker-workspace.md, Phase 0) so the upcoming
// PickerWorkspace can host it without dragging the whole modal along. The
// extraction is move-only -- no behavior change.
//
// DESIGN_SPEC.md leaves open whether this reuses StageCatalogPanel's
// internals or gets its own simpler list -- StageCatalogPanel's cards are
// drag *sources* (`useDraggable`, namespaced `catalog-stage-${id}` ids) for
// the now-removed drag-onto-slot flow, so reusing them as-is would drag
// along dead dnd-kit wiring for an interaction this picker doesn't support
// (picking is click-only). Rebuilding the same filter logic
// (name/country/surface) as a plain click-to-select list is a handful of
// lines and keeps this component free of drag concerns entirely -- StageCatalogPanel
// itself is left untouched for whatever future drag-and-drop-creation phase
// might still want it.
//
// THROWAWAY: dev-only comparison tool, delete after Erik picks a variant (#107 follow-up).
// `stagePlanCounts` (optional) is the only change on this file for that
// tool: a Map/plain-object of catalog stage_id -> how many times it already
// appears in the current rally's stagePlan. Left undefined by every real
// caller today (PickerWorkspace.jsx, StageEntryEditor.jsx aren't touched),
// so the lookup below is always a no-op miss and nothing renders -- the
// decoration only shows up inside StagePickerVariantDemo.jsx, which passes
// fake counts. Once a variant is picked for real, this prop should carry
// real data end-to-end instead of being demo-only.
export function StagePicker({ stages, selectedStageId, onSelect, stagePlanCounts }) {
  const [nameFilter, setNameFilter] = useState('');
  const saved = useMemo(() => loadStagePickerFilters() ?? {}, []);
  // rbr-rally-creator-web#99: editing an already-picked stage should show
  // the picker already scoped to it (and its siblings) instead of whatever
  // filter happened to be left over from a previous, unrelated pick --
  // takes priority over the persisted filters, but only on this initial
  // mount (opening the modal fresh each time, per StageConfigModal's own
  // per-open mount/unmount), not on every selection change within an
  // already-open picker.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialStage = useMemo(() => stages.find((s) => s.id === selectedStageId) ?? null, []);
  const [country, setCountry] = useState(initialStage?.country ?? saved.country ?? '');
  const [surface, setSurface] = useState(initialStage?.surface ?? saved.surface ?? '');

  const countries = useMemo(() => [...new Set(stages.map((s) => s.country))].sort(), [stages]);
  const surfaces = useMemo(() => [...new Set(stages.map((s) => s.surface))].sort(), [stages]);

  // rbr-rally-creator-web#100: thumbnails are an optional, persisted display
  // setting -- lazy useState initializer reads localStorage once on mount,
  // same pattern as everywhere else in this file (loadStagePickerFilters
  // above).
  const [thumbnailsEnabled, setThumbnailsEnabled] = useState(() => getStageThumbnailsEnabled());

  function handleToggleThumbnails(enabled) {
    setThumbnailsEnabled(enabled);
    setStageThumbnailsEnabled(enabled);
  }

  // rbr-rally-creator-web#100: hover-preview -- a larger version of the
  // thumbnail floating near the cursor, after a pause (not immediately) so
  // sweeping across the grid doesn't flash a preview per card. `hoverStage`
  // is null when nothing's being previewed; timer + latest pointer position
  // live in refs since neither needs to trigger a render on their own (only
  // the eventual setHoverStage/setHoverPos calls do).
  const [hoverStage, setHoverStage] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef(null);

  function handleCardMouseEnter(stage, e) {
    setHoverPos({ x: e.clientX, y: e.clientY });
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (!stage.imageUrl) return;
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      setHoverStage(stage);
    }, THUMBNAIL_PREVIEW_DELAY_MS);
  }

  function handleCardMouseMove(e) {
    setHoverPos({ x: e.clientX, y: e.clientY });
  }

  function handleCardMouseLeave() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverStage(null);
  }

  // The delay timer is per-hover, not tied to component lifetime, but a
  // still-pending one needs clearing if the picker itself unmounts mid-delay
  // (e.g. the user clicks a card, closing the modal, while a preview was
  // about to appear) -- otherwise it'd fire setHoverStage on an unmounted
  // component.
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Stale-value guard: if the restored filter value isn't in the current catalog,
  // reset it to '' to avoid a permanently-empty stage list if the catalog changes.
  useEffect(() => {
    if (country && !countries.includes(country)) {
      setCountry('');
    }
    if (surface && !surfaces.includes(surface)) {
      setSurface('');
    }
  }, [countries, surfaces, country, surface]);

  // Persist country and surface filters on every change.
  useEffect(() => {
    saveStagePickerFilters({ country, surface });
  }, [country, surface]);

  // THROWAWAY: dev-only comparison tool (#107 follow-up). Accepts either a
  // Map or a plain object for stagePlanCounts since the eventual real caller
  // hasn't been decided yet -- cheaper to support both here than to force
  // that decision now for a prop only the demo currently uses.
  function getStagePlanCount(stageId) {
    if (!stagePlanCounts) return 0;
    if (stagePlanCounts instanceof Map) return stagePlanCounts.get(stageId) ?? 0;
    return stagePlanCounts[stageId] ?? 0;
  }

  const filteredStages = useMemo(() => {
    const lc = nameFilter.trim().toLowerCase();
    return stages.filter((s) => {
      if (country && s.country !== country) return false;
      if (surface && s.surface !== surface) return false;
      if (lc && !s.name.toLowerCase().includes(lc)) return false;
      return true;
    });
  }, [stages, nameFilter, country, surface]);

  return (
    <div className={styles.picker}>
      <div className={styles.pickerFilters}>
        <Input
          type="text"
          size="sm"
          placeholder="Filter by name..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className={styles.pickerFilterInput}
        />
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={surface} onChange={(e) => setSurface(e.target.value)}>
          <option value="">All surfaces</option>
          {surfaces.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.pickerToolbar}>
        <p className={styles.pickerCount}>
          {filteredStages.length} of {stages.length} stages
        </p>
        <label className={styles.pickerThumbnailToggle}>
          <input
            type="checkbox"
            checked={thumbnailsEnabled}
            onChange={(e) => handleToggleThumbnails(e.target.checked)}
          />
          Show thumbnails
        </label>
      </div>

      <div className={styles.pickerList}>
        {filteredStages.map((stage) => {
          // THROWAWAY: dev-only comparison tool (#107 follow-up). Count is
          // always 0 for every real caller today (see stagePlanCounts prop
          // comment above), so .pickerCardUsed and the badge/ribbon below
          // never render outside StagePickerVariantDemo.jsx.
          const usedCount = getStagePlanCount(stage.id);
          return (
            <button
              type="button"
              key={stage.id}
              className={[
                styles.pickerCard,
                stage.id === selectedStageId ? styles.pickerCardSelected : '',
                usedCount > 0 ? styles.pickerCardUsed : '',
              ].join(' ')}
              onClick={() => onSelect(stage.id)}
              onMouseEnter={(e) => handleCardMouseEnter(stage, e)}
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
            >
              {/* THROWAWAY: dev-only comparison tool (#107 follow-up). Three
                  decoration styles live side by side, each scoped by CSS to
                  only paint when the ancestor demo column sets
                  data-decoration-variant to its own number -- see
                  StagePickerVariantDemo.jsx and the .pickerCardUsed rules in
                  StagePicker.module.css. Badge shows the count except variant
                  1 at exactly 1 (border-only signal there); ribbon (variant 3)
                  carries no count at all. */}
              {usedCount > 0 && (
                <>
                  {/* Variant 1 wants the badge hidden at exactly count===1
                      (border alone signals "used" there); data-count + a CSS
                      :not() selector below does that without JS needing to
                      know which variant column it's rendering into. */}
                  <span className={styles.pickerCardBadgeV1} data-count={usedCount} aria-hidden="true">
                    {usedCount}
                  </span>
                  <span className={styles.pickerCardBadgeV2} aria-hidden="true">
                    {usedCount}
                  </span>
                  <span className={styles.pickerCardRibbonV3} aria-hidden="true" />
                </>
              )}
              {/* Fixed-size box regardless of whether imageUrl is present (rbr-rally-creator-service#15)
                  so the grid doesn't reflow as thumbnails load in, and so stages without one (older
                  catalog entries, or before the backend fix ships) still line up with ones that have it.
                  Hidden outright (not just the <img>) when thumbnailsEnabled is off, per #100's ask for
                  an optional toggle -- no empty box taking up card width once thumbnails are off. */}
              {thumbnailsEnabled && (
                <span className={styles.pickerCardThumb}>
                  {stage.imageUrl && (
                    <img src={stage.imageUrl} alt="" loading="lazy" className={styles.pickerCardThumbImg} />
                  )}
                </span>
              )}
              <span className={styles.pickerCardBody}>
                <span className={styles.pickerCardName}>{stage.name}</span>
                <span className={styles.pickerCardMeta}>
                  {stage.country} &middot; {stage.surface} &middot; {stage.length}
                </span>
              </span>
            </button>
          );
        })}
        {filteredStages.length === 0 && <p className={styles.pickerEmpty}>No stages match this filter.</p>}
      </div>

      {/* rbr-rally-creator-web#100: larger floating preview, positioned next
          to the cursor rather than anchored to the card -- simplest way to
          keep it near the pointer regardless of where in the (possibly
          scrolled) grid the hovered card sits. Rendered outside .pickerList
          so its own layout never affects the grid it floats over; fixed
          positioning means viewport coordinates (clientX/clientY) are the
          right coordinate space, no scroll-offset math needed. Suppressed
          entirely when thumbnails are toggled off -- nothing to preview. */}
      {thumbnailsEnabled && hoverStage && (
        <div
          className={styles.pickerHoverPreview}
          style={{ left: hoverPos.x + 20, top: hoverPos.y + 20 }}
          aria-hidden="true"
        >
          <img src={hoverStage.imageUrl} alt="" />
        </div>
      )}
    </div>
  );
}
