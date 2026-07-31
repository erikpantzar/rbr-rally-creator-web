import styles from './Toast.module.css';

// Minimal, single-purpose toast -- not a general notification system, just
// the "Undo" affordance DESIGN_SPEC.md's UX review calls for after a brick
// delete ("a simple 'Undo' toast for a few seconds... covers this without
// needing a full trash/history system"). RoadBook owns the timing/state;
// this component only renders what it's given and reports clicks back up.
export function Toast({ message, actionLabel, onAction, onDismiss }) {
  return (
    <div className={styles.toast} role="status">
      <span className={styles.message}>{message}</span>
      {actionLabel && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
