import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { FormGroup, FormActions } from '../FormGroup/FormGroup.jsx';
import { Input } from '../Input/Input.jsx';
import { Modal } from '../Modal/Modal.jsx';
import { ServiceBlock } from '../ServiceBlock/ServiceBlock.jsx';
import { ServiceConfigModal } from '../ServiceConfigModal/ServiceConfigModal.jsx';
import { loadStageConfigDraft, saveStageConfigDraft, clearStageConfigDraft } from '../../lib/stageConfigDraft.js';
import { getDefaultTyreForSurface, getWetTyreForSurface } from '../../lib/rallyPlan.js';
import { loadStagePickerFilters, saveStagePickerFilters } from '../../lib/stagePickerFilters.js';
import { getStageThumbnailsEnabled, setStageThumbnailsEnabled } from '../../lib/settings.js';
import styles from './StageConfigModal.module.css';

// rbr-rally-creator-web#100: how long a card must be hovered before the
// larger preview appears -- long enough that just sweeping the pointer
// across the grid to scan names doesn't pop up a preview per card, short
// enough that pausing on one still feels responsive.
const THUMBNAIL_PREVIEW_DELAY_MS = 500;

// In-modal stage picker. DESIGN_SPEC.md leaves open whether this reuses
// StageCatalogPanel's internals or gets its own simpler list -- StageCatalogPanel's
// cards are drag *sources* (`useDraggable`, namespaced `catalog-stage-${id}`
// ids) for the now-removed drag-onto-slot flow, so reusing them as-is would
// drag along dead dnd-kit wiring for an interaction this modal doesn't
// support (picking is click-only). Rebuilding the same filter logic
// (name/country/surface) as a plain click-to-select list is a handful of
// lines and keeps this component free of drag concerns entirely -- StageCatalogPanel
// itself is left untouched for whatever future drag-and-drop-creation phase
// might still want it.
function StagePicker({ stages, selectedStageId, onSelect }) {
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
        {filteredStages.map((stage) => (
          <button
            type="button"
            key={stage.id}
            className={[styles.pickerCard, stage.id === selectedStageId ? styles.pickerCardSelected : ''].join(' ')}
            onClick={() => onSelect(stage.id)}
            onMouseEnter={(e) => handleCardMouseEnter(stage, e)}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
          >
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
        ))}
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

// Full-page overlay holding the full stage-config form -- stage picker,
// surface age, wetness, weather, tyre compound + choose_tyre/choose_setup,
// and a "Service" summary button that opens the sibling ServiceConfigModal
// (rbr-rally-creator-web#80; retired the old inline ServiceChip editor in
// favor of that one shared editing surface). Replaces the form that used
// to live inline in StageSlot's "Edit details" panel; now it's the *only*
// way to create or
// edit a brick's config (per DESIGN_SPEC.md: "clicking it opens a
// dialog... on save, the dialog closes and a new brick appears").
//
// Was originally a centered backdrop+dialog; rbr-rally-creator-web#16 asked
// for a full-screen overlay instead ("its full view... a full layer on top
// of the app") with the close (x) replaced by an explicit "<- Back to
// rally" affordance and Save always reachable without scrolling. There's no
// "outside" to click on a full-page layer, so the old click-outside-closes
// backdrop behavior is gone; Escape still closes it (now via the same
// handleCancel as the Back button) since that's still a reasonable "back
// out" shortcut in a full-page context.
//
// Plain React overlay -- no modal/dialog dependency exists in package.json,
// and this doesn't need more than Escape + focus-on-open to satisfy the
// spec.
//
// `mode` is 'add' | 'edit' purely for the title copy; 'add' starts from a
// blank draft and calls onSave with a config that has no matching brick yet
// in the parent's eyes, while RoadBook is responsible for treating 'edit'
// as "update in place" -- this component only edits a local draft and hands
// the finished object back.

export function StageConfigModal({
  mode,
  initialValue,
  stages,
  options,
  isLastStage,
  stageNumber,
  hiddenStageNameEnabled = false,
  onSave,
  onCancel,
}) {
  const [draft, setDraft] = useState(initialValue);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  // Whether the wet-tyre suggestion banner (see below) has been explicitly
  // dismissed for the current wetness/stage combo. Reset to false whenever
  // either changes (effect further down) so a fresh trigger of the
  // condition -- switching to a different surface, or leaving and
  // returning to 'wet' -- surfaces the suggestion again rather than staying
  // silenced forever after one dismissal.
  const [dismissedWetSuggestion, setDismissedWetSuggestion] = useState(false);
  // rbr-rally-creator-web#80: whether the "Service" summary button below
  // has opened its own ServiceConfigModal -- entirely local to this modal
  // instance (there's exactly one stage being edited here, `draft`, so no
  // uid/stage lookup is needed the way RoadBook's serviceModalState needs
  // one). Saving from it just patches the local draft same as any other
  // field; nothing is written to stagePlan until this modal's own Save.
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const hasCheckedStorageRef = useRef(false);

  // On first mount, prefer a matching abandoned in-progress draft (see
  // stageConfigDraft.js) over the freshly-computed initialValue -- but only
  // if it looks like genuine progress (a stage was actually picked), so a
  // draft that's just the untouched seed doesn't shadow a legitimate fresh
  // previous-stage-seeded default (rbr-rally-creator-web#5). Subsequent
  // initialValue changes (while this instance stays mounted) just reset the
  // draft normally -- the storage check only ever happens once per open.
  useEffect(() => {
    if (!hasCheckedStorageRef.current) {
      hasCheckedStorageRef.current = true;
      const saved = loadStageConfigDraft();
      const sameTarget = saved && saved.mode === mode && (mode !== 'edit' || saved.targetUid === initialValue?._uid);
      if (sameTarget && saved.draft?.stage_id) {
        setDraft(saved.draft);
        setRestoredFromDraft(true);
        return;
      }
    }
    setDraft(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue, mode]);

  // Save every change immediately so a refresh or closed tab mid-edit can
  // be recovered -- debouncing isn't worth the complexity here, this is a
  // small object and localStorage writes are cheap.
  useEffect(() => {
    saveStageConfigDraft({
      mode,
      targetUid: mode === 'edit' ? (initialValue?._uid ?? null) : null,
      draft,
      savedAt: Date.now(),
    });
  }, [draft, mode, initialValue]);

  // Escape/focus wiring lives in Modal (useDialogChrome) -- handed
  // handleCancel rather than onCancel directly so backing out via Escape
  // still clears the recovery draft, same as the Back/Cancel buttons.
  function handleCancel() {
    clearStageConfigDraft();
    onCancel();
  }

  function patch(fields) {
    setDraft((prev) => ({ ...prev, ...fields }));
  }

  // Re-arm the wet-tyre suggestion whenever its trigger conditions change --
  // a newly-picked stage (different surface) or a fresh transition into
  // 'wet' should both get their own chance to suggest, rather than staying
  // silenced because an earlier, unrelated dismissal happened to still be in
  // effect.
  useEffect(() => {
    setDismissedWetSuggestion(false);
  }, [draft.stage_id, draft.wetness_id]);

  const selectedStage = useMemo(
    () => stages.find((s) => s.id === draft.stage_id) ?? null,
    [stages, draft.stage_id]
  );
  // Suggestion only -- per the issue's own title ("dont enforce it"), this
  // never auto-applies. It disappears (without needing an explicit dismiss)
  // as soon as any part of the condition it was suggesting for stops
  // holding: wetness moved off 'wet', the tyre already matches the wet
  // variant (e.g. the user applied it, or picked it themselves from the
  // dropdown), or the surface has no wet variant (snow).
  const suggestedWetTyre = selectedStage ? getWetTyreForSurface(selectedStage.surface) : null;
  const showWetTyreSuggestion =
    draft.wetness_id === 'wet' &&
    !!suggestedWetTyre &&
    draft.def_tyre_id !== suggestedWetTyre &&
    !dismissedWetSuggestion;

  // Lets the user explicitly bail out of a restored draft back to the
  // "normal" starting point (previous-stage seed / the brick's saved
  // values) if the recovered in-progress edit isn't what they wanted.
  function handleDiscardDraft() {
    clearStageConfigDraft();
    setDraft(initialValue);
    setRestoredFromDraft(false);
  }

  function handleSave(e) {
    e.preventDefault();
    clearStageConfigDraft();
    onSave(draft);
  }

  const title = mode === 'edit' ? 'Edit stage' : 'Add stage';

  return (
    <Modal variant="takeover" labelledBy="stage-config-modal-title" onClose={handleCancel}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <button type="button" className={styles.backButton} onClick={handleCancel}>
              <span aria-hidden="true">&larr;</span> Back to rally
            </button>
            <h3 id="stage-config-modal-title">{title}</h3>
          </div>
          <Button
            type="submit"
            form="stage-config-form"
            variant="primary"
            className={styles.headerSaveButton}
            disabled={!draft.stage_id}
          >
            Save
          </Button>
        </div>
      </div>

      {restoredFromDraft && (
        <div className={styles.restoredNotice}>
          <span>Restored your unsaved changes from before.</span>
          <Button type="button" variant="secondary" size="sm" onClick={handleDiscardDraft}>
            Discard &amp; start fresh
          </Button>
        </div>
      )}

      <form id="stage-config-form" className={styles.form} onSubmit={handleSave}>
        <FormGroup label="Stage">
          <StagePicker
            stages={stages}
            selectedStageId={draft.stage_id}
            onSelect={(id) => {
              // Default the tyre to match the newly-picked stage's surface
              // (rbr-rally-creator-web#24) -- a convenience default the user
              // can still freely change below, not an enforced pairing. No
              // change if the surface isn't recognised (defensive; every
              // catalog entry currently has one of tarmac/gravel/snow).
              const stage = stages.find((s) => s.id === id);
              const defaultTyre = stage ? getDefaultTyreForSurface(stage.surface) : null;
              // Wetness/weather option lists are per-stage (see
              // discovery/capabilities/stages.json on the backend), so a
              // value valid for the previous stage may not exist on this
              // one -- reset both to the new stage's first option.
              patch({
                stage_id: id,
                ...(defaultTyre ? { def_tyre_id: defaultTyre } : {}),
                wetness_id: stage?.wetnessOptions?.[0] ?? '',
                tracksettings_id: stage?.weatherOptions?.[0] ?? '',
              });
            }}
          />
        </FormGroup>

        {/* rbr-rally-creator-web#64: a purely local planning nickname --
            shown always, not gated on hidden_stage_name (that checkbox
            controls the real public name field below instead). Placeholder
            shows "Stage N" for this stage's position so the user still
            knows which physical stage they're naming without that number
            being something they'd type over blindly. */}
        <FormGroup label="Nickname (optional)" htmlFor="modal-label">
          <Input
            id="modal-label"
            size="md"
            type="text"
            placeholder={stageNumber ? `Stage ${stageNumber}` : 'e.g. Stage 3'}
            value={draft._label ?? ''}
            onChange={(e) => patch({ _label: e.target.value })}
          />
          <p className={styles.fieldNote}>
            For your own planning view only — this does not appear on rallysimfans.hu and participants never see it.
          </p>
        </FormGroup>

        {/* rbr-rally-creator-service#20: the real public per-stage name
            shown to participants on rallysimfans.hu -- only rendered (and
            only meaningful) when "Hide stage names" is checked in Rally
            basics, matching the site's own #stage_name field, which only
            appears in that same condition. Distinct from the always-visible
            local Nickname field above. */}
        {hiddenStageNameEnabled && (
          <FormGroup label="Hidden stage name" htmlFor="modal-hidden-name">
            <Input
              id="modal-hidden-name"
              size="md"
              type="text"
              placeholder="Name shown to participants instead of the real stage name"
              value={draft.hidden_name ?? ''}
              onChange={(e) => patch({ hidden_name: e.target.value })}
            />
            <p className={styles.fieldNote}>
              Shown to participants on rallysimfans.hu in place of this stage's real name.
            </p>
          </FormGroup>
        )}

        <FormGroup label="Surface age">
          <div className={styles.radioGroup}>
            {options.surfaceAge.map((age) => (
              <label key={age.value} className={styles.radioLabel}>
                <input
                  type="radio"
                  name="surface-age"
                  value={age.value}
                  checked={draft.surface_age_id === age.value}
                  onChange={(e) => patch({ surface_age_id: e.target.value })}
                />
                {age.label}
              </label>
            ))}
          </div>
        </FormGroup>

        {/* rbr-rally-creator-web#79: wetness/weather options are per-stage
            (see selectedStage.wetnessOptions/weatherOptions above), so with
            no stage picked yet there's nothing to populate these with --
            showing them disabled-but-empty read as "broken" rather than "not
            applicable yet". Hidden outright until a stage is selected;
            StagePicker's onSelect already seeds both fields from the newly
            picked stage's first option, so they appear already populated
            the moment the fields themselves appear. */}
        {selectedStage && (
          <>
            <FormGroup label="Wetness" htmlFor="modal-wetness">
              <select
                id="modal-wetness"
                value={draft.wetness_id}
                onChange={(e) => patch({ wetness_id: e.target.value })}
              >
                {(selectedStage.wetnessOptions ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </FormGroup>

            <FormGroup label="Weather" htmlFor="modal-tracksettings">
              <select
                id="modal-tracksettings"
                value={draft.tracksettings_id}
                onChange={(e) => patch({ tracksettings_id: e.target.value })}
              >
                {(selectedStage.weatherOptions ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </FormGroup>
          </>
        )}

        <FormGroup label="Default tyre" htmlFor="modal-tyre">
          <select id="modal-tyre" value={draft.def_tyre_id} onChange={(e) => patch({ def_tyre_id: e.target.value })}>
            {options.tyreOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {showWetTyreSuggestion && (
            <div className={styles.tyreSuggestion}>
              <span>Wet conditions &mdash; switch to {suggestedWetTyre}?</span>
              <div className={styles.tyreSuggestionActions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => patch({ def_tyre_id: suggestedWetTyre })}>
                  Apply
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setDismissedWetSuggestion(true)}>
                  Ignore
                </Button>
              </div>
            </div>
          )}
        </FormGroup>

        <div className={styles.checkboxes}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={draft.choose_tyre}
              onChange={(e) => patch({ choose_tyre: e.target.checked })}
            />
            Allow tyre choice
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={draft.choose_setup}
              onChange={(e) => patch({ choose_setup: e.target.checked })}
            />
            Allow setup choice
          </label>
        </div>

        <FormGroup label="Service">
          {/* rbr-rally-creator-web#80: opens the same ServiceConfigModal
              the road book's leg-row blue blocks use, rather than keeping
              a separate inline editor here -- one editing surface for
              service, reachable from two entry points. */}
          <ServiceBlock
            variant="summary"
            serviceTime={draft.service_time}
            disabled={isLastStage}
            disabledReason={
              isLastStage ? 'Service is disabled on the rally’s final stage (enforced by the site).' : null
            }
            onClick={() => setServiceModalOpen(true)}
          />
          {isLastStage && (
            <p className={styles.fieldNote}>Service is disabled on the rally’s final stage (enforced by the site).</p>
          )}
        </FormGroup>

        <FormActions>
          <Button type="button" variant="secondary" size="md" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={!draft.stage_id}>
            Save
          </Button>
        </FormActions>
      </form>

      {/* rbr-rally-creator-web#80: sibling modal, opened on top of this one
          -- no stage picker inside it, since "which stage" is just this
          modal's own `draft`. Saving patches `draft` locally; nothing hits
          stagePlan until this outer modal's own Save/onSave. */}
      {serviceModalOpen && (
        <ServiceConfigModal
          value={draft}
          options={options}
          stageNumber={stageNumber}
          isLastStage={isLastStage}
          onSave={(serviceFields) => {
            patch(serviceFields);
            setServiceModalOpen(false);
          }}
          onCancel={() => setServiceModalOpen(false)}
        />
      )}
    </Modal>
  );
}
