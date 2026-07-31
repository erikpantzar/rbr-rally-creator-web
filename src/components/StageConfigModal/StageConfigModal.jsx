import { useEffect, useMemo, useRef, useState } from 'react';
import { ServiceChip } from '../ServiceChip/ServiceChip.jsx';
import { loadStageConfigDraft, saveStageConfigDraft, clearStageConfigDraft } from '../../lib/stageConfigDraft.js';
import { getDefaultTyreForSurface, getWetTyreForSurface } from '../../lib/rallyPlan.js';
import { loadStagePickerFilters, saveStagePickerFilters } from '../../lib/stagePickerFilters.js';
import styles from './StageConfigModal.module.css';

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
  const [country, setCountry] = useState(saved.country ?? '');
  const [surface, setSurface] = useState(saved.surface ?? '');

  const countries = useMemo(() => [...new Set(stages.map((s) => s.country))].sort(), [stages]);
  const surfaces = useMemo(() => [...new Set(stages.map((s) => s.surface))].sort(), [stages]);

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
        <input
          type="text"
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

      <p className={styles.pickerCount}>
        {filteredStages.length} of {stages.length} stages
      </p>

      <div className={styles.pickerList}>
        {filteredStages.map((stage) => (
          <button
            type="button"
            key={stage.id}
            className={[styles.pickerCard, stage.id === selectedStageId ? styles.pickerCardSelected : ''].join(' ')}
            onClick={() => onSelect(stage.id)}
          >
            <span className={styles.pickerCardName}>{stage.name}</span>
            <span className={styles.pickerCardMeta}>
              {stage.country} &middot; {stage.surface} &middot; {stage.length}
            </span>
          </button>
        ))}
        {filteredStages.length === 0 && <p className={styles.pickerEmpty}>No stages match this filter.</p>}
      </div>
    </div>
  );
}

// Full-page overlay holding the full stage-config form -- stage picker,
// surface age, wetness, weather, tyre compound + choose_tyre/choose_setup,
// and the ServiceChip. Replaces the form that used to live inline in
// StageSlot's "Edit details" panel; now it's the *only* way to create or
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
// `mode` is 'add' | 'edit' | 'duplicate' purely for the title copy; add and
// duplicate both start from a blank/pre-filled draft respectively and both
// call onSave with a config that has no matching brick yet in the parent's
// eyes for 'add', while RoadBook is responsible for actually treating
// 'duplicate' as "append as new" vs 'edit' as "update in place" -- this
// component only edits a local draft and hands the finished object back.

export function StageConfigModal({
  mode,
  initialValue,
  stages,
  options,
  isLastStage,
  stageNumber,
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
  const dialogRef = useRef(null);
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

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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

  function handleCancel() {
    clearStageConfigDraft();
    onCancel();
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') handleCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

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

  const title = mode === 'edit' ? 'Edit stage' : mode === 'duplicate' ? 'Duplicate stage' : 'Add stage';

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-config-modal-title"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <button type="button" className={styles.backButton} onClick={handleCancel}>
              <span aria-hidden="true">&larr;</span> Back to rally
            </button>
            <h3 id="stage-config-modal-title">{title}</h3>
          </div>
          <button
            type="submit"
            form="stage-config-form"
            className={styles.headerSaveButton}
            disabled={!draft.stage_id}
          >
            Save
          </button>
        </div>
      </div>

      {restoredFromDraft && (
        <div className={styles.restoredNotice}>
          <span>Restored your unsaved changes from before.</span>
          <button type="button" onClick={handleDiscardDraft}>
            Discard &amp; start fresh
          </button>
        </div>
      )}

      <form id="stage-config-form" className={styles.form} onSubmit={handleSave}>
        <div className={styles.formGroup}>
          <label>Stage</label>
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
        </div>

        {/* rbr-rally-creator-web#64: per the maintainer's own comment on the
            issue (superseding an earlier generic-UX-consult pass), the real
            site has no per-stage custom-name mechanism at all -- confirmed
            via both the discovery schema and the raw captured DOM (14 real
            controls on the stage step, not one a text input). So this is
            shown always, not gated on the unrelated hidden_stage_name
            toggle (that checkbox only ever hides the real name from
            participants server-side; it has no bearing on whether a local
            planning nickname is useful). Placeholder shows "Stage N" for
            this stage's position so the user still knows which physical
            stage they're naming without that number being something they'd
            type over blindly. */}
        <div className={styles.formGroup}>
          <label htmlFor="modal-label">Nickname (optional)</label>
          <input
            id="modal-label"
            type="text"
            placeholder={stageNumber ? `Stage ${stageNumber}` : 'e.g. Stage 3'}
            value={draft._label ?? ''}
            onChange={(e) => patch({ _label: e.target.value })}
          />
          <p className={styles.fieldNote}>
            For your own planning view only — this does not appear on rallysimfans.hu and participants never see it.
          </p>
        </div>

        <div className={styles.formGroup}>
          <label>Surface age</label>
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
        </div>

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
            <div className={styles.formGroup}>
              <label htmlFor="modal-wetness">Wetness</label>
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
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="modal-tracksettings">Weather</label>
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
            </div>
          </>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="modal-tyre">Default tyre</label>
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
                <button type="button" onClick={() => patch({ def_tyre_id: suggestedWetTyre })}>
                  Apply
                </button>
                <button type="button" onClick={() => setDismissedWetSuggestion(true)}>
                  Ignore
                </button>
              </div>
            </div>
          )}
        </div>

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

        <div className={styles.formGroup}>
          <label>Service</label>
          <ServiceChip
            serviceTime={draft.service_time}
            nummechanics={draft.nummechanics}
            mechanicsSkill={draft.mechanicsSkill}
            options={options}
            disabled={isLastStage}
            disabledReason={
              isLastStage ? 'Service is disabled on the rally’s final stage (enforced by the site).' : null
            }
            onChange={patch}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.saveButton} disabled={!draft.stage_id}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
