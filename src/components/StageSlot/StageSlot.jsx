import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ServiceChip } from '../ServiceChip/ServiceChip.jsx';
import styles from './StageSlot.module.css';

// One slot in the road book -- a fixed position (1..rallyBasics.stages)
// that either sits empty (drag a catalog card onto it) or holds a real
// stage plus its full wizard config. Sortable via dnd-kit so it can be
// dragged to reorder within a leg or across a leg boundary (RoadBook owns
// the DndContext and does the actual reordering/leg-count math on drop --
// this component only reports its own uid and renders per the current
// value, same "simple in, simple out" convention as before).
//
// Tyre/service-time/mechanics/surface-age option lists come from the
// service's GET /catalog/rally-options (the `options` prop) -- it's the
// single source of truth verified against the real site's wizard, not a
// local copy.
export function StageSlot({ uid, stage, value, onChange, stageNumber, options, isLastStage }) {
  const [expanded, setExpanded] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, setActivatorNodeRef } =
    useSortable({ id: uid, data: { type: 'stage-slot' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function handleChange(patch) {
    onChange({ ...value, ...patch });
  }

  const rootClassName = [
    styles.slot,
    isDragging ? styles.dragging : '',
    isOver ? styles.dropTarget : '',
    !stage ? styles.empty : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} style={style} className={rootClassName}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.dragHandle}
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag stage ${stageNumber}`}
        >
          ⠿
        </button>
        <span className={styles.stageNumber}>Stage {stageNumber}</span>

        {stage ? (
          <>
            <span className={styles.stageName}>{stage.name}</span>
            <span className={styles.stageMeta}>
              {stage.country} &middot; {stage.surface} &middot; {stage.length}
            </span>
            <ServiceChip
              serviceTime={value.service_time}
              nummechanics={value.nummechanics}
              mechanicsSkill={value.mechanicsSkill}
              options={options}
              disabled={isLastStage}
              disabledReason={
                isLastStage ? 'Service is disabled on the rally’s final stage (enforced by the site).' : null
              }
              onChange={handleChange}
            />
            <button
              type="button"
              className={styles.expandToggle}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'Hide details' : 'Edit details'}
            </button>
          </>
        ) : (
          <span className={styles.emptyHint}>Drag a stage here from the catalog</span>
        )}
      </div>

      {stage && expanded && (
        <div className={styles.detailPanel}>
          <div className={styles.formGroup}>
            <label>Surface age</label>
            <div className={styles.radioGroup}>
              {options.surfaceAge.map((age) => (
                <label key={age.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name={`surface-${uid}`}
                    value={age.value}
                    checked={value.surface_age_id === age.value}
                    onChange={(e) => handleChange({ surface_age_id: e.target.value })}
                  />
                  {age.label}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor={`wetness-${uid}`}>Wetness</label>
            <input
              id={`wetness-${uid}`}
              type="text"
              placeholder="e.g. dry, damp, wet"
              value={value.wetness_id}
              onChange={(e) => handleChange({ wetness_id: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor={`tracksettings-${uid}`}>Weather</label>
            <input
              id={`tracksettings-${uid}`}
              type="text"
              placeholder="e.g. Morning Clear Crisp"
              value={value.tracksettings_id}
              onChange={(e) => handleChange({ tracksettings_id: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor={`tyre-${uid}`}>Default tyre</label>
            <select
              id={`tyre-${uid}`}
              value={value.def_tyre_id}
              onChange={(e) => handleChange({ def_tyre_id: e.target.value })}
            >
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
                checked={value.choose_tyre}
                onChange={(e) => handleChange({ choose_tyre: e.target.checked })}
              />
              Allow tyre choice
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={value.choose_setup}
                onChange={(e) => handleChange({ choose_setup: e.target.checked })}
              />
              Allow setup choice
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
