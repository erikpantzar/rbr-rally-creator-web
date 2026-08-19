// Pure row-model / selection / update-math helpers for PickerWorkspace
// (rbr-rally-creator-web#107, docs/redesign/07-picker-workspace.md Phase 1).
// Kept framework-agnostic in rallyPlan.js's style so the plan doc's asked-for
// unit tests ("unit-test the selection/entry-key model and the
// update-callback math") can hit them directly, without rendering anything.

import { arrayMove } from '@dnd-kit/sortable';
import { computeLegStageRanges, createLegConfigForAppend, getServiceTier } from './rallyPlan.js';

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
// exactly these three fields. Also stamps _serviceEditedAt (client-only,
// stripped before submission same as _uid/_label) -- this is the single
// write path both the standalone ServiceConfigModal's Save and the
// in-pane form's live onChange funnel through (RoadBook.handleUpdateService),
// so one stamp here covers both entry points. Powers
// getRecentServiceConfigs' most-recently-edited ordering (rallyPlan.js).
export function applyServiceFieldsUpdate(stagePlan, uid, serviceFields) {
  return stagePlan.map((s) =>
    s._uid === uid ? { ...s, ...serviceFields, _serviceEditedAt: Date.now() } : s
  );
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
// via the exact same createLegConfigForAppend(legSchedule, 0) RoadBook's "+
// Add Leg" button already uses (RallyBuilder.jsx's handleAddLeg), so a leg
// created from either affordance is identical -- including joining the
// shared open/close group, rbr-rally-creator-web#127. Pulled out as pure
// array math for the same reason as applyAddStage above: RoadBook's handler
// stays a one-liner and the append is unit-testable without rendering
// anything. Returns the new leg's index (legSchedule.length before the
// append) so the caller can jump the workspace's selection to it.
export function applyAddLeg(legSchedule) {
  const legIndex = legSchedule.length;
  const nextLegSchedule = [...legSchedule, createLegConfigForAppend(legSchedule, 0)];
  return { legSchedule: nextLegSchedule, legIndex };
}

// rbr-rally-creator-web#141: what the workspace should select right after
// deleting the stage at `uid` -- computed from the plan as it stood BEFORE
// the delete (the caller's still-current props/closure), since the actual
// mutation round-trips async through RoadBook/RallyBuilder and the pane
// needs a same-tick answer to hand setSelection, not a guess derived after
// the fact from resolveWorkspaceSelection's generic stale-uid fallback
// (which always lands on leg 0 -- jarring if the deleted stage was in leg
// 3). Preference order, all within the SAME leg the deleted stage lived in
// (jumping to a different leg on delete would be its own surprise):
//   1. the next stage in the leg (it slides into the deleted one's slot)
//   2. the previous stage in the leg (nothing left after it)
//   3. that leg's own context (it was the leg's only stage)
// Falls back to leg 0 only if `uid` isn't in the plan at all -- shouldn't
// happen from the UI (the delete affordance only ever targets the entry
// it's rendered for), kept purely defensive.
export function resolveSelectionAfterDelete(stagePlan, legSchedule, uid) {
  const fallback = { type: 'leg', legIndex: 0 };
  const index = stagePlan.findIndex((s) => s._uid === uid);
  if (index === -1) return fallback;

  const ranges = computeLegStageRanges(legSchedule);
  const legIndex = ranges.findIndex(({ startIndex, endIndex }) => index >= startIndex && index < endIndex);
  if (legIndex === -1) return fallback;

  const { startIndex, endIndex } = ranges[legIndex];
  if (index + 1 < endIndex) return { type: 'stage', uid: stagePlan[index + 1]._uid };
  if (index - 1 >= startIndex) return { type: 'stage', uid: stagePlan[index - 1]._uid };
  return { type: 'leg', legIndex };
}

export function applyReorderStage(stagePlan, legSchedule, uid, destLegIndex, destIndex) {
  const ranges = computeLegStageRanges(legSchedule);
  const containers = ranges.map(({ startIndex, endIndex }) =>
    stagePlan.slice(startIndex, endIndex).map((s) => s._uid)
  );
  const sourceLegIndex = containers.findIndex((c) => c.includes(uid));
  if (sourceLegIndex === -1) return { stagePlan, legSchedule };

  const stageByUid = new Map(stagePlan.map((s) => [s._uid, s]));
  const newContainers = containers.map((c) => [...c]);

  if (sourceLegIndex === destLegIndex) {
    const sourceIndex = newContainers[sourceLegIndex].indexOf(uid);
    newContainers[sourceLegIndex] = arrayMove(newContainers[sourceLegIndex], sourceIndex, destIndex);
    const nextStagePlan = newContainers.flatMap((uids) => uids.map((u) => stageByUid.get(u)));
    return { stagePlan: nextStagePlan, legSchedule };
  }

  newContainers[sourceLegIndex] = newContainers[sourceLegIndex].filter((u) => u !== uid);
  newContainers[destLegIndex].splice(destIndex, 0, uid);

  const nextStagePlan = newContainers.flatMap((uids) => uids.map((u) => stageByUid.get(u)));
  const nextLegSchedule = legSchedule.map((leg, i) => {
    if (i === sourceLegIndex) return { ...leg, stage_count: Math.max(0, (leg.stage_count || 0) - 1) };
    if (i === destLegIndex) return { ...leg, stage_count: (leg.stage_count || 0) + 1 };
    return leg;
  });
  return { stagePlan: nextStagePlan, legSchedule: nextLegSchedule };
}
