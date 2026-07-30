import { useState } from 'react';
import styles from './CredentialForm.module.css';

const ERROR_MESSAGES = {
  missing_credentials: 'Enter both a username and password.',
};

// Presentational: no fetch, no storage. Reports (username, password) via
// onSubmit; the page component owns the actual save call and its result.
// This does NOT sign in to rallysimfans.hu -- it just hands credentials to
// the service to hold for later, when a rally is actually submitted and the
// Playwright agent needs them.
export function CredentialForm({ onSubmit, submitting, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(username, password);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="rsf-username">rallysimfans.hu username</label>
      <input
        id="rsf-username"
        type="text"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="rsf-password">Password</label>
      <input
        id="rsf-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={submitting}
      />

      {error && <p className={styles.error}>{ERROR_MESSAGES[error] ?? 'Could not save credentials.'}</p>}

      <button type="submit" disabled={submitting || !username || !password}>
        {submitting ? 'Saving…' : 'Save credentials'}
      </button>
    </form>
  );
}
