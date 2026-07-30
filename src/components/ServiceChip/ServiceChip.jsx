import { useEffect, useRef, useState } from 'react';
import { SERVICE_TIERS, getServiceTier } from '../../lib/rallyPlan.js';
import styles from './ServiceChip.module.css';

// Presentational "at a glance" summary of a stage's service config, plus an
// inline editor for it -- click the chip to change tier (no service / short
// roadside stop / full service park), matching the real site's
// service_time optgroups. Reused as the compact header of a StageSlot card
// so the shape of the whole rally reads at a glance without opening every
// stage's detail panel.
//
// `disabled`/`disabledReason` reflect the confirmed server-side business
// rule that service is force-disabled on the rally's very last stage --
// the chip renders locked and explains why rather than silently no-opping.
export function ServiceChip({
  serviceTime,
  nummechanics,
  mechanicsSkill,
  options,
  disabled = false,
  disabledReason = null,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const tier = getServiceTier(serviceTime);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function pickTier(tierKey) {
    const nextTier = SERVICE_TIERS[tierKey];
    const validTimes = options.serviceTime.filter((t) => nextTier.times.includes(t));
    const nextServiceTime = validTimes[0] ?? nextTier.times[0];

    if (tierKey === 'none') {
      onChange({ service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' });
      return;
    }

    onChange({
      service_time: nextServiceTime,
      nummechanics: nummechanics === 'No Service' ? options.mechanicsCount.find((m) => m !== 'No Service') : nummechanics,
      mechanicsSkill:
        mechanicsSkill === 'No Service' ? options.mechanicsSkill.find((m) => m !== 'No Service') : mechanicsSkill,
    });
  }

  const chipClassName = [
    styles.chip,
    styles[`tier-${tier.key}`],
    disabled ? styles.disabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.container} ref={rootRef}>
      <button
        type="button"
        className={chipClassName}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={disabled ? disabledReason : `${tier.label} -- click to change`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {tier.label}
        {tier.key !== 'none' && <span className={styles.chipDetail}>{serviceTime}</span>}
      </button>

      {disabled && disabledReason && <p className={styles.disabledNote}>{disabledReason}</p>}

      {open && !disabled && (
        <div className={styles.popover}>
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

          {tier.key !== 'none' && (
            <div className={styles.detailFields}>
              <label className={styles.detailLabel}>
                Duration
                <select
                  value={serviceTime}
                  onChange={(e) => onChange({ service_time: e.target.value })}
                >
                  {options.serviceTime
                    .filter((t) => tier.times.includes(t))
                    .map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.detailLabel}>
                Mechanics
                <select
                  value={nummechanics}
                  onChange={(e) => onChange({ nummechanics: e.target.value })}
                >
                  {options.mechanicsCount
                    .filter((m) => m !== 'No Service')
                    .map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.detailLabel}>
                Skill
                <select
                  value={mechanicsSkill}
                  onChange={(e) => onChange({ mechanicsSkill: e.target.value })}
                >
                  {options.mechanicsSkill
                    .filter((m) => m !== 'No Service')
                    .map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
