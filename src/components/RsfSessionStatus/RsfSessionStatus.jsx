import styles from './RsfSessionStatus.module.css';

const LABELS = {
  valid: (username) => (username ? `RSF session valid for ${username}` : 'RSF session valid'),
  expired: () => 'RSF session expired or rejected',
};

export function RsfSessionStatus({ status, username, onClear }) {
  return (
    <div className={styles.status}>
      <span className={styles.badge} data-status={status}>
        {LABELS[status](username)}
      </span>
      <button type="button" onClick={onClear}>
        Clear session
      </button>
    </div>
  );
}
