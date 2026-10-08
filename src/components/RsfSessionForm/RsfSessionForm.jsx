import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { Input } from '../Input/Input.jsx';
import { describeRsfSessionError } from '../../lib/rsfSession.js';
import styles from './RsfSessionForm.module.css';

export function RsfSessionForm({ onSubmit, submitting, error }) {
  const [rememberMe, setRememberMe] = useState('');
  const [deviceId, setDeviceId] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(rememberMe, deviceId);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.help}>
        Log in to rallysimfans.hu in your browser, open DevTools → Application → Cookies →
        https://rallysimfans.hu, and copy the values of <code>remember_me</code> and <code>device_id</code>.
      </p>

      <label htmlFor="rsf-remember-me">remember_me</label>
      <Input
        id="rsf-remember-me"
        size="md"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={rememberMe}
        onChange={(e) => setRememberMe(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="rsf-device-id">device_id</label>
      <Input
        id="rsf-device-id"
        size="md"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
        disabled={submitting}
      />

      {error && <p className={styles.error}>{describeRsfSessionError(error)}</p>}

      <Button
        type="submit"
        variant="primary"
        className={styles.submit}
        disabled={submitting || !rememberMe.trim() || !deviceId.trim()}
      >
        {submitting ? 'Checking…' : 'Save session'}
      </Button>
    </form>
  );
}
