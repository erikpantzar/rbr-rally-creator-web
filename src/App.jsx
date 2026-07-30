import { useEffect, useState } from 'react';
import { getBaseUrl, setBaseUrl as saveBaseUrl } from './lib/settings.js';
import { login, getSession, logout } from './lib/authApi.js';
import { SettingsForm } from './components/SettingsForm/SettingsForm.jsx';
import { CredentialForm } from './components/CredentialForm/CredentialForm.jsx';
import { AuthStatus } from './components/AuthStatus/AuthStatus.jsx';
import styles from './App.module.css';

// Only this top-level component touches fetch/localStorage -- everything
// under components/ is presentational (props in, callback props out), per
// the "simple in, simple out" convention from willys-web-prototype's
// docs/COMPONENTS.md.
function App() {
  const [baseUrl, setBaseUrlState] = useState(() => getBaseUrl());
  const [authState, setAuthState] = useState({ status: 'checking' }); // checking | authenticated | unauthenticated
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (!baseUrl) {
      setAuthState({ status: 'unauthenticated' });
      return;
    }
    setAuthState({ status: 'checking' });
    getSession(baseUrl).then((res) => {
      setAuthState(
        res.ok ? { status: 'authenticated', username: res.username } : { status: 'unauthenticated' }
      );
    });
  }, [baseUrl]);

  async function handleLogin(username, password) {
    setLoginError(null);
    setLoggingIn(true);
    const res = await login(baseUrl, username, password);
    setLoggingIn(false);
    if (res.ok) {
      setAuthState({ status: 'authenticated', username: res.username });
    } else {
      setLoginError(res.reason ?? 'login_failed');
    }
  }

  async function handleLogout() {
    await logout(baseUrl);
    setAuthState({ status: 'unauthenticated' });
  }

  function handleSaveBaseUrl(url) {
    saveBaseUrl(url);
    setBaseUrlState(url);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>RBR Rally Creator</h1>
        {authState.status === 'authenticated' && (
          <AuthStatus username={authState.username} onLogout={handleLogout} />
        )}
      </header>

      <section className={styles.section}>
        <h2>Service connection</h2>
        <SettingsForm baseUrl={baseUrl} onSave={handleSaveBaseUrl} />
      </section>

      {baseUrl && authState.status === 'unauthenticated' && (
        <section className={styles.section}>
          <h2>Sign in to rallysimfans.hu</h2>
          <CredentialForm onSubmit={handleLogin} submitting={loggingIn} error={loginError} />
        </section>
      )}

      {baseUrl && authState.status === 'authenticated' && (
        <section className={styles.section}>
          <p className={styles.muted}>
            Signed in. Rally creation isn't built yet -- this is Phase 1 (auth only).
          </p>
        </section>
      )}

      {!baseUrl && (
        <p className={styles.muted}>Set the service URL above to sign in.</p>
      )}
    </div>
  );
}

export default App;
