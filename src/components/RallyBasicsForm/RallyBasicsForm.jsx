import styles from './RallyBasicsForm.module.css';

export function RallyBasicsForm({ value, onChange }) {
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
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="damage"
              value="2"
              checked={value.damage_id === '2'}
              onChange={(e) => handleChange('damage_id', e.target.value)}
            />
            Reduced
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="damage"
              value="3"
              checked={value.damage_id === '3'}
              onChange={(e) => handleChange('damage_id', e.target.value)}
            />
            Realistic
          </label>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="stages">Stages</label>
        <input
          id="stages"
          type="number"
          min="2"
          max="69"
          value={value.stages}
          onChange={(e) => handleChange('stages', parseInt(e.target.value, 10))}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="legs">Legs</label>
        <input
          id="legs"
          type="number"
          min="1"
          max="6"
          value={value.legs}
          onChange={(e) => handleChange('legs', parseInt(e.target.value, 10))}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="pacenotes">Pacenotes option</label>
        <select
          id="pacenotes"
          value={value.pacenotes_options}
          onChange={(e) => handleChange('pacenotes_options', e.target.value)}
        >
          <option value="Normal Pacenotes">Normal Pacenotes</option>
          <option value="Don't show 3D pacenotes">Don't show 3D pacenotes</option>
          <option value="Don't show the countdown of pacenote distance">
            Don't show the countdown of pacenote distance
          </option>
          <option value="Don't show the 3D pacenote and countdown of pacenote distance">
            Don't show the 3D pacenote and countdown of pacenote distance
          </option>
          <option value="Only pacenote audio">Only pacenote audio</option>
          <option value="No pacenote symbols and audio">No pacenote symbols and audio</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="roadside-service">Road-side service cap</label>
        <select
          id="roadside-service"
          value={value.road_side_service}
          onChange={(e) => handleChange('road_side_service', e.target.value)}
        >
          <option value="no">No service</option>
          <option value="2 minutes">2 minutes</option>
          <option value="3 minutes">3 minutes</option>
          <option value="5 minutes">5 minutes</option>
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
