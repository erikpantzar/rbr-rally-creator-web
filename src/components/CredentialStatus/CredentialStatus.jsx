import styles from './CredentialStatus.module.css';

// Presentational: reports the clear intent via onClear, owns no state.
// "Saved", not "signed in" -- these credentials haven't been validated
// against rallysimfans.hu yet, they're just held for the next rally submit.
export function CredentialStatus({ username, onClear }) {
  return (
    <div className={styles.status}>
      <span className={styles.badge}>Credentials saved for {username}</span>
      <button type="button" onClick={onClear}>
        Forget
      </button>
    </div>
  );
}
