import { useEffect, useState } from 'react';
import { getBaseUrl } from './lib/settings.js';
import { saveCredentials, getCredentialsStatus, clearCredentials } from './lib/authApi.js';
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
  // Fixed for the lifetime of the page -- the public Funnel URL is now the
  // stable, permanent address (see rbr-rally-creator-web#14), so there's no
  // "Service connection" UI to change it. getBaseUrl() still honors a
  // manually-set `rbr.baseUrl` localStorage key as a devtools-only escape
  // hatch for pointing at a local dev backend (see lib/settings.js).
  const [baseUrl] = useState(() => getBaseUrl());
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>RBR Rally Creator</h1>
          {/* Build-time commit hash (see vite.config.js's __COMMIT_HASH__
              define) -- links to the actual diff so "what's live right now"
              is always one click away, no changelog to keep in sync. */}
          <a
            className={styles.commitHash}
            href={`https://github.com/erikpantzar/rbr-rally-creator-web/commit/${__COMMIT_HASH__}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View this build's commit on GitHub"
          >
            {__COMMIT_HASH__}
          </a>
        </div>
        {credState.status === 'saved' && (
          <CredentialStatus username={credState.username} onClear={handleClearCredentials} />
        )}
      </header>

      {baseUrl && (
        <section className={styles.section}>
          <h2>rallysimfans.hu credentials</h2>
          {credState.status === 'unsaved' ? (
            <CredentialForm onSubmit={handleSaveCredentials} submitting={saving} error={saveError} />
          ) : (
            <p className={styles.muted}>Signed in as {credState.username}.</p>
          )}
        </section>
      )}

      {baseUrl && (
        <section className={styles.section}>
          <h2>Create a rally</h2>
          <RallyBuilder baseUrl={baseUrl} credentialsSaved={credState.status === 'saved'} />
        </section>
      )}
    </div>
  );
}

export default App;
