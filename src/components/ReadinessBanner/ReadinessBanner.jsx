import styles from './ReadinessBanner.module.css';

// Persistent "readiness" line at the bottom of the document, per
// DESIGN_SPEC.md's UX review note: a disabled Create Rally button alone
// doesn't explain *why* it won't fire. Replaces the old per-case
// .legWarning paragraph + alert()-based validation in RallyBuilder --
// every pre-submit problem funnels into `problems` (a plain list of
// human-readable strings) and renders here instead. Simple in, simple out:
// no local state, just problems -> either a calm "ready" line or a list.
export function ReadinessBanner({ problems }) {
  if (problems.length === 0) {
    return <p className={styles.ready}>Ready to publish.</p>;
  }

  return (
    <div className={styles.notReady}>
      <p className={styles.heading}>Not ready to publish:</p>
      <ul className={styles.list}>
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}
