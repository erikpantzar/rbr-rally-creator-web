import styles from './RallyBasicsForm.module.css';

// road_side_service comes back from the service as plain value strings
// (e.g. "no", "2 minutes") -- only "no" needs a friendlier label.
function roadSideServiceLabel(value) {
  return value === 'no' ? 'No service' : value;
}

export function RallyBasicsForm({ value, onChange, options, rallyNameInputRef }) {
  function handleChange(field, fieldValue) {
    onChange({ ...value, [field]: fieldValue });
  }

  return (
    <form className={styles.form}>
      <div className={styles.formGroup}>
        <label htmlFor="rally-name">
          Rally name <span className={styles.required}>*</span>
        </label>
        <input
          id="rally-name"
          ref={rallyNameInputRef}
          type="text"
          value={value.rally_name}
          onChange={(e) => handleChange('rally_name', e.target.value)}
          placeholder="e.g. My First Rally"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={value.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Optional description"
          rows={3}
        />
      </div>

      <div className={styles.formGroup}>
        <label>Damage rules</label>
        <div className={styles.radioGroup}>
          {options.damageLevels.map((level) => (
            <label key={level.value} className={styles.radioLabel}>
              <input
                type="radio"
                name="damage"
                value={level.value}
                checked={value.damage_id === level.value}
                onChange={(e) => handleChange('damage_id', e.target.value)}
              />
              {level.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="pacenotes">Pacenotes option</label>
        <select
          id="pacenotes"
          value={value.pacenotes_options}
          onChange={(e) => handleChange('pacenotes_options', e.target.value)}
        >
          {options.pacenotesOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="roadside-service">Road-side service cap</label>
        <select
          id="roadside-service"
          value={value.road_side_service}
          onChange={(e) => handleChange('road_side_service', e.target.value)}
        >
          {options.roadSideService.map((opt) => (
            <option key={opt} value={opt}>
              {roadSideServiceLabel(opt)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={value.hidden_stage_name}
            onChange={(e) => handleChange('hidden_stage_name', e.target.checked)}
          />
          Hide stage names
        </label>
      </div>

      <div className={styles.passwordSection}>
        <p className={styles.passwordNote}>Optional — makes rally private</p>
        <div className={styles.formGroup}>
          <label htmlFor="password1">Password</label>
          <input
            id="password1"
            type="password"
            value={value.password1}
            onChange={(e) => handleChange('password1', e.target.value)}
            placeholder="Optional password"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password2">Confirm password</label>
          <input
            id="password2"
            type="password"
            value={value.password2}
            onChange={(e) => handleChange('password2', e.target.value)}
            placeholder="Confirm password"
          />
        </div>
      </div>
    </form>
  );
}
