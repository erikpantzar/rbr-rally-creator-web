import { useDialogChrome } from './useDialogChrome.js';
import styles from './Modal.module.css';

// The app's two hand-rolled modal shapes, unified. The focus-on-mount +
// Escape-to-close wiring lives in the sibling useDialogChrome hook (which
// RallySidebar also uses on its own bespoke panel chrome):
//  - "takeover": one full-page opaque layer (StageConfigModal's #16 shape).
//    The overlay div IS the dialog -- role/aria/focus/scrolling all live on
//    it, and a full-page layer has no "outside" to click, so there is no
//    click-to-close.
//  - "overlay": dimmed scrim + centered card (ServiceConfigModal's #80
//    shape). Pressing the mouse down on the scrim itself closes --
//    mousedown rather than click, matching the original, and gated on
//    target === currentTarget so presses inside the card never count.
//
// z-index is tied to the variant (--z-modal vs --z-modal-2, see tokens.css's
// ladder) rather than being a prop, because that pairing is load-bearing:
// the app's one overlay modal (ServiceConfigModal) must stack above the one
// takeover modal it can be opened from.
//
// `labelledBy` is the id of the consumer's own heading element --
// aria-labelledby keeps pointing at real visible text, same as before.
export function Modal({ variant = 'takeover', labelledBy, onClose, children }) {
  const dialogRef = useDialogChrome(onClose);

  if (variant === 'overlay') {
    return (
      <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          ref={dialogRef}
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.takeover}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      ref={dialogRef}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
