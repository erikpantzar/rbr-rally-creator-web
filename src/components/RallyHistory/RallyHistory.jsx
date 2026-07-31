import { useEffect, useRef, useState } from 'react';
import { listRallies, deleteRally } from '../../lib/rallyStorage.js';
import styles from './RallyHistory.module.css';

// Title-or-date fallback, per rbr-rally-creator-web#46's own wording ("show
// it by the title I made for the rally, if not title use the date"). Kept as
// a render-time function rather than baked into the stored entry so it
// always reflects the viewer's current locale/clock, not whatever it was at
// save time.
function rallyLabel(rally) {
  return rally.title?.trim() || new Date(rally.updatedAt).toLocaleString();
}

// "My Rallies" overlay (rbr-rally-creator-web#46) -- lists every rally saved
// via RallyBuilder's explicit Save action (distinct from the automatic
// currentDraft, which never appears here). Mirrors StageConfigModal's
// full-screen overlay + Escape-to-close pattern for visual consistency, but
// is otherwise a much simpler read-only list + two actions per row.
export function RallyHistory({ onOpen, onClose }) {
  const [rallies, setRallies] = useState(() => listRallies());
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rally-history-title"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <h3 id="rally-history-title">My Rallies</h3>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {rallies.length === 0 ? (
          <p className={styles.empty}>No saved rallies yet — use Save while building one to add it here.</p>
        ) : (
          <ul className={styles.list}>
            {rallies.map((rally) => (
              <li key={rally.id} className={styles.row}>
                <button type="button" className={styles.openButton} onClick={() => onOpen(rally)}>
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
    </div>
  );
}
