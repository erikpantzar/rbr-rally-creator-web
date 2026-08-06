import { useEffect, useRef } from 'react';

// Shared dialog wiring: focus the dialog element on mount (so keyboard
// users land inside it immediately) plus a document-level Escape-to-close
// listener. Extracted verbatim from StageConfigModal, ServiceConfigModal
// and RallySidebar, which each hand-rolled this exact pair of effects.
// Lives in its own file (not Modal.jsx) so Modal.jsx only exports a
// component -- oxlint's react(only-export-components) Fast Refresh rule --
// and because RallySidebar wants only this wiring: its docked-panel chrome
// (scrim, slide-in transform, --z-panel) is its own thing, not one of
// Modal's two shapes.
//
// The keydown handler is deliberately unconditional -- no
// event.defaultPrevented check, no stopPropagation -- because that is
// exactly what every pre-extraction copy did, and the nested-modal case
// depends on it: pressing Escape while ServiceConfigModal is open on top
// of StageConfigModal fires BOTH document listeners, closing both layers
// (and clearing the stage draft) in one keypress. Preserving that, rather
// than "fixing" it to close only the top layer, keeps behavior identical
// to the code this replaced.
export function useDialogChrome(onClose) {
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

  return dialogRef;
}
