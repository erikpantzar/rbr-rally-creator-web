import { describe, it, expect } from 'vitest';
import {
  buildWorkspaceRows,
  workspaceSelectionKey,
  resolveWorkspaceSelection,
  applyStageConfigUpdate,
  applyServiceFieldsUpdate,
  applyAddStage,
  applyAddLeg,
} from './pickerWorkspace.js';

// Minimal stagePlan entries -- only the fields these helpers actually read
// (_uid, service_time), plus a marker field to assert non-mutation on.
function stage(uid, serviceTime = 'No Service') {
  return { _uid: uid, stage_id: `catalog-${uid}`, service_time: serviceTime, def_tyre_id: 'Gravel Dry' };
}

function leg(stageCount) {
  return { open_time: '', close_time: '', super_rally: 'disabled', stage_count: stageCount };
}

describe('buildWorkspaceRows', () => {
  it('renders legs as headers with their stage rows in one flat list, numbering stages rally-wide', () => {
    const plan = [stage('a'), stage('b'), stage('c')];
    const rows = buildWorkspaceRows(plan, [leg(2), leg(1)]);
    expect(rows).toEqual([
      { type: 'leg', legIndex: 0, startIndex: 0, endIndex: 2 },
      { type: 'stage', legIndex: 0, uid: 'a', stageNumber: 1 },
      { type: 'stage', legIndex: 0, uid: 'b', stageNumber: 2 },
      { type: 'leg', legIndex: 1, startIndex: 2, endIndex: 3 },
      { type: 'stage', legIndex: 1, uid: 'c', stageNumber: 3 },
    ]);
  });

  it('adds a service row only for stages with an assigned service', () => {
    const plan = [stage('a', '30 minutes'), stage('b'), stage('c')];
    const rows = buildWorkspaceRows(plan, [leg(3)]);
    expect(rows.filter((r) => r.type === 'service')).toEqual([
      { type: 'service', legIndex: 0, uid: 'a', stageNumber: 1 },
    ]);
    // The assigned service sits immediately after its owning stage row.
    expect(rows[2]).toMatchObject({ type: 'service', uid: 'a' });
  });

  it("never emits a service row for the rally's true last stage, even if its fields claim one", () => {
    // normalizeLastStageService should make this state impossible, but the
    // sidebar mirrors RoadBook's own belt-and-braces legSequences rule.
    const plan = [stage('a'), stage('b', '30 minutes')];
    const rows = buildWorkspaceRows(plan, [leg(2)]);
    expect(rows.some((r) => r.type === 'service')).toBe(false);
  });

  it('an empty leg contributes just its header row', () => {
    const plan = [stage('a')];
    const rows = buildWorkspaceRows(plan, [leg(1), leg(0)]);
    expect(rows[rows.length - 1]).toEqual({ type: 'leg', legIndex: 1, startIndex: 1, endIndex: 1 });
  });
});

describe('workspaceSelectionKey', () => {
  it('gives a stage and its service row distinct keys despite the shared uid', () => {
    expect(workspaceSelectionKey({ type: 'stage', uid: 'a' })).not.toBe(
      workspaceSelectionKey({ type: 'service', uid: 'a' })
    );
  });

  it('keys leg selections by index', () => {
    expect(workspaceSelectionKey({ type: 'leg', legIndex: 2 })).toBe('leg:2');
  });
});

describe('resolveWorkspaceSelection', () => {
  const plan = [stage('a'), stage('b')];
  const legs = [leg(2)];

  it('passes through a stage selection whose uid still exists', () => {
    const sel = { type: 'stage', uid: 'b' };
    expect(resolveWorkspaceSelection(sel, plan, legs)).toBe(sel);
  });

  it('keeps a service selection valid even when that service is unassigned (in-pane form is how it gets assigned)', () => {
    const sel = { type: 'service', uid: 'a' };
    expect(resolveWorkspaceSelection(sel, plan, legs)).toBe(sel);
  });

  it('falls back to the first leg context when the selected uid is gone', () => {
    expect(resolveWorkspaceSelection({ type: 'stage', uid: 'zz' }, plan, legs)).toEqual({
      type: 'leg',
      legIndex: 0,
    });
  });

  it('clamps an out-of-range leg selection into the current leg range', () => {
    expect(resolveWorkspaceSelection({ type: 'leg', legIndex: 5 }, plan, legs)).toEqual({
      type: 'leg',
      legIndex: 0,
    });
  });

  it('falls back to the first leg context when there is no selection at all', () => {
    expect(resolveWorkspaceSelection(null, plan, legs)).toEqual({ type: 'leg', legIndex: 0 });
  });
});

describe('applyStageConfigUpdate', () => {
  it('replaces exactly the matching entry, preserving order, without mutating the input', () => {
    const plan = [stage('a'), stage('b')];
    const next = { ...stage('b'), def_tyre_id: 'Tarmac Dry' };
    const result = applyStageConfigUpdate(plan, 'b', next);
    expect(result).not.toBe(plan);
    expect(result[0]).toBe(plan[0]);
    expect(result[1]).toBe(next);
    expect(plan[1].def_tyre_id).toBe('Gravel Dry');
  });
});

describe('applyServiceFieldsUpdate', () => {
  it('merges only the service fields onto the matching entry, leaving the rest of its config intact', () => {
    const plan = [stage('a'), stage('b')];
    const result = applyServiceFieldsUpdate(plan, 'a', {
      service_time: '15 minutes',
      nummechanics: '4 mechanic',
      mechanicsSkill: 'Expert',
    });
    expect(result[0]).toMatchObject({
      _uid: 'a',
      stage_id: 'catalog-a',
      def_tyre_id: 'Gravel Dry',
      service_time: '15 minutes',
      nummechanics: '4 mechanic',
    });
    expect(result[1]).toBe(plan[1]);
  });
});

describe('applyAddStage', () => {
  it('splices the new config onto the end of the target leg and bumps only that leg\'s stage_count (D4)', () => {
    const plan = [stage('a'), stage('b'), stage('c')];
    const legs = [leg(2), leg(1)];
    const newEntry = stage('new');
    const { stagePlan, legSchedule } = applyAddStage(plan, legs, 0, newEntry);

    expect(stagePlan.map((s) => s._uid)).toEqual(['a', 'b', 'new', 'c']);
    expect(legSchedule).toEqual([leg(3), leg(1)]);
    // Inputs untouched.
    expect(plan.map((s) => s._uid)).toEqual(['a', 'b', 'c']);
    expect(legs[0].stage_count).toBe(2);
  });

  it('appends past the end of the last leg when that leg is targeted, growing the plan by one overall', () => {
    const plan = [stage('a')];
    const legs = [leg(1)];
    const { stagePlan, legSchedule } = applyAddStage(plan, legs, 0, stage('b'));
    expect(stagePlan.map((s) => s._uid)).toEqual(['a', 'b']);
    expect(legSchedule).toEqual([leg(2)]);
  });

  it('adding into an earlier leg inserts before later legs\' stages, not at the very end of stagePlan', () => {
    const plan = [stage('a'), stage('b')]; // leg0: [a], leg1: [b]
    const legs = [leg(1), leg(1)];
    const { stagePlan, legSchedule } = applyAddStage(plan, legs, 0, stage('new'));
    expect(stagePlan.map((s) => s._uid)).toEqual(['a', 'new', 'b']);
    expect(legSchedule).toEqual([leg(2), leg(1)]);
  });
});

// rbr-rally-creator-web#107: the workspace's "+ Add leg" shortcut's pure
// math -- same append-an-empty-leg rule RoadBook's own "+ Add Leg" button
// already uses (RallyBuilder's handleAddLeg), just exercised standalone so
// RoadBook's handleAddLegFromWorkspace can stay a one-liner.
describe('applyAddLeg', () => {
  it('appends one new empty leg to the end of legSchedule', () => {
    const legs = [leg(2), leg(1)];
    const { legSchedule } = applyAddLeg(legs);
    expect(legSchedule).toHaveLength(3);
    expect(legSchedule[0]).toBe(legs[0]);
    expect(legSchedule[1]).toBe(legs[1]);
    expect(legSchedule[2]).toMatchObject({ stage_count: 0, super_rally: 'disabled' });
  });

  it('returns the new leg\'s index so the caller can jump selection to it', () => {
    const legs = [leg(2), leg(1)];
    const { legIndex } = applyAddLeg(legs);
    expect(legIndex).toBe(2);
  });

  it('does not mutate the input array', () => {
    const legs = [leg(2)];
    applyAddLeg(legs);
    expect(legs).toHaveLength(1);
  });

  it('works from an empty legSchedule too (index 0)', () => {
    const { legSchedule, legIndex } = applyAddLeg([]);
    expect(legIndex).toBe(0);
    expect(legSchedule).toHaveLength(1);
  });
});
