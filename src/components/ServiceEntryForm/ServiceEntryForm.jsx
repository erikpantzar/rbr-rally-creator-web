import { FormGroup } from '../FormGroup/FormGroup.jsx';
import { SERVICE_TIERS, getServiceTier } from '../../lib/rallyPlan.js';
import styles from './ServiceEntryForm.module.css';

// The service form body (tier row + duration/mechanics/skill selects),
// extracted from ServiceConfigModal for rbr-rally-creator-web#107
// (docs/redesign/07-picker-workspace.md, Phase 0) so the PickerWorkspace
// can later host it in-pane (plan doc D5: service rows edited exactly like
// stages, no overlay inside the workspace). Fully *controlled*, same
// contract as StageEntryEditor: `value` is one stage's
// { service_time, nummechanics, mechanicsSkill }, every edit calls
// `onChange` with the full next value, no internal draft --
// ServiceConfigModal keeps its own draft, Save/Cancel, and Modal chrome
// *around* this, so today's flow is byte-identical.
export function ServiceEntryForm({ value, onChange, options, isLastStage, disabledReason }) {
  const tier = getServiceTier(value.service_time);

  // Controlled-component patch: hand the merged next value up. Each
  // handler below patches exactly once, so spreading the current `value`
  // prop is equivalent to the functional setState the modal used
  // pre-extraction.
  function patch(fields) {
    onChange({ ...value, ...fields });
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
      nummechanics: value.nummechanics === 'No Service' ? options.mechanicsCount.find((m) => m !== 'No Service') : value.nummechanics,
      mechanicsSkill:
        value.mechanicsSkill === 'No Service' ? options.mechanicsSkill.find((m) => m !== 'No Service') : value.mechanicsSkill,
    });
  }

  if (isLastStage) {
    return (
      <p className={styles.disabledNote}>
        {disabledReason ?? 'Service is disabled on the rally’s final stage (enforced by the site).'}
      </p>
    );
  }

  return (
    <>
      <FormGroup label="Tier">
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
      </FormGroup>

      {tier.key !== 'none' && (
        <>
          <FormGroup label="Duration" htmlFor="service-modal-duration">
            <select
              id="service-modal-duration"
              value={value.service_time}
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
          </FormGroup>

          <FormGroup label="Mechanics" htmlFor="service-modal-mechanics">
            <select
              id="service-modal-mechanics"
              value={value.nummechanics}
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
          </FormGroup>

          <FormGroup label="Skill" htmlFor="service-modal-skill">
            <select
              id="service-modal-skill"
              value={value.mechanicsSkill}
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
          </FormGroup>
        </>
      )}
    </>
  );
}
