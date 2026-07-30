import styles from './AuthStatus.module.css';

// Presentational: reports the logout intent via onLogout, owns no state.
export function AuthStatus({ username, onLogout }) {
  return (
    <div className={styles.status}>
      <span className={styles.badge}>Signed in as {username}</span>
      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </div>
  );
}
