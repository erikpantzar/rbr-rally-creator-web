import { useEffect, useState } from 'react';
import { canRedo, canUndo } from '../../lib/planHistory.js';
import styles from './PlanHistory.module.css';

function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// rbr-rally-creator-web#122: the road book's undo/redo strip -- two step
// buttons plus a collapsible timeline of every change to the current draft.
// Presentational only: the stack, the cursor and the restore all live in
// usePlanHistory/RallyBuilder, this just renders what it's handed and
// reports clicks back up, same contract as ReadinessBanner.
//
// Newest-first, because the interesting end of a history is the end you just
// came from -- and it means the list doesn't reflow under the cursor as it
// grows. Entries after the cursor are the redo branch: still listed, visibly
// undone, and still clickable, since "step back then change your mind" is
// the whole point of keeping them (the issue's "keep the future events UNTIL
// I make a new change").
export function PlanHistory({ history, onUndo, onRedo, onJumpTo }) {
  const [open, setOpen] = useState(false);

  // Ctrl/Cmd+Z is what anyone reaching for undo will try first, so the
  // buttons aren't the only way in. Skipped while a text control has focus:
  // those have their own native undo, and stealing it mid-nickname would be
  // a worse surprise than not offering the shortcut there at all.
  useEffect(() => {
    function handleKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target;
      if (el?.isContentEditable) return;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT') return;
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo]);

  if (!history) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.row}>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.stepButton}
            onClick={onUndo}
            disabled={!canUndo(history)}
            title="Undo (Ctrl/Cmd+Z)"
          >
            <span aria-hidden="true">↶</span> Undo
          </button>
          <button
            type="button"
            className={styles.stepButton}
            onClick={onRedo}
            disabled={!canRedo(history)}
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <span aria-hidden="true">↷</span> Redo
          </button>
        </div>

        <button type="button" className={styles.toggle} onClick={() => setOpen(!open)} aria-expanded={open}>
          History
          <span className={styles.position}>
            {history.index + 1}/{history.entries.length}
          </span>
        </button>
      </div>

      {open && (
        <ol className={styles.list} reversed>
          {history.entries
            .map((entry, i) => {
              const isCurrent = i === history.index;
              const classes = [styles.entry, isCurrent ? styles.current : '', i > history.index ? styles.undone : '']
                .filter(Boolean)
                .join(' ');
              return (
                <li key={`${i}-${entry.at}`}>
                  <button
                    type="button"
                    className={classes}
                    onClick={() => onJumpTo(i)}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className={styles.time}>{formatTime(entry.at)}</span>
                    <span className={styles.label}>{entry.label}</span>
                    {isCurrent && <span className={styles.marker}>now</span>}
                  </button>
                </li>
              );
            })
            .reverse()}
        </ol>
      )}
    </div>
  );
}
