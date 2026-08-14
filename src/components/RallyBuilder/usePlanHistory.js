import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createHistory,
  describePlanChange,
  pushHistoryEntry,
  clampHistoryIndex,
  isValidHistory,
  planSignature,
} from '../../lib/planHistory.js';
import {
  getCurrentDraftHistory,
  setCurrentDraftHistory,
  clearCurrentDraftHistory,
} from '../../lib/rallyStorage.js';

const PERSIST_DEBOUNCE_MS = 400;

// rbr-rally-creator-web#122: undo/redo for the draft's road book, wired as an
// OBSERVER of the committed plan rather than as a new mutation path.
//
// RoadBook is the sole owner of every stagePlan mutation and RallyBuilder
// owns the state (docs/redesign/07-picker-workspace.md constraint 6); giving
// history its own hooks into add/delete/reorder/service would fork that
// ownership and mean every future mutation has to remember to record itself.
// Instead this watches the two arrays AFTER they land in RallyBuilder's
// state -- one place, downstream of normalizeLastStageService, and
// automatically complete: anything that can change the plan is recorded,
// including paths that don't exist yet.
//
// Two consequences worth knowing:
//  - A single user action that writes both arrays (add stage = splice +
//    stage_count bump) is two setState calls in one event, which React
//    batches into one render -- so it arrives here as ONE change and becomes
//    ONE step. That's the behaviour we want, and it's why the observer lives
//    at the state boundary rather than at the callback boundary.
//  - Restoring a snapshot must not look like a new edit. `jumpTo` hands the
//    caller the snapshot's exact array references and RallyBuilder sets them
//    verbatim, so the next observer run sees reference-identical arrays and
//    records nothing. No "am I currently undoing" flag to keep in sync.
//
// Colocated with RallyBuilder (its only consumer) in the same spirit as
// Modal's useDialogChrome; the semantics themselves live in
// lib/planHistory.js as pure functions.
export function usePlanHistory({ stagePlan, legSchedule, active, hydrate, onRestore }) {
  const [history, setHistory] = useState(null);

  // The ref is the authoritative copy, the state is only what renders --
  // the observer effect below reads and writes it synchronously so two
  // commits in quick succession can't both diff against a stale head.
  const historyRef = useRef(null);

  // Read once, consumed once. Nulled the moment it's used (or refused) so a
  // reset() can never resurrect the previous draft's stack.
  const storedRef = useRef(undefined);
  if (storedRef.current === undefined) {
    storedRef.current = hydrate ? getCurrentDraftHistory() : null;
  }

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (!active) return;
    const snapshot = { stagePlan, legSchedule };

    if (!historyRef.current) {
      // The stored stack is only trustworthy if its current entry is the
      // draft that was just restored -- otherwise the two localStorage keys
      // have drifted (a write that didn't complete, a hand-edited draft, a
      // saved rally opened over the top) and stepping back would jump the
      // user into a plan that was never theirs. Cheaper to start a fresh
      // baseline than to try to reconcile.
      const stored = storedRef.current;
      storedRef.current = null;
      const seeded =
        isValidHistory(stored) && planSignature(stored.entries[stored.index].snapshot) === planSignature(snapshot)
          ? stored
          : createHistory(snapshot);
      historyRef.current = seeded;
      setHistory(seeded);
      return;
    }

    const current = historyRef.current.entries[historyRef.current.index].snapshot;
    if (current.stagePlan === stagePlan && current.legSchedule === legSchedule) return;

    const next = pushHistoryEntry(historyRef.current, snapshot, describePlanChange(current, snapshot));
    if (next === historyRef.current) return;
    historyRef.current = next;
    setHistory(next);
  }, [active, stagePlan, legSchedule]);

  useEffect(() => {
    if (!active || !history) return undefined;
    const timeout = setTimeout(() => setCurrentDraftHistory(history), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [active, history]);

  const jumpTo = useCallback((index) => {
    const current = historyRef.current;
    if (!current) return;
    const target = clampHistoryIndex(current, index);
    if (target === current.index) return;

    // The index moves but the entries don't: stepping back deliberately
    // leaves the future in place (rbr-rally-creator-web#122). It's the next
    // real edit that discards it, in pushHistoryEntry.
    const next = { ...current, index: target };
    historyRef.current = next;
    setHistory(next);
    onRestoreRef.current(current.entries[target].snapshot);
  }, []);

  const undo = useCallback(() => jumpTo((historyRef.current?.index ?? 0) - 1), [jumpTo]);
  const redo = useCallback(() => jumpTo((historyRef.current?.index ?? 0) + 1), [jumpTo]);

  // Called when the draft itself is replaced (New Rally) -- the stack
  // describes a document that no longer exists. Clearing the ref makes the
  // observer effect above re-seed a baseline from whatever state the reset
  // left behind, on the very next render.
  const reset = useCallback(() => {
    historyRef.current = null;
    storedRef.current = null;
    setHistory(null);
    clearCurrentDraftHistory();
  }, []);

  return { history, undo, redo, jumpTo, reset };
}
