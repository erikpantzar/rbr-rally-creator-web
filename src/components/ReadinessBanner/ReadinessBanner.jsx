import styles from './ReadinessBanner.module.css';

// Persistent "readiness" line at the bottom of the document, per
// DESIGN_SPEC.md's UX review note: a disabled Create Rally button alone
// doesn't explain *why* it won't fire. Replaces the old per-case
// .legWarning paragraph + alert()-based validation in RallyBuilder --
// every pre-submit problem funnels into `problems` and renders here
// instead. Simple in, simple out: no local state, just problems -> either a
// calm "ready" line or a list.
//
// rbr-rally-creator-web#63: `problems` entries are either a plain string
// (the common case -- a message with nothing to do about it here besides
// go fix the field yourself) or a richer `{ message, action: { label,
// onClick } }` object, for the rare problem that has a one-click automatic
// fix (currently just "legs opening too soon" -> RallyBuilder's
// handleFixStaleStartTimes). Keeping the plain-string shape valid alongside
// the richer one means most call sites in RallyBuilder never have to change.
export function ReadinessBanner({ problems }) {
  if (problems.length === 0) {
    return <p className={styles.ready}>Ready to publish.</p>;
  }

  return (
    <div className={styles.notReady}>
      <p className={styles.heading}>Not ready to publish:</p>
      <ul className={styles.list}>
        {problems.map((problem) => {
          const isRich = typeof problem === 'object' && problem !== null;
          const message = isRich ? problem.message : problem;
          const action = isRich ? problem.action : null;

          return (
            <li key={message}>
              {message}
              {action && (
                <button type="button" className={styles.problemAction} onClick={action.onClick}>
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
