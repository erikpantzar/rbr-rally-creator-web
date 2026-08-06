import styles from './ReadinessBanner.module.css';

// Persistent "readiness" panel at the bottom of the document, per
// DESIGN_SPEC.md's UX review note: a disabled Create Rally button alone
// doesn't explain *why* it won't fire. Every pre-submit problem funnels
// into `problems` and renders here instead of alert()s.
//
// rbr-rally-creator-web#105: every problem is one normalized object shape --
// { message, target, action? } -- replacing the old dual strings|objects
// prop (#63's compat shim, no longer worth its branching now that every
// entry needs a `target` anyway):
//   message  what's wrong, also the jump link's label
//   target   id of the section that owns the problem (see
//            lib/sectionJump.js's SECTION_IDS); clicking the message calls
//            onJump(target), which scrolls there and pulses the glow beacon
//   action   optional one-click automatic fix (currently just "legs opening
//            too soon" -> RallyBuilder's handleFixStaleStartTimes), rendered
//            as its own button after the jump link
// Jump links are real <button>s, not styled <span>s, so they're keyboard
// reachable/activatable for free. Still no local state: problems in,
// either a calm "ready" line or the panel out.
export function ReadinessBanner({ problems, onJump }) {
  if (problems.length === 0) {
    return <p className={styles.ready}>Ready to publish.</p>;
  }

  return (
    <div className={styles.notReady}>
      <p className={styles.heading}>Not ready to publish:</p>
      <ul className={styles.list}>
        {problems.map(({ message, target, action }) => (
          <li key={message}>
            <button type="button" className={styles.problemLink} onClick={() => onJump(target)}>
              {message}
            </button>
            {action && (
              <button type="button" className={styles.problemAction} onClick={action.onClick}>
                {action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
