import { FormGroup } from '../FormGroup/FormGroup.jsx';
import { ChipGroup } from '../ChipGroup/ChipGroup.jsx';
import { SERVICE_TIERS, getServiceTier } from '../../lib/rallyPlan.js';
import styles from './ServiceEntryForm.module.css';

// The service form body (reuse row + tier row + duration/mechanics/skill
// chip groups), extracted from ServiceConfigModal for
// rbr-rally-creator-web#107 (docs/redesign/07-picker-workspace.md, Phase 0)
// so the PickerWorkspace can later host it in-pane (plan doc D5: service
// rows edited exactly like stages, no overlay inside the workspace). Fully
// *controlled*, same contract as StageEntryEditor: `value` is one stage's
// { service_time, nummechanics, mechanicsSkill }, every edit calls
// `onChange` with the full next value, no internal draft --
// ServiceConfigModal keeps its own draft, Save/Cancel, and Modal chrome
// *around* this, so today's flow is byte-identical.
//
// `recentServiceConfigs` is optional (defaults to none shown) -- the
// caller computes it via rallyPlan.js's getRecentServiceConfigs, scoped to
// whichever stage is NOT being edited right now, and passes it straight
// through unchanged; this component only renders whatever it's given.
export function ServiceEntryForm({ value, onChange, options, isLastStage, disabledReason, recentServiceConfigs = [] }) {
  const tier = getServiceTier(value.service_time);

  // Controlled-component patch: hand the merged next value up. Each
  // handler below patches exactly once, so spreading the current `value`
  // prop is equivalent to the functional setState the modal used
  // pre-extraction.
  function patch(fields) {
    onChange({ ...value, ...fields });
  }

  // A "Reuse a service" chip click replaces all three fields in one write,
  // same shape as pickTier's own multi-field patches below -- applying a
  // previous config IS picking a tier/duration/mechanics/skill combo all at
  // once, just sourced from an existing stage instead of the form's own
  // controls.
  function applyRecentConfig(config) {
    patch({
      service_time: config.service_time,
      nummechanics: config.nummechanics,
      mechanicsSkill: config.mechanicsSkill,
    });
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
      {recentServiceConfigs.length > 0 && (
        <FormGroup label="Reuse a service">
          <div className={styles.reuseRow}>
            {recentServiceConfigs.map((config) => (
              <button
                key={`${config.service_time}|${config.nummechanics}|${config.mechanicsSkill}`}
                type="button"
                className={styles.reuseChip}
                onClick={() => applyRecentConfig(config)}
              >
                {config.service_time} &middot; {config.nummechanics} &middot; {config.mechanicsSkill}
              </button>
            ))}
          </div>
        </FormGroup>
      )}

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
          <FormGroup label="Duration">
            <ChipGroup
              options={options.serviceTime.filter((t) => tier.times.includes(t))}
              value={value.service_time}
              onChange={(next) => patch({ service_time: next })}
            />
          </FormGroup>

          <FormGroup label="Mechanics">
            <ChipGroup
              options={options.mechanicsCount.filter((m) => m !== 'No Service')}
              value={value.nummechanics}
              onChange={(next) => patch({ nummechanics: next })}
            />
          </FormGroup>

          <FormGroup label="Skill">
            <ChipGroup
              options={options.mechanicsSkill.filter((m) => m !== 'No Service')}
              value={value.mechanicsSkill}
              onChange={(next) => patch({ mechanicsSkill: next })}
            />
          </FormGroup>
        </>
      )}
    </>
  );
}
