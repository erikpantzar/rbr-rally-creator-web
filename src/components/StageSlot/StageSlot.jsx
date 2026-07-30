import { useState, useMemo } from 'react';
import styles from './StageSlot.module.css';

// Tyre/service-time/mechanics/surface-age option lists come from the
// service's GET /catalog/rally-options (the `options` prop) -- it's the
// single source of truth verified against the real site's wizard, not a
// local copy.
export function StageSlot({ stages, value, onChange, stageNumber, options }) {
  const [filterText, setFilterText] = useState('');

  function handleChange(field, fieldValue) {
    onChange({ ...value, [field]: fieldValue });
  }

  const filteredStages = useMemo(() => {
    if (!filterText.trim()) return stages;
    const lc = filterText.toLowerCase();
    return stages.filter(
      (s) =>
        s.name.toLowerCase().includes(lc) ||
        s.country.toLowerCase().includes(lc)
    );
  }, [stages, filterText]);

  const currentStage = stages.find((s) => s.id === value.stage_id);

  return (
    <div className={styles.slot}>
      <h4>Stage {stageNumber}</h4>

      <div className={styles.formGroup}>
        <label htmlFor={`stage-filter-${stageNumber}`}>Stage name</label>
        <input
          id={`stage-filter-${stageNumber}`}
          type="text"
          placeholder="Filter by name or country..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className={styles.filterInput}
        />
        <select
          value={value.stage_id || ''}
          onChange={(e) => {
            const id = parseInt(e.target.value, 10);
            handleChange('stage_id', id || null);
          }}
          className={styles.stageSelect}
        >
          <option value="">Select a stage</option>
          {filteredStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.country}, {s.surface}, {s.length})
            </option>
          ))}
        </select>
        {currentStage && (
          <p className={styles.stageInfo}>
            Default tyre: {currentStage.defTime}
          </p>
        )}
      </div>

      <div className={styles.formGroup}>
        <label>Surface age</label>
        <div className={styles.radioGroup}>
          {options.surfaceAge.map((age) => (
            <label key={age.value} className={styles.radioLabel}>
              <input
                type="radio"
                name={`surface-${stageNumber}`}
                value={age.value}
                checked={value.surface_age_id === age.value}
                onChange={(e) => handleChange('surface_age_id', e.target.value)}
              />
              {age.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor={`wetness-${stageNumber}`}>Wetness</label>
        <input
          id={`wetness-${stageNumber}`}
          type="text"
          placeholder="e.g. dry, damp, wet"
          value={value.wetness_id}
          onChange={(e) => handleChange('wetness_id', e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor={`tracksettings-${stageNumber}`}>Weather</label>
        <input
          id={`tracksettings-${stageNumber}`}
          type="text"
          placeholder="e.g. Morning Clear Crisp"
          value={value.tracksettings_id}
          onChange={(e) => handleChange('tracksettings_id', e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor={`tyre-${stageNumber}`}>Default tyre</label>
        <select
          id={`tyre-${stageNumber}`}
          value={value.def_tyre_id}
          onChange={(e) => handleChange('def_tyre_id', e.target.value)}
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
            onChange={(e) => handleChange('choose_tyre', e.target.checked)}
          />
          Allow tyre choice
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={value.choose_setup}
            onChange={(e) => handleChange('choose_setup', e.target.checked)}
          />
          Allow setup choice
        </label>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor={`service-time-${stageNumber}`}>Service time</label>
        <select
          id={`service-time-${stageNumber}`}
          value={value.service_time}
          onChange={(e) => handleChange('service_time', e.target.value)}
        >
          {options.serviceTime.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor={`mechanics-${stageNumber}`}>Mechanics</label>
        <select
          id={`mechanics-${stageNumber}`}
          value={value.nummechanics}
          onChange={(e) => handleChange('nummechanics', e.target.value)}
        >
          {options.mechanicsCount.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor={`skill-${stageNumber}`}>Mechanics skill</label>
        <select
          id={`skill-${stageNumber}`}
          value={value.mechanicsSkill}
          onChange={(e) => handleChange('mechanicsSkill', e.target.value)}
        >
          {options.mechanicsSkill.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
