import styles from './CredentialStatus.module.css';

// Presentational: reports the clear intent via onClear, owns no state.
// "Saved", not "signed in" -- these credentials haven't been validated
// against rallysimfans.hu yet, they're just held for the next rally submit.
// rbr-rally-creator-web#88: lives in the credentials section itself (right
// next to what it clears), not the app header -- and reads as "Clear
// credentials" rather than the old bare "Forget", so its effect is
// unambiguous from the label alone.
export function CredentialStatus({ username, onClear }) {
  return (
    <div className={styles.status}>
      <span className={styles.badge}>Credentials saved for {username}</span>
      <button type="button" onClick={onClear}>
        Clear credentials
      </button>
    </div>
  );
}
