import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { ServiceStatus } from '../ServiceStatus/ServiceStatus.jsx';
import { StockholmClock } from '../StockholmClock/StockholmClock.jsx';
import styles from './WizardHeader.module.css';

// Fixed HUD bar across the top of the wizard -- replaces App.jsx's normal
// <header> for the builder route (see App.jsx's pageView !== 'builder'
// guard), so it also carries that header's My Rallies/Explore nav
// (onOpenSidebar/sidebarOpen) rather than dropping that functionality.
//
// Credentials used to be the first thing inside Step 1 ("1. General
// settings") -- the Hyper mockup's step 1 is pure rally fields, so they move
// here instead as a disclosure: collapsed, the header shows saved/needed
// state plus the saved username (credentialsSaved/credentialsUsername), same
// glanceable role as ServiceStatus's dot -- so "who's saved in" doesn't
// require expanding; expanded, it reveals `credentialsSlot` (the actual
// CredentialForm/CredentialStatus markup, still owned/built by App.jsx
// exactly as before -- only *where* it renders changed, not who builds it).
export function WizardHeader({
  baseUrl,
  rallyName,
  credentialsSaved,
  credentialsUsername,
  credentialsSlot,
  sidebarOpen,
  onOpenSidebar,
}) {
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link to="/" className={styles.wordmark}>
          RBR<span className={styles.wordmarkAccent}>▸</span>CREATOR
        </Link>
        <span className={styles.divider} />
        <nav className={styles.nav}>
          <button
            type="button"
            className={styles.navLink}
            data-active={sidebarOpen}
            aria-pressed={sidebarOpen}
            onClick={onOpenSidebar}
          >
            My Rallies
          </button>
          <NavLink to="/explorer" className={styles.navLink}>
            Explore
          </NavLink>
        </nav>
        <span className={styles.divider} />
        <button
          type="button"
          className={styles.credentialsToggle}
          data-saved={credentialsSaved}
          aria-expanded={credentialsOpen}
          onClick={() => setCredentialsOpen((open) => !open)}
        >
          <span className={styles.credentialsDot} data-saved={credentialsSaved} />
          {credentialsSaved
            ? credentialsUsername
              ? `Credentials saved · ${credentialsUsername}`
              : 'Credentials saved'
            : 'Credentials needed'}
        </button>
      </div>

      <div className={styles.center}>
        <span className={styles.rallyName}>{rallyName || 'Untitled rally'}</span>
      </div>

      <div className={styles.right}>
        <ServiceStatus baseUrl={baseUrl} />
        <StockholmClock />
      </div>

      {credentialsOpen && (
        <div className={styles.credentialsPanel}>
          {credentialsSlot}
        </div>
      )}
    </header>
  );
}
