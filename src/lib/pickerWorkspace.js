// Pure row-model / selection / update-math helpers for PickerWorkspace
// (rbr-rally-creator-web#107, docs/redesign/07-picker-workspace.md Phase 1).
// Kept framework-agnostic in rallyPlan.js's style so the plan doc's asked-for
// unit tests ("unit-test the selection/entry-key model and the
// update-callback math") can hit them directly, without rendering anything.

import { computeLegStageRanges, createDefaultLegConfig, getServiceTier } from './rallyPlan.js';

// Flattens the committed stagePlan/legSchedule truth into the sidebar's one
// vertical list (plan doc D6 + issue decision log: "one vertical list --
// legs as headers, each stage a row, service as its own row"). Row shapes:
//
//   { type: 'leg',     legIndex, startIndex, endIndex }
//   { type: 'stage',   legIndex, uid, stageNumber }        1-based, rally-wide
//   { type: 'service', legIndex, uid, stageNumber }        the owning stage's
//
// Service rows appear only for *assigned* services (plan doc §5 defaults
// item 3 -- "keeps the sidebar quiet"), and never for the rally's true last
// stage, mirroring RoadBook's legSequences rule exactly: there's no stage
// left to service before, and normalizeLastStageService force-clears the
// fields anyway. Unassigned stages reach the in-pane service editor through
// their own entry form's Service group instead (D5).
//
// Built from the same computeLegStageRanges slicing RoadBook renders from,
// so the sidebar can never disagree with the road book behind it -- both
// are pure projections of the same committed arrays.
export function buildWorkspaceRows(stagePlan, legSchedule) {
  const ranges = computeLegStageRanges(legSchedule);
  const rows = [];

  ranges.forEach(({ startIndex, endIndex }, legIndex) => {
    rows.push({ type: 'leg', legIndex, startIndex, endIndex });

    for (let i = startIndex; i < endIndex; i += 1) {
      const entry = stagePlan[i];
      // stage_count claiming more entries than stagePlan holds would be a
      // bug upstream -- skip rather than render ghost rows for it (echoes
      // the plan doc's "sidebar must not show ghost rows" watch-out).
      if (!entry) continue;

      rows.push({ type: 'stage', legIndex, uid: entry._uid, stageNumber: i + 1 });

      const isRallyLastStage = i === stagePlan.length - 1;
      if (!isRallyLastStage && getServiceTier(entry.service_time).key !== 'none') {
        rows.push({ type: 'service', legIndex, uid: entry._uid, stageNumber: i + 1 });
      }
    }
  });

  return rows;
}

// One string identity per selectable thing -- used both as the detail
// pane's React key (the app's key-remount reset pattern, plan doc
// constraint 3: switching entries must remount the editor with clean local
// state) and for "is this row the selected one" comparisons in the sidebar.
// A stage and its service row are deliberately DIFFERENT keys even though
// they share a uid: swapping between them must remount the pane.
export function workspaceSelectionKey(selection) {
  if (selection.type === 'leg') return `leg:${selection.legIndex}`;
  return `${selection.type}:${selection.uid}`;
}

// Guards a stored selection against the live plan before rendering from it.
// The selection is workspace-local state while stagePlan/legSchedule are
// live props that can change under it (every edit round-trips through
// RallyBuilder, and later phases add/remove entries while the workspace is
// open) -- deriving a *valid* selection each render, instead of trusting
// the stored one, is what keeps a stale uid/legIndex from rendering a pane
// for an entry that no longer exists.
//
//  - stage/service selections stay valid while their uid is still in the
//    plan. A service selection deliberately stays valid even when that
//    stage's service is unassigned (its sidebar row disappears, per
//    defaults item 3): setting the tier to "No service" mid-edit must not
//    yank the pane away from under the user -- the in-pane form is also how
//    an unassigned service gets re-assigned.
//  - leg selections clamp into the current leg range.
//  - anything else (no selection, vanished uid) falls back to the first
//    leg's context -- the safest "somewhere real" available.
export function resolveWorkspaceSelection(selection, stagePlan, legSchedule) {
  const fallback = { type: 'leg', legIndex: 0 };
  if (!selection) return fallback;

  if (selection.type === 'leg') {
    const maxIndex = Math.max(0, legSchedule.length - 1);
    if (selection.legIndex >= 0 && selection.legIndex <= maxIndex) return selection;
    return { type: 'leg', legIndex: Math.min(Math.max(selection.legIndex, 0), maxIndex) };
  }

  if (stagePlan.some((s) => s._uid === selection.uid)) return selection;
  return fallback;
}

// The two live update shapes the workspace emits (plan doc Option C /
// Phase 1: "every onChange flows to RoadBook's new handleUpdateStage") --
// extracted as pure array math so RoadBook's handlers stay one-liners and
// the math itself is unit-testable. Both return new arrays; neither ever
// touches normalizeLastStageService, because that rule lives in
// RallyBuilder's updateStagePlan and runs on every onStagePlanChange
// (plan doc constraint 2) -- callers MUST route results through
// onStagePlanChange rather than holding them.

// Whole-entry replacement: the same map handleModalSave's 'edit' branch has
// always done. `config` is the full next entry (including its _uid) as
// handed back by the controlled StageEntryEditor.
export function applyStageConfigUpdate(stagePlan, uid, config) {
  return stagePlan.map((s) => (s._uid === uid ? config : s));
}

// Service-fields merge: the same write shape handleServiceModalSave has
// always used -- only service_time/nummechanics/mechanicsSkill move, the
// rest of the entry stays as-is. The in-pane ServiceEntryForm (D5) emits
// exactly these three fields.
export function applyServiceFieldsUpdate(stagePlan, uid, serviceFields) {
  return stagePlan.map((s) => (s._uid === uid ? { ...s, ...serviceFields } : s));
}

// Phase 2 (#107 D2/D4): splice a brand-new, already-complete brick (built by
// the caller via createStageConfigFromPrevious + applyPickedStageToConfig,
// same as today's "+ Add stage" flow) onto the END of the target leg's
// slice of stagePlan, and grow that leg's stage_count by one to match --
// the exact same two-array-atomically pattern handleModalSave's old 'add'
// branch used (RoadBook.jsx, plan doc constraint 1: "both, atomically").
// Pulled out as pure array math (mirroring applyStageConfigUpdate/
// applyServiceFieldsUpdate above) so RoadBook's handler stays a one-liner
// and the splice/bump math is unit-testable without rendering anything.
// Callers MUST route stagePlan through onStagePlanChange (not hold it) so
// normalizeLastStageService still runs -- this function never calls it,
// same contract as its siblings above.
export function applyAddStage(stagePlan, legSchedule, legIndex, config) {
  const { endIndex } = computeLegStageRanges(legSchedule)[legIndex];
  const nextStagePlan = [...stagePlan.slice(0, endIndex), config, ...stagePlan.slice(endIndex)];
  const nextLegSchedule = legSchedule.map((leg, i) =>
    i === legIndex ? { ...leg, stage_count: (leg.stage_count || 0) + 1 } : leg
  );
  return { stagePlan: nextStagePlan, legSchedule: nextLegSchedule };
}

// rbr-rally-creator-web#107: the workspace's "+ Add leg" shortcut (from
// inside the stage editor pane, not the road book's own leg-list button --
// same underlying rule, different entry point). Appends one new empty leg
// via the exact same createDefaultLegConfig(0) RoadBook's "+ Add Leg"
// button already uses (RallyBuilder.jsx's handleAddLeg), so a leg created
// from either affordance is identical. Pulled out as pure array math for
// the same reason as applyAddStage above: RoadBook's handler stays a
// one-liner and the append is unit-testable without rendering anything.
// Returns the new leg's index (legSchedule.length before the append) so the
// caller can jump the workspace's selection to it.
export function applyAddLeg(legSchedule) {
  const legIndex = legSchedule.length;
  const nextLegSchedule = [...legSchedule, createDefaultLegConfig(0)];
  return { legSchedule: nextLegSchedule, legIndex };
}
