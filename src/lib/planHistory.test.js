import { describe, it, expect } from 'vitest';
import {
  describePlanChange,
  createHistory,
  pushHistoryEntry,
  canUndo,
  canRedo,
  clampHistoryIndex,
  planSignature,
  isValidHistory,
  MAX_HISTORY_ENTRIES,
  COALESCE_WINDOW_MS,
} from './planHistory.js';

function stage(uid, overrides = {}) {
  return {
    _uid: uid,
    stage_id: `catalog-${uid}`,
    surface_age_id: '2',
    def_tyre_id: 'Gravel Dry',
    service_time: 'No Service',
    nummechanics: 'No Service',
    mechanicsSkill: 'No Service',
    _label: '',
    ...overrides,
  };
}

function leg(stageCount, overrides = {}) {
  return {
    open_time: '2026-08-14T10:00',
    close_time: '2026-08-20T10:00',
    super_rally: 'disabled',
    stage_count: stageCount,
    ...overrides,
  };
}

function snapshot(stagePlan, legSchedule) {
  return { stagePlan, legSchedule };
}

describe('describePlanChange', () => {
  it('is not a step when nothing moved', () => {
    const plan = [stage('a'), stage('b')];
    // Different array/object instances with identical contents -- a re-render
    // must not mint a history entry.
    expect(describePlanChange(snapshot(plan, [leg(2)]), snapshot([stage('a'), stage('b')], [leg(2)]))).toBeNull();
  });

  it('names an added stage by its position in the rally', () => {
    const before = snapshot([stage('a'), stage('b')], [leg(2)]);
    const after = snapshot([stage('a'), stage('b'), stage('c')], [leg(3)]);
    expect(describePlanChange(before, after)).toEqual({ label: 'Stage 3 added', coalesceKey: null });
  });

  it('names a removed stage by the position it used to hold', () => {
    const before = snapshot([stage('a'), stage('b'), stage('c')], [leg(3)]);
    const after = snapshot([stage('a'), stage('c')], [leg(2)]);
    expect(describePlanChange(before, after)).toEqual({ label: 'Stage 2 removed', coalesceKey: null });
  });

  it('reports leg add with its number and leg removal without one', () => {
    const plan = [stage('a')];
    expect(describePlanChange(snapshot(plan, [leg(1)]), snapshot(plan, [leg(1), leg(0)]))).toEqual({
      label: 'Leg 2 added',
      coalesceKey: null,
    });
    // Removal merges the dropped leg's stages into a neighbour and renumbers
    // everything after it, so no leg number stays honest.
    expect(describePlanChange(snapshot(plan, [leg(0), leg(1)]), snapshot(plan, [leg(1)]))).toEqual({
      label: 'Leg removed',
      coalesceKey: null,
    });
  });

  it('reads a cross-leg drag as a move, not as two leg edits', () => {
    const before = snapshot([stage('a'), stage('b')], [leg(1), leg(1)]);
    const after = snapshot([stage('b'), stage('a')], [leg(1), leg(1)]);
    expect(describePlanChange(before, after)).toEqual({ label: 'Stage moved', coalesceKey: null });
  });

  it('distinguishes a config edit from a service edit, and keys both to the stage', () => {
    const before = snapshot([stage('a'), stage('b')], [leg(2)]);

    const edited = snapshot([stage('a', { _label: 'Opener' }), stage('b')], [leg(2)]);
    expect(describePlanChange(before, edited)).toEqual({ label: 'Stage 1 edited', coalesceKey: 'stage:a' });

    const serviced = snapshot([stage('a', { service_time: '30 minutes' }), stage('b')], [leg(2)]);
    expect(describePlanChange(before, serviced)).toEqual({
      label: 'Service on stage 1 changed',
      coalesceKey: 'service:a',
    });
  });

  it('falls back to a plural label when several entries changed at once', () => {
    const before = snapshot([stage('a'), stage('b')], [leg(2)]);
    const after = snapshot([stage('a', { _label: 'x' }), stage('b', { _label: 'y' })], [leg(2)]);
    expect(describePlanChange(before, after)).toEqual({ label: 'Stages updated', coalesceKey: null });
  });

  it('describes leg field edits, coalescing repeated tweaks of one leg', () => {
    const plan = [stage('a')];
    const before = snapshot(plan, [leg(1)]);

    expect(describePlanChange(before, snapshot(plan, [leg(1, { open_time: '2026-08-15T10:00' })]))).toEqual({
      label: 'Leg 1 times changed',
      coalesceKey: 'leg:0',
    });

    expect(describePlanChange(before, snapshot(plan, [leg(1, { super_rally: 'enabled' })]))).toEqual({
      label: 'Leg 1 super rally on',
      coalesceKey: null,
    });
  });

  it('collapses a cascading time edit across several legs into one label', () => {
    const plan = [stage('a'), stage('b')];
    const before = snapshot(plan, [leg(1), leg(1)]);
    const after = snapshot(plan, [
      leg(1, { open_time: '2026-08-16T10:00' }),
      leg(1, { open_time: '2026-08-16T10:00' }),
    ]);
    expect(describePlanChange(before, after)).toEqual({ label: 'Leg times changed', coalesceKey: null });
  });
});

describe('pushHistoryEntry', () => {
  const base = snapshot([stage('a')], [leg(1)]);

  it('starts at the opening state, with nothing to undo or redo', () => {
    const history = createHistory(base, 1000);
    expect(history.index).toBe(0);
    expect(history.entries).toHaveLength(1);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('appends a step and leaves the cursor on it', () => {
    const history = createHistory(base, 1000);
    const next = pushHistoryEntry(history, base, { label: 'Stage 2 added', coalesceKey: null }, 2000);
    expect(next.entries.map((e) => e.label)).toEqual(['Draft opened', 'Stage 2 added']);
    expect(next.index).toBe(1);
    expect(canUndo(next)).toBe(true);
    expect(canRedo(next)).toBe(false);
  });

  it('records nothing when there is no change to describe', () => {
    const history = createHistory(base, 1000);
    expect(pushHistoryEntry(history, base, null, 2000)).toBe(history);
  });

  it('keeps the future while stepping back, and discards it on the next edit', () => {
    let history = createHistory(base, 1000);
    history = pushHistoryEntry(history, base, { label: 'Stage 2 added', coalesceKey: null }, 2000);
    history = pushHistoryEntry(history, base, { label: 'Stage 3 added', coalesceKey: null }, 3000);

    // Stepping back is only a cursor move -- both future entries survive.
    const steppedBack = { ...history, index: 0 };
    expect(steppedBack.entries).toHaveLength(3);
    expect(canRedo(steppedBack)).toBe(true);

    const afterNewEdit = pushHistoryEntry(steppedBack, base, { label: 'Leg 2 added', coalesceKey: null }, 4000);
    expect(afterNewEdit.entries.map((e) => e.label)).toEqual(['Draft opened', 'Leg 2 added']);
    expect(afterNewEdit.index).toBe(1);
    expect(canRedo(afterNewEdit)).toBe(false);
  });

  it('merges same-target edits inside the coalesce window into one step', () => {
    let history = createHistory(base, 1000);
    const typed = snapshot([stage('a', { _label: 'Op' })], [leg(1)]);
    history = pushHistoryEntry(history, base, { label: 'Stage 1 edited', coalesceKey: 'stage:a' }, 2000);
    history = pushHistoryEntry(history, typed, { label: 'Stage 1 edited', coalesceKey: 'stage:a' }, 2100);

    expect(history.entries).toHaveLength(2);
    expect(history.index).toBe(1);
    // The merged entry holds the LATEST snapshot -- undo from here lands
    // before the whole burst of keystrokes, not in the middle of it.
    expect(history.entries[1].snapshot).toBe(typed);
  });

  it('starts a new step once the window has passed, or when the target changes', () => {
    let history = createHistory(base, 1000);
    history = pushHistoryEntry(history, base, { label: 'Stage 1 edited', coalesceKey: 'stage:a' }, 2000);

    const late = pushHistoryEntry(
      history,
      base,
      { label: 'Stage 1 edited', coalesceKey: 'stage:a' },
      2000 + COALESCE_WINDOW_MS
    );
    expect(late.entries).toHaveLength(3);

    const other = pushHistoryEntry(history, base, { label: 'Stage 2 edited', coalesceKey: 'stage:b' }, 2100);
    expect(other.entries).toHaveLength(3);
  });

  it('never merges structural changes, however fast they arrive', () => {
    let history = createHistory(base, 1000);
    history = pushHistoryEntry(history, base, { label: 'Stage 1 removed', coalesceKey: null }, 2000);
    history = pushHistoryEntry(history, base, { label: 'Stage 1 removed', coalesceKey: null }, 2001);
    expect(history.entries).toHaveLength(3);
  });

  it('caps the stack by dropping the oldest steps, keeping the cursor at the newest', () => {
    let history = createHistory(base, 0);
    for (let i = 1; i <= MAX_HISTORY_ENTRIES + 5; i += 1) {
      history = pushHistoryEntry(history, base, { label: `Step ${i}`, coalesceKey: null }, i * 10_000);
    }
    expect(history.entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history.index).toBe(MAX_HISTORY_ENTRIES - 1);
    expect(history.entries[0].label).toBe('Step 6');
    expect(history.entries[MAX_HISTORY_ENTRIES - 1].label).toBe(`Step ${MAX_HISTORY_ENTRIES + 5}`);
  });

  it("restores a deleted stage's full config, the issue's headline case", () => {
    const configured = stage('b', {
      _label: 'My favourite',
      surface_age_id: '4',
      def_tyre_id: 'Tarmac Wet',
      service_time: '30 minutes',
      nummechanics: '4 mechanic',
      mechanicsSkill: 'Expert',
    });
    const before = snapshot([stage('a'), configured, stage('c')], [leg(3)]);
    const afterDelete = snapshot([stage('a'), stage('c')], [leg(2)]);

    let history = createHistory(before, 1000);
    history = pushHistoryEntry(history, afterDelete, describePlanChange(before, afterDelete), 2000);

    expect(history.entries[1].label).toBe('Stage 2 removed');
    const undone = history.entries[history.index - 1].snapshot;
    expect(undone.stagePlan[1]).toEqual(configured);
    expect(undone.legSchedule).toEqual([leg(3)]);
  });
});

describe('clampHistoryIndex', () => {
  it('keeps a jump inside the stack', () => {
    const history = { entries: [{}, {}, {}], index: 1 };
    expect(clampHistoryIndex(history, -3)).toBe(0);
    expect(clampHistoryIndex(history, 1)).toBe(1);
    expect(clampHistoryIndex(history, 99)).toBe(2);
  });
});

describe('planSignature', () => {
  it('matches structurally identical plans and separates different ones', () => {
    const a = snapshot([stage('a')], [leg(1)]);
    const b = snapshot([stage('a')], [leg(1)]);
    expect(planSignature(a)).toBe(planSignature(b));
    expect(planSignature(a)).not.toBe(planSignature(snapshot([stage('a'), stage('b')], [leg(2)])));
  });
});

describe('isValidHistory', () => {
  const good = createHistory(snapshot([stage('a')], [leg(1)]), 1000);

  it('accepts what it wrote', () => {
    expect(isValidHistory(JSON.parse(JSON.stringify(good)))).toBe(true);
  });

  it('rejects anything a stale or hand-edited localStorage could hand back', () => {
    expect(isValidHistory(null)).toBe(false);
    expect(isValidHistory({})).toBe(false);
    expect(isValidHistory({ entries: [], index: 0 })).toBe(false);
    expect(isValidHistory({ ...good, index: 7 })).toBe(false);
    expect(isValidHistory({ ...good, index: -1 })).toBe(false);
    expect(isValidHistory({ entries: [{ label: 'x', snapshot: { stagePlan: [] } }], index: 0 })).toBe(false);
    expect(isValidHistory({ entries: [{ snapshot: { stagePlan: [], legSchedule: [] } }], index: 0 })).toBe(false);
  });
});
