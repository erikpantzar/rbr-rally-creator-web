import { useEffect, useState } from 'react';
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

// "My Rallies" sidebar (rbr-rally-creator-web#62) -- lists every rally saved
// via RallyBuilder's explicit Save action (distinct from the automatic
// currentDraft, which never appears here). Originally a full-screen overlay
// opened via a header button (#46, then named RallyHistory); #62 asked to
// see this list alongside the editor at all times instead of behind a
// click, so it's now a persistent left column on wide viewports. On narrow
// ones there isn't room to keep it beside the editor, so it collapses into
// a toggleable slide-out drawer instead (see the module CSS's breakpoint) --
// App.jsx owns the open/close state since the toggle button that drives it
// lives in its header, not here.
export function RallySidebar({ activeRallyId, onOpen, isOpen, onClose, refreshToken }) {
  const [rallies, setRallies] = useState(() => listRallies());

  // This component stays mounted for the app's whole lifetime now (it's no
  // longer created/destroyed by an open/close toggle), but rallies are saved
  // from inside RallyBuilder, not here -- so without this it would only ever
  // show whatever existed at initial page load. App.jsx bumps refreshToken
  // every time RallyBuilder saves, which re-reads storage so a newly-saved
  // rally shows up immediately instead of only after a reload.
  useEffect(() => {
    setRallies(listRallies());
  }, [refreshToken]);

  function handleOpen(rally) {
    onOpen(rally);
    // No-op on a wide viewport (the sidebar has no "closed" state there --
    // see the CSS, .sidebar ignores data-open above the breakpoint). On a
    // narrow one this is the drawer, and picking a rally is the natural
    // moment to dismiss it, same as picking a menu item closes the menu.
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
      {/* Click-outside-to-close backdrop -- only rendered visible (via CSS)
          below the sidebar's collapse breakpoint, where the sidebar behaves
          as a drawer instead of a persistent column. */}
      <div className={styles.backdrop} data-open={isOpen} onClick={onClose} aria-hidden="true" />

      <aside className={styles.sidebar} data-open={isOpen} aria-label="My Rallies">
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
