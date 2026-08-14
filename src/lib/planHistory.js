// Undo/redo history for the current draft's road book
// (rbr-rally-creator-web#122). Pure array/object math in rallyPlan.js's
// style -- no React -- so the semantics that actually matter (what counts as
// one step, when the redo branch dies, what a step is called) are
// unit-testable without rendering anything.
//
// Model: a linear stack of SNAPSHOTS of the two arrays that make up the road
// book, `{ stagePlan, legSchedule }`, plus a cursor.
//
//   { entries: [{ snapshot, label, coalesceKey, at }, ...], index }
//
// Snapshots rather than an inverse-operation event log: RoadBook already
// owns every mutation and hands RallyBuilder whole new arrays (plan doc
// constraint 6 / docs/redesign/07-picker-workspace.md), so the committed
// state is right there for free at every commit. An event log would mean
// teaching this file how to invert add/delete/reorder/service-reassign/
// leg-merge individually -- a second implementation of the mutation rules
// that could drift from RoadBook's, which is exactly what the architecture
// says not to build. The issue's headline case ("undo a delete and get the
// stage back with all the settings I put in it") is then true by
// construction: the snapshot IS the stage config, _uid and all.
//
// entries[0] is the state the draft was opened at, so index 0 is a real
// place to stand, not an empty sentinel. index always points at the entry
// currently on screen; everything after it is the redo branch.

// Snapshots are small (a plan is tens of entries of flat primitives) but
// they add up in localStorage -- cap the stack and drop from the OLD end,
// so the most recent work is always the part that survives.
export const MAX_HISTORY_ENTRIES = 50;

// Live editing commits per keystroke (the picker workspace's detail pane has
// no Save -- plan doc D1), so typing a nickname would otherwise mint one
// history entry per character. Consecutive changes that carry the same
// coalesceKey inside this window collapse into the single entry already at
// the head, which turns "typed a nickname" into one undoable step.
export const COALESCE_WINDOW_MS = 1500;

const SERVICE_FIELDS = ['service_time', 'nummechanics', 'mechanicsSkill'];

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function changedIndexes(prev, next) {
  return next.map((entry, i) => (shallowEqual(entry, prev[i]) ? -1 : i)).filter((i) => i >= 0);
}

// Names one step, by diffing the two snapshots rather than by having every
// call site pass a label down. That keeps RoadBook's callback surface
// untouched (nothing about the mutation flow changes to get history) at the
// cost of describing changes structurally -- good enough, since the plan's
// shape is exactly what the user manipulates: bricks in a flat list, legs
// slicing it.
//
// Returns null when the two snapshots are equivalent, meaning "not a step"
// -- the caller pushes nothing.
//
// `coalesceKey` marks the field-level edits that are safe to merge into the
// previous entry (see COALESCE_WINDOW_MS): they're repeated tweaks of one
// target. Structural changes (add/remove/move) always get their own step and
// carry a null key, because collapsing two deletes into one would silently
// make the first one unreachable.
export function describePlanChange(prev, next) {
  const prevPlan = prev.stagePlan;
  const nextPlan = next.stagePlan;
  const prevLegs = prev.legSchedule;
  const nextLegs = next.legSchedule;

  if (nextPlan.length > prevPlan.length) {
    const added = nextPlan.length - prevPlan.length;
    if (added > 1) return { label: `${added} stages added`, coalesceKey: null };
    const prevUids = new Set(prevPlan.map((s) => s._uid));
    const at = nextPlan.findIndex((s) => !prevUids.has(s._uid));
    return { label: `Stage ${at + 1} added`, coalesceKey: null };
  }

  if (nextPlan.length < prevPlan.length) {
    const removed = prevPlan.length - nextPlan.length;
    if (removed > 1) return { label: `${removed} stages removed`, coalesceKey: null };
    const nextUids = new Set(nextPlan.map((s) => s._uid));
    const at = prevPlan.findIndex((s) => !nextUids.has(s._uid));
    return { label: `Stage ${at + 1} removed`, coalesceKey: null };
  }

  // Legs only ever append (createDefaultLegConfig at the end), so the new
  // leg's number is the new length. Removal merges the dropped leg's stages
  // into a neighbour, which shifts every later leg's number -- there's no
  // honest "leg N" to quote afterwards, so it stays unnumbered rather than
  // naming the wrong one.
  if (nextLegs.length > prevLegs.length) return { label: `Leg ${nextLegs.length} added`, coalesceKey: null };
  if (nextLegs.length < prevLegs.length) return { label: 'Leg removed', coalesceKey: null };

  // Checked before per-entry field diffs: a cross-leg drag changes both the
  // order and two legs' stage_count, and "moved" is the useful description
  // of that, not "leg 2 updated".
  if (nextPlan.some((s, i) => s._uid !== prevPlan[i]._uid)) {
    return { label: 'Stage moved', coalesceKey: null };
  }

  const stageDiffs = changedIndexes(prevPlan, nextPlan);
  if (stageDiffs.length === 1) {
    const i = stageDiffs[0];
    const before = prevPlan[i];
    const after = nextPlan[i];
    const serviceChanged = SERVICE_FIELDS.some((f) => before[f] !== after[f]);
    const configChanged = Object.keys({ ...before, ...after }).some(
      (key) => !SERVICE_FIELDS.includes(key) && before[key] !== after[key]
    );
    if (serviceChanged && !configChanged) {
      return { label: `Service on stage ${i + 1} changed`, coalesceKey: `service:${after._uid}` };
    }
    return { label: `Stage ${i + 1} edited`, coalesceKey: `stage:${after._uid}` };
  }
  if (stageDiffs.length > 1) return { label: 'Stages updated', coalesceKey: null };

  const legDiffs = changedIndexes(prevLegs, nextLegs);
  if (legDiffs.length === 1) {
    const i = legDiffs[0];
    if (prevLegs[i].super_rally !== nextLegs[i].super_rally) {
      return { label: `Leg ${i + 1} super rally ${nextLegs[i].super_rally === 'enabled' ? 'on' : 'off'}`, coalesceKey: null };
    }
    return { label: `Leg ${i + 1} times changed`, coalesceKey: `leg:${i}` };
  }
  // applyLegFieldChange cascades a leg's new times onto every later leg, and
  // "fix stale start times" shifts several at once -- both land here.
  if (legDiffs.length > 1) return { label: 'Leg times changed', coalesceKey: null };

  return null;
}

export function createHistory(snapshot, at = Date.now()) {
  return { entries: [{ snapshot, label: 'Draft opened', coalesceKey: null, at }], index: 0 };
}

// The one rule the issue is explicit about: stepping back keeps the future
// available UNTIL a new change is made, and then that change overwrites it.
// `slice(0, index + 1)` is where the redo branch dies -- standard linear
// undo, no tree.
export function pushHistoryEntry(history, snapshot, change, at = Date.now()) {
  if (!change) return history;

  const kept = history.entries.slice(0, history.index + 1);
  const head = kept[kept.length - 1];

  if (change.coalesceKey && head?.coalesceKey === change.coalesceKey && at - head.at < COALESCE_WINDOW_MS) {
    const merged = [...kept.slice(0, -1), { ...head, snapshot, at }];
    return { entries: merged, index: merged.length - 1 };
  }

  const appended = [...kept, { snapshot, label: change.label, coalesceKey: change.coalesceKey, at }];
  const entries = appended.slice(Math.max(0, appended.length - MAX_HISTORY_ENTRIES));
  return { entries, index: entries.length - 1 };
}

export function canUndo(history) {
  return Boolean(history) && history.index > 0;
}

export function canRedo(history) {
  return Boolean(history) && history.index < history.entries.length - 1;
}

export function clampHistoryIndex(history, index) {
  return Math.min(Math.max(index, 0), history.entries.length - 1);
}

// Cheap structural identity for "is this stored history describing the draft
// I just restored". Only ever compared against another signature, never
// parsed back, so JSON's key-order sensitivity is fine: both sides come from
// the same state object that was serialized together.
export function planSignature(snapshot) {
  return JSON.stringify([snapshot.stagePlan, snapshot.legSchedule]);
}

// localStorage is user-writable and survives across app versions, so a
// restored history gets the same shape-tolerance treatment as
// getCurrentDraft's payload -- anything that isn't recognisably a history
// is discarded in favour of a fresh baseline rather than crashing the
// editor or, worse, letting the user jump to a malformed snapshot.
export function isValidHistory(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.entries) &&
      value.entries.length > 0 &&
      Number.isInteger(value.index) &&
      value.index >= 0 &&
      value.index < value.entries.length &&
      value.entries.every(
        (entry) =>
          entry &&
          typeof entry.label === 'string' &&
          entry.snapshot &&
          Array.isArray(entry.snapshot.stagePlan) &&
          Array.isArray(entry.snapshot.legSchedule)
      )
  );
}
