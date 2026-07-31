import { useEffect, useMemo, useRef, useState } from 'react';
import { ServiceChip } from '../ServiceChip/ServiceChip.jsx';
import { loadStageConfigDraft, saveStageConfigDraft, clearStageConfigDraft } from '../../lib/stageConfigDraft.js';
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
  const [country, setCountry] = useState('');
  const [surface, setSurface] = useState('');

  const countries = useMemo(() => [...new Set(stages.map((s) => s.country))].sort(), [stages]);
  const surfaces = useMemo(() => [...new Set(stages.map((s) => s.surface))].sort(), [stages]);

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
// Sentinel select value for the "type it in yourself" fallback option --
// distinct from any real weather string so it can never collide.
const CUSTOM_WEATHER_VALUE = '__custom__';

export function StageConfigModal({ mode, initialValue, stages, options, isLastStage, onSave, onCancel }) {
  const [draft, setDraft] = useState(initialValue);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  // Whether the Weather field is showing its free-text fallback instead of
  // the dropdown. tracksettings_id's known values are just examples
  // observed for one stage/leg combo (see rallyOptions.js on the backend --
  // "likely tied to the leg's scheduled time of day, not a fixed global
  // list"), so a dropdown of only those 3 could otherwise strand a real
  // site value that isn't in the list yet. Starts true if the current
  // value isn't one of the known examples, so an existing/restored draft
  // with an unlisted value doesn't get silently clobbered by the select.
  const [customWeather, setCustomWeather] = useState(
    () => !!initialValue?.tracksettings_id && !options.weatherOptions?.includes(initialValue.tracksettings_id)
  );
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
        setCustomWeather(!!saved.draft.tracksettings_id && !options.weatherOptions?.includes(saved.draft.tracksettings_id));
        setRestoredFromDraft(true);
        return;
      }
    }
    setDraft(initialValue);
    setCustomWeather(!!initialValue?.tracksettings_id && !options.weatherOptions?.includes(initialValue.tracksettings_id));
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

  // Lets the user explicitly bail out of a restored draft back to the
  // "normal" starting point (previous-stage seed / the brick's saved
  // values) if the recovered in-progress edit isn't what they wanted.
  function handleDiscardDraft() {
    clearStageConfigDraft();
    setDraft(initialValue);
    setCustomWeather(!!initialValue?.tracksettings_id && !options.weatherOptions?.includes(initialValue.tracksettings_id));
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
          <StagePicker stages={stages} selectedStageId={draft.stage_id} onSelect={(id) => patch({ stage_id: id })} />
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

        <div className={styles.formGroup}>
          <label htmlFor="modal-wetness">Wetness</label>
          <select
            id="modal-wetness"
            value={draft.wetness_id}
            onChange={(e) => patch({ wetness_id: e.target.value })}
          >
            {options.wetnessOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="modal-tracksettings">Weather</label>
          {/* options.weatherOptions is only a few examples observed for one
              stage/leg combo, not a confirmed exhaustive list (see the
              backend's rallyOptions.js) -- so unlike every other dropdown
              here, this one keeps an escape hatch: picking "Other" swaps to
              a free-text input instead of silently limiting the user to the
              3 known examples. */}
          {!customWeather ? (
            <select
              id="modal-tracksettings"
              value={draft.tracksettings_id}
              onChange={(e) => {
                if (e.target.value === CUSTOM_WEATHER_VALUE) {
                  setCustomWeather(true);
                  return;
                }
                patch({ tracksettings_id: e.target.value });
              }}
            >
              {options.weatherOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value={CUSTOM_WEATHER_VALUE}>Other (type manually)...</option>
            </select>
          ) : (
            <div className={styles.customWeatherRow}>
              <input
                id="modal-tracksettings"
                type="text"
                placeholder="e.g. Morning Clear Crisp"
                value={draft.tracksettings_id}
                onChange={(e) => patch({ tracksettings_id: e.target.value })}
              />
              <button
                type="button"
                className={styles.customWeatherBackButton}
                onClick={() => {
                  setCustomWeather(false);
                  if (!options.weatherOptions.includes(draft.tracksettings_id)) {
                    patch({ tracksettings_id: options.weatherOptions[0] ?? '' });
                  }
                }}
              >
                Choose from list
              </button>
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="modal-tyre">Default tyre</label>
          <select id="modal-tyre" value={draft.def_tyre_id} onChange={(e) => patch({ def_tyre_id: e.target.value })}>
            {options.tyreOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
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
