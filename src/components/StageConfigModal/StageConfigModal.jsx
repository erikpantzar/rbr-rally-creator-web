import { useEffect, useMemo, useRef, useState } from 'react';
import { ServiceChip } from '../ServiceChip/ServiceChip.jsx';
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

// Modal dialog holding the full stage-config form -- stage picker, surface
// age, wetness, weather, tyre compound + choose_tyre/choose_setup, and the
// ServiceChip. Replaces the form that used to live inline in StageSlot's
// "Edit details" panel; now it's the *only* way to create or edit a brick's
// config (per DESIGN_SPEC.md: "clicking it opens a modal dialog... on save,
// the modal closes and a new brick appears").
//
// Plain React dialog -- no modal/dialog dependency exists in package.json,
// and this doesn't need more than a backdrop + Escape/click-outside +
// focus-on-open to satisfy the spec.
//
// `mode` is 'add' | 'edit' | 'duplicate' purely for the title copy; add and
// duplicate both start from a blank/pre-filled draft respectively and both
// call onSave with a config that has no matching brick yet in the parent's
// eyes for 'add', while RoadBook is responsible for actually treating
// 'duplicate' as "append as new" vs 'edit' as "update in place" -- this
// component only edits a local draft and hands the finished object back.
export function StageConfigModal({ mode, initialValue, stages, options, isLastStage, onSave, onCancel }) {
  const [draft, setDraft] = useState(initialValue);
  const dialogRef = useRef(null);

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function patch(fields) {
    setDraft((prev) => ({ ...prev, ...fields }));
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onCancel();
  }

  function handleSave(e) {
    e.preventDefault();
    onSave(draft);
  }

  const title = mode === 'edit' ? 'Edit stage' : mode === 'duplicate' ? 'Duplicate stage' : 'Add stage';

  return (
    <div className={styles.backdrop} onMouseDown={handleBackdropClick}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-config-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h3 id="stage-config-modal-title">{title}</h3>
          <button type="button" className={styles.closeButton} onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSave}>
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
            <input
              id="modal-wetness"
              type="text"
              placeholder="e.g. dry, damp, wet"
              value={draft.wetness_id}
              onChange={(e) => patch({ wetness_id: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="modal-tracksettings">Weather</label>
            <input
              id="modal-tracksettings"
              type="text"
              placeholder="e.g. Morning Clear Crisp"
              value={draft.tracksettings_id}
              onChange={(e) => patch({ tracksettings_id: e.target.value })}
            />
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
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton} disabled={!draft.stage_id}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
