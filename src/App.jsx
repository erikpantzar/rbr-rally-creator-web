import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router';
import { getBaseUrl } from './lib/settings.js';
import { saveCredentials, getCredentialsStatus, clearCredentials } from './lib/authApi.js';
import { CredentialForm } from './components/CredentialForm/CredentialForm.jsx';
import { CredentialStatus } from './components/CredentialStatus/CredentialStatus.jsx';
import { RallyBuilder } from './components/RallyBuilder/RallyBuilder.jsx';
import { ExploreView } from './components/ExploreView/ExploreView.jsx';
import { OkaTwentyTwo } from './components/OkaTwentyTwo/OkaTwentyTwo.jsx';
import { RallySidebar } from './components/RallySidebar/RallySidebar.jsx';
import { StockholmClock } from './components/StockholmClock/StockholmClock.jsx';
import { ServiceStatus } from './components/ServiceStatus/ServiceStatus.jsx';
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

  // #okatwentytwo (easter egg): deliberately NOT a route -- it has no nav
  // link and isn't meant to be discoverable via the URL bar the way
  // /explorer is, just a hash a curious reader of the source might try.
  // The initializer (not a mount effect) reads the hash so a fresh load of
  // #okatwentytwo starts on the egg in the very first render -- syncing
  // after mount instead would race the stale-hash cleanup effect below,
  // which sees the pre-sync `false` state and strips the hash it was about
  // to honor.
  const [showEgg, setShowEgg] = useState(() => window.location.hash === '#okatwentytwo');

  const navigate = useNavigate();
  const location = useLocation();
  const onExplorer = location.pathname.startsWith('/explorer');
  // Drives .page[data-view]'s "map-first views get the full window" CSS
  // (App.module.css) -- the router replaces the old `view` state for
  // /explorer, but the egg is still a hash flag layered on top, not a route.
  const pageView = showEgg ? 'okatwentytwo' : onExplorer ? 'explore' : 'builder';

  useEffect(() => {
    function syncEggFromHash() {
      setShowEgg(window.location.hash === '#okatwentytwo');
    }
    window.addEventListener('hashchange', syncEggFromHash);
    return () => window.removeEventListener('hashchange', syncEggFromHash);
  }, []);

  // Leaving the egg via the nav links (My Rallies / Explore navigate
  // directly) must not leave a stale #okatwentytwo in the URL. replaceState
  // instead of assigning location.hash: no scroll jump and no extra history
  // entry to back-button through.
  useEffect(() => {
    if (!showEgg && window.location.hash === '#okatwentytwo') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [showEgg]);

  function handleOpenRally(rally) {
    setActiveRally(rally);
    setSidebarOpen(false);
    // Opening a saved rally is a builder action -- if the user was
    // exploring, following "Open" must actually show them the rally.
    navigate('/');
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
    // data-view lets App.module.css widen the page for map-first views
    // (Explore, #okatwentytwo) while the builder keeps its 46rem document
    // column -- one attribute instead of view-conditional class juggling.
    <div className={styles.page} data-view={pageView}>
      <header className={styles.header}>
        {/* rbr-rally-creator-web#77: top-left, small and subtle -- secondary
            to the title/primary actions rather than competing buttons, so
            they sit ahead of .titleGroup styled as plain text-links.
            rbr-rally-creator-web#106 wraps them in .headerNav: the header's
            space-between distributes its direct children, so the two links
            must be one flex child to keep the left/center/right rhythm. */}
        <div className={styles.headerNav}>
          <button
            type="button"
            className={styles.historyButton}
            data-active={sidebarOpen}
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            My Rallies
          </button>
          {/* rbr-rally-creator-web#106: Explore is the second entry of the
              same quiet nav row (shared .historyButton styling on purpose --
              two entries of one nav, not two different controls). A real
              route now (/explorer) -- NavLink sets aria-current="page" on
              the active link automatically, which App.module.css's
              .historyButton[aria-current] hook styles the same way
              data-active used to. */}
          <NavLink to="/explorer" className={styles.historyButton}>
            Explore
          </NavLink>
        </div>
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
          <ServiceStatus baseUrl={baseUrl} />
          <StockholmClock />
        </div>
      </header>

      {/* Reachable only by typing the hash (see the hashchange effect
          above); fetches the catalog like ExploreView so its Sweden/
          Finland stage lists can add to the draft. Layered on top of
          whichever route is active rather than being a route itself --
          typing the hash while on /explorer still shows the egg. */}
      {baseUrl && showEgg && (
        <section className={styles.section}>
          <OkaTwentyTwo baseUrl={baseUrl} />
        </section>
      )}

      {/* rbr-rally-creator-web#106 + the React Router migration: what used
          to be a `view` useState flip is now real routes, so each screen has
          its own shareable/deep-linkable URL (/explorer, /explorer/:country,
          and / for the builder). Neither route unmounts anything the user
          can lose work in when navigated away from -- RallyBuilder persists
          its in-progress build to rallyStorage's current draft on every
          change, same as before. /explorer must stay listed before the root
          route (react-router matches in order; a bare "/" element wouldn't
          itself shadow "/explorer", but keeping the more specific paths
          first is the conventional ordering). */}
      {baseUrl && !showEgg && (
        <Routes>
          <Route
            path="/explorer/:country?"
            element={
              <section className={styles.section}>
                <h2>Explore stages by country</h2>
                <ExploreView baseUrl={baseUrl} />
              </section>
            }
          />
          {/* rbr-rally-creator-web#followup: credentials no longer get their
              own top-level App.jsx section -- they're now the first thing
              inside RallyBuilder's numbered "1. General settings" section, so
              the merged section reads as one card even though two components
              render into it. App.jsx still owns the credentials fetch/
              localStorage logic (per the app's convention, see the comment atop
              this file) and builds the actual markup here; RallyBuilder just
              places it via `credentialsSlot`, so neither component has to know
              about the other's internals.

              key forces a clean remount whenever the user opens a different
              saved rally (or switches back to "new") -- RallyBuilder's state
              (rallyBasics/stagePlan/etc.) is all local useState, so this is the
              simplest way to guarantee it doesn't carry over from whatever was
              on screen before (rbr-rally-creator-web#46). */}
          <Route
            path="/*"
            element={
              <RallyBuilder
                key={activeRally?.id ?? 'new'}
                baseUrl={baseUrl}
                credentialsSaved={credState.status === 'saved'}
                initialPayload={activeRally?.payload}
                credentialsSlot={
                  credState.status === 'unsaved' ? (
                    <CredentialForm onSubmit={handleSaveCredentials} submitting={saving} error={saveError} />
                  ) : (
                    <CredentialStatus username={credState.username} onClear={handleClearCredentials} />
                  )
                }
              />
            }
          />
        </Routes>
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
