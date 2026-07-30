import { useState, useMemo } from 'react';
import styles from './StageSlot.module.css';

const TYRE_OPTIONS = ['Tarmac Dry', 'Tarmac Intermediate', 'Tarmac Wet', 'Gravel Dry', 'Gravel Intermediate', 'Gravel Wet', 'Snow'];

const SERVICE_TIME_OPTIONS = ['No Service', '2 minutes', '3 minutes', '4 minutes', '5 minutes', '10 minutes', '15 minutes', '20 minutes', '30 minutes', '45 minutes', '60 minutes'];

const MECHANICS_OPTIONS = ['No Service', '2 mechanic', '3 mechanic', '4 mechanic', '5 mechanic', '6 mechanic'];

const MECHANICS_SKILL_OPTIONS = ['No Service', 'Inexperienced', 'Proficient', 'Competent', 'Skilled', 'Expert'];

export function StageSlot({ stages, value, onChange, stageNumber }) {
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
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`surface-${stageNumber}`}
              value="1"
              checked={value.surface_age_id === '1'}
              onChange={(e) => handleChange('surface_age_id', e.target.value)}
            />
            New
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`surface-${stageNumber}`}
              value="2"
              checked={value.surface_age_id === '2'}
              onChange={(e) => handleChange('surface_age_id', e.target.value)}
            />
            Normal
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`surface-${stageNumber}`}
              value="3"
              checked={value.surface_age_id === '3'}
              onChange={(e) => handleChange('surface_age_id', e.target.value)}
            />
            Worn
          </label>
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
          {TYRE_OPTIONS.map((opt) => (
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
          {SERVICE_TIME_OPTIONS.map((opt) => (
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
          {MECHANICS_OPTIONS.map((opt) => (
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
          {MECHANICS_SKILL_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
