import { useEffect, useState } from 'react';
import { useDialogChrome } from '../Modal/useDialogChrome.js';
import { listRallies, deleteRally } from '../../lib/rallyStorage.js';
import styles from './RallySidebar.module.css';

// Title-or-date fallback, per rbr-rally-creator-web#46's own wording ("show
// it by the title I made for the rally, if not title use the date"). Kept as
// a render-time function rather than baked into the stored entry so it
// always reflects the viewer's current locale/clock, not whatever it was at
// save time.
function rallyLabel(rally) {
  return rally.title?.trim() || new Date(rally.updatedAt).toLocaleString();
}

// "My Rallies" panel (rbr-rally-creator-web#62) -- lists every rally saved
// via RallyBuilder's explicit Save action (distinct from the automatic
// currentDraft, which never appears here). Originally a full-screen overlay
// (#46, then named RallyHistory); #62 asked for a docked-panel feel instead
// of a full-screen takeover. The maintainer's plan (see issue #62's
// implementation-plan comment) is explicit that this should be a
// `position: fixed` panel that OVERLAYS the main content -- never a flex-row
// layout partner that resizes .page, since RoadBook's stage bricks
// (#52/#55) only fit ~3 per row at the app's current 46rem content width and
// permanently stealing horizontal space would regress that back to 2 per
// row. So this is fixed to the left edge, slides in via a transform, and
// sits on top of everything else at every viewport width -- App.jsx only
// renders this component while open, so it mounts fresh each time and this
// lazy useState initializer re-reads rallyStorage for free, with no separate
// refresh-on-save plumbing needed.
export function RallySidebar({ activeRallyId, onOpen, onClose }) {
  const [rallies, setRallies] = useState(() => listRallies());
  // Starts false so the panel first renders off-screen (see .panel's default
  // transform in the CSS module), then flips true on the next frame so the
  // transition actually animates the slide-in instead of the panel just
  // appearing already-open.
  const [visible, setVisible] = useState(false);
  // Same focus-on-mount + document-level Escape wiring the config modals
  // use, via Modal's shared hook -- but only the wiring: the panel chrome
  // itself (scrim, slide-in transform, --z-panel) stays bespoke here, since
  // this is a docked side panel, not one of Modal's two dialog shapes.
  const panelRef = useDialogChrome(onClose);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleOpen(rally) {
    onOpen(rally);
    onClose();
  }

  function handleDelete(id) {
    // No separate undo affordance here (unlike stage/leg removal) -- this
    // list is itself the recovery mechanism for everything else, and a
    // saved rally is a deliberate, named, already-persisted thing rather
    // than an in-progress edit, so a plain confirm is enough friction for
    // the plainly destructive action of dropping it for good.
    if (!window.confirm('Delete this saved rally? This cannot be undone.')) return;
    deleteRally(id);
    setRallies(listRallies());
  }

  return (
    <>
      {/* Click-to-close backdrop -- always present while the panel is
          mounted (the panel always overlays now, on every viewport width,
          not just a narrow-viewport drawer mode). */}
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />

      <aside
        className={styles.panel}
        data-visible={visible}
        role="dialog"
        aria-modal="true"
        aria-label="My Rallies"
        ref={panelRef}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h3>My Rallies</h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close My Rallies">
            Close
          </button>
        </div>

        <div className={styles.body}>
          {rallies.length === 0 ? (
            <p className={styles.empty}>No saved rallies yet — use Save while building one to add it here.</p>
          ) : (
            <ul className={styles.list}>
              {rallies.map((rally) => (
                <li
                  key={rally.id}
                  className={rally.id === activeRallyId ? `${styles.row} ${styles.active}` : styles.row}
                >
                  <button type="button" className={styles.openButton} onClick={() => handleOpen(rally)}>
                    <span className={styles.rowTitle}>{rallyLabel(rally)}</span>
                    <span className={styles.rowMeta}>
                      {rally.payload?.stagePlan?.length ?? 0} stage
                      {rally.payload?.stagePlan?.length === 1 ? '' : 's'} &middot; saved{' '}
                      {new Date(rally.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => handleDelete(rally.id)}
                    aria-label={`Delete ${rallyLabel(rally)}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
