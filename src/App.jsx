import { useEffect, useState } from 'react';
import { getBaseUrl, setBaseUrl as saveBaseUrl } from './lib/settings.js';
import { saveCredentials, getCredentialsStatus, clearCredentials } from './lib/authApi.js';
import { SettingsForm } from './components/SettingsForm/SettingsForm.jsx';
import { CredentialForm } from './components/CredentialForm/CredentialForm.jsx';
import { CredentialStatus } from './components/CredentialStatus/CredentialStatus.jsx';
import { RallyBuilder } from './components/RallyBuilder/RallyBuilder.jsx';
import styles from './App.module.css';

// Only this top-level component touches fetch/localStorage -- everything
// under components/ is presentational (props in, callback props out), per
// the "simple in, simple out" convention from willys-web-prototype's
// docs/COMPONENTS.md.
//
// Saving credentials here does NOT sign in to rallysimfans.hu -- it just
// hands them to the service to hold (httpOnly cookie, never JS-readable
// storage). The real Playwright login only happens later, when a rally is
// actually submitted and the automation agent needs to act on the site.
function App() {
  const [baseUrl, setBaseUrlState] = useState(() => getBaseUrl());
  const [credState, setCredState] = useState({ status: 'checking' }); // checking | saved | unsaved
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!baseUrl) {
      setCredState({ status: 'unsaved' });
      return;
    }
    setCredState({ status: 'checking' });
    getCredentialsStatus(baseUrl).then((res) => {
      setCredState(res.ok ? { status: 'saved', username: res.username } : { status: 'unsaved' });
    });
  }, [baseUrl]);

  async function handleSaveCredentials(username, password) {
    setSaveError(null);
    setSaving(true);
    const res = await saveCredentials(baseUrl, username, password);
    setSaving(false);
    if (res.ok) {
      setCredState({ status: 'saved', username: res.username });
    } else {
      setSaveError(res.reason ?? 'save_failed');
    }
  }

  async function handleClearCredentials() {
    await clearCredentials(baseUrl);
    setCredState({ status: 'unsaved' });
  }

  function handleSaveBaseUrl(url) {
    saveBaseUrl(url);
    setBaseUrlState(url);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>RBR Rally Creator</h1>
        {credState.status === 'saved' && (
          <CredentialStatus username={credState.username} onClear={handleClearCredentials} />
        )}
      </header>

      <section className={styles.section}>
        <h2>Service connection</h2>
        <SettingsForm baseUrl={baseUrl} onSave={handleSaveBaseUrl} />
      </section>

      {baseUrl && credState.status === 'unsaved' && (
        <section className={styles.section}>
          <h2>rallysimfans.hu credentials</h2>
          <CredentialForm onSubmit={handleSaveCredentials} submitting={saving} error={saveError} />
        </section>
      )}

      {baseUrl && credState.status === 'saved' && (
        <section className={styles.section}>
          <h2>Create a rally</h2>
          <RallyBuilder baseUrl={baseUrl} />
        </section>
      )}

      {!baseUrl && (
        <p className={styles.muted}>Set the service URL above to save your credentials.</p>
      )}
    </div>
  );
}

export default App;
