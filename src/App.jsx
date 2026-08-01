import { useEffect, useState } from 'react';
import { getBaseUrl } from './lib/settings.js';
import { saveCredentials, getCredentialsStatus, clearCredentials } from './lib/authApi.js';
import { CredentialForm } from './components/CredentialForm/CredentialForm.jsx';
import { CredentialStatus } from './components/CredentialStatus/CredentialStatus.jsx';
import { RallyBuilder } from './components/RallyBuilder/RallyBuilder.jsx';
import { RallySidebar } from './components/RallySidebar/RallySidebar.jsx';
import { StockholmClock } from './components/StockholmClock/StockholmClock.jsx';
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

  // rbr-rally-creator-web#46: which saved rally (if any) RallyBuilder should
  // open with. activeRally lives here rather than inside RallyBuilder
  // because opening a *different* rally needs to reset RallyBuilder's
  // entire local state tree -- simplest way to guarantee that is to give
  // RallyBuilder a fresh `key` (below) and let it remount clean, which only
  // App.jsx can drive from outside.
  const [activeRally, setActiveRally] = useState(null);

  // rbr-rally-creator-web#62: "My Rallies" is a toggleable panel that
  // overlays the main content (see RallySidebar) rather than a persistent
  // column that resizes it -- toggleable on every viewport width, not just
  // narrow ones. RallySidebar is only rendered while this is true, so it
  // mounts fresh each time it's opened and its own lazy useState initializer
  // re-reads rallyStorage for free -- no separate refresh plumbing needed.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleOpenRally(rally) {
    setActiveRally(rally);
    setSidebarOpen(false);
  }

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
        {/* rbr-rally-creator-web#77: top-left, small and subtle -- secondary
            to the title/primary actions rather than a competing button, so
            it sits ahead of .titleGroup styled as a plain text-link. */}
        <button
          type="button"
          className={styles.historyButton}
          data-active={sidebarOpen}
          aria-pressed={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          My Rallies
        </button>
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
        <div className={styles.headerActions}>
          <StockholmClock />
        </div>
      </header>

      {baseUrl && (
        <section className={styles.section}>
          <h2>rallysimfans.hu credentials</h2>
          {credState.status === 'unsaved' ? (
            <CredentialForm onSubmit={handleSaveCredentials} submitting={saving} error={saveError} />
          ) : (
            <CredentialStatus username={credState.username} onClear={handleClearCredentials} />
          )}
        </section>
      )}

      {baseUrl && (
        <section className={styles.section}>
          <h2>Create a rally</h2>
          {/* key forces a clean remount whenever the user opens a different
              saved rally (or switches back to "new") -- RallyBuilder's state
              (rallyBasics/stagePlan/etc.) is all local useState, so this is
              the simplest way to guarantee it doesn't carry over from
              whatever was on screen before (rbr-rally-creator-web#46). */}
          <RallyBuilder
            key={activeRally?.id ?? 'new'}
            baseUrl={baseUrl}
            credentialsSaved={credState.status === 'saved'}
            initialPayload={activeRally?.payload}
            initialRallyId={activeRally?.id ?? null}
          />
        </section>
      )}

      {/* rbr-rally-creator-web#62: fixed-position overlay panel, rendered
          only while open -- position is order-independent (fixed takes it
          out of normal flow), and only mounting it while open means its own
          lazy useState(() => listRallies()) initializer re-reads storage
          fresh every time it's reopened, so a rally saved elsewhere always
          shows up without any extra refresh plumbing. */}
      {sidebarOpen && (
        <RallySidebar
          activeRallyId={activeRally?.id ?? null}
          onOpen={handleOpenRally}
          onClose={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
