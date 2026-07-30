import { useState } from 'react';
import styles from './CredentialForm.module.css';

const ERROR_MESSAGES = {
  invalid_credentials: 'Incorrect username or password.',
  rate_limited: 'rallysimfans.hu is rate-limiting login attempts right now -- wait a bit and try again.',
  automation_error: 'Something went wrong talking to rallysimfans.hu. Try again in a moment.',
  missing_credentials: 'Enter both a username and password.',
};

// Presentational: no fetch, no storage. Reports (username, password) via
// onSubmit; the page component owns the actual login call and its result.
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

      {error && <p className={styles.error}>{ERROR_MESSAGES[error] ?? 'Login failed.'}</p>}

      <button type="submit" disabled={submitting || !username || !password}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
