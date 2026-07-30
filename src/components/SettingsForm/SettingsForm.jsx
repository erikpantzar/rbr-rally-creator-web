import { useState } from 'react';
import styles from './SettingsForm.module.css';

// Presentational: takes the current base URL in, reports a new one out via
// onSave. Doesn't touch localStorage itself -- the page component owns that
// (App.jsx defaults it to the public service URL when no override is saved,
// see src/lib/settings.js). Most visitors never need to touch this --
// it's here for pointing the app at a local dev backend instead.
export function SettingsForm({ baseUrl, isDefault, onSave }) {
  const [value, setValue] = useState(baseUrl);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(value.trim());
  }

  function handleReset() {
    setValue(baseUrl);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="service-base-url">Service URL</label>
      <p className={styles.hint}>
        {isDefault
          ? 'Using the public rbr-rally-creator-service by default -- no setup needed.'
          : 'Using a custom service URL.'}{' '}
        Override this to point at a local dev backend (e.g. <code>http://localhost:3000</code>);
        clear the field and save to go back to the public default.
      </p>
      <input
        id="service-base-url"
        type="text"
        placeholder="https://your-host.example.ts.net"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className={styles.actions}>
        <button type="submit">Save</button>
        {value !== baseUrl && (
          <button type="button" className={styles.secondary} onClick={handleReset}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
