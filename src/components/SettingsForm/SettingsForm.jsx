import { useState } from 'react';
import styles from './SettingsForm.module.css';

// Presentational: takes the current base URL in, reports a new one out via
// onSave. Doesn't touch localStorage itself -- the page component owns that.
export function SettingsForm({ baseUrl, onSave }) {
  const [value, setValue] = useState(baseUrl);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(value.trim());
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="service-base-url">Service URL</label>
      <p className={styles.hint}>
        The address rbr-rally-creator-service is running at (e.g. your tailnet HTTPS URL).
      </p>
      <input
        id="service-base-url"
        type="text"
        placeholder="https://your-host.example.ts.net"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit">Save</button>
    </form>
  );
}
