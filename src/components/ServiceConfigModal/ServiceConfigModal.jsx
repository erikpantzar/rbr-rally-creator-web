import { useEffect, useRef, useState } from 'react';
import { SERVICE_TIERS, getServiceTier } from '../../lib/rallyPlan.js';
import styles from './ServiceConfigModal.module.css';

// rbr-rally-creator-web#80: separate sibling modal to StageConfigModal,
// scoped entirely to one stage's service_time/nummechanics/mechanicsSkill.
// Deliberately has NO stage picker inside it -- which stage it applies to
// is implicit from where it was opened (the leg-list blue block, or
// StageConfigModal's own "Service" summary button), passed in here as
// `stageLabel`/`stageNumber` purely for display, and `value` is that one
// stage's current service fields. onSave hands back just the three
// service fields; the caller (RoadBook or StageConfigModal) is responsible
// for writing them onto the right stagePlan entry -- this component never
// touches stagePlan itself.
//
// Mirrors StageConfigModal's structural conventions (full-page overlay,
// sticky header with Back/Save, Escape-to-close, .actions row at the
// bottom) rather than inventing a new modal shape, since DESIGN_SPEC.md
// treats these two as siblings in the same system. Unlike StageConfigModal
// this is a much smaller form, so it renders as a centered card instead of
// a full-page overlay -- but reuses the same tokens/actions-row/Escape
// conventions so it still reads as "part of the same app".
export function ServiceConfigModal({ value, options, stageLabel, stageNumber, isLastStage, disabledReason, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    service_time: value.service_time,
    nummechanics: value.nummechanics,
    mechanicsSkill: value.mechanicsSkill,
  });
  const dialogRef = useRef(null);
  const tier = getServiceTier(draft.service_time);

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

  function pickTier(tierKey) {
    const nextTier = SERVICE_TIERS[tierKey];
    const validTimes = options.serviceTime.filter((t) => nextTier.times.includes(t));
    const nextServiceTime = validTimes[0] ?? nextTier.times[0];

    if (tierKey === 'none') {
      patch({ service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' });
      return;
    }

    patch({
      service_time: nextServiceTime,
      nummechanics: draft.nummechanics === 'No Service' ? options.mechanicsCount.find((m) => m !== 'No Service') : draft.nummechanics,
      mechanicsSkill:
        draft.mechanicsSkill === 'No Service' ? options.mechanicsSkill.find((m) => m !== 'No Service') : draft.mechanicsSkill,
    });
  }

  function handleSave(e) {
    e.preventDefault();
    onSave(draft);
  }

  const title = stageNumber ? `Service — Stage ${stageNumber}` : 'Service';

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-config-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h3 id="service-config-modal-title">{title}</h3>
          {stageLabel && <p className={styles.headerSubtitle}>{stageLabel}</p>}
        </div>

        <form className={styles.form} onSubmit={handleSave}>
          {isLastStage ? (
            <p className={styles.disabledNote}>
              {disabledReason ?? 'Service is disabled on the rally’s final stage (enforced by the site).'}
            </p>
          ) : (
            <>
              <div className={styles.formGroup}>
                <label>Tier</label>
                <div className={styles.tierRow}>
                  {Object.values(SERVICE_TIERS).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={[styles.tierButton, tier.key === t.key ? styles.tierButtonActive : ''].join(' ')}
                      onClick={() => pickTier(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {tier.key !== 'none' && (
                <>
                  <div className={styles.formGroup}>
                    <label htmlFor="service-modal-duration">Duration</label>
                    <select
                      id="service-modal-duration"
                      value={draft.service_time}
                      onChange={(e) => patch({ service_time: e.target.value })}
                    >
                      {options.serviceTime
                        .filter((t) => tier.times.includes(t))
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="service-modal-mechanics">Mechanics</label>
                    <select
                      id="service-modal-mechanics"
                      value={draft.nummechanics}
                      onChange={(e) => patch({ nummechanics: e.target.value })}
                    >
                      {options.mechanicsCount
                        .filter((m) => m !== 'No Service')
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="service-modal-skill">Skill</label>
                    <select
                      id="service-modal-skill"
                      value={draft.mechanicsSkill}
                      onChange={(e) => patch({ mechanicsSkill: e.target.value })}
                    >
                      {options.mechanicsSkill
                        .filter((m) => m !== 'No Service')
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton} disabled={isLastStage}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
