import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../Modal/Modal.jsx';
import { Itinerary } from '../Itinerary/Itinerary.jsx';
import { ServiceEntryForm } from '../ServiceEntryForm/ServiceEntryForm.jsx';
import { StageEntryEditor } from '../StageEntryEditor/StageEntryEditor.jsx';
import { StagePicker } from '../StagePicker/StagePicker.jsx';
import {
  resolveWorkspaceSelection,
  resolveSelectionAfterDelete,
  workspaceSelectionKey,
} from '../../lib/pickerWorkspace.js';
import { getRecentServiceConfigs } from '../../lib/rallyPlan.js';
import styles from './PickerWorkspace.module.css';

// rbr-rally-creator-web#107, docs/redesign/07-picker-workspace.md Phase 1/2:
// the "smarter modal" replacement for the StageConfigModal flow, behind the
// PICKER_WORKSPACE flag (see lib/settings.js). A takeover Modal holding two
// panes:
//
//  - LEFT: the rally itinerary sidebar -- one vertical list of leg headers,
//    stage rows and assigned-service rows (plan doc D6), always rendering
//    the COMMITTED stagePlan/legSchedule props, never a local copy, so it
//    can't disagree with the road book behind it. Navigation-only: rows
//    only select; reorder/delete/add-buttons are still later phases (D6,
//    Phase 4) -- but see Phase 2 below, picker card clicks in the leg
//    context DO add now, distinct from the sidebar's own rows.
//  - RIGHT: the detail pane, hosting the Phase-0-extracted controlled
//    editors keyed per selection (the app's key-remount reset pattern, plan
//    doc constraint 3) -- StageEntryEditor for a stage, ServiceEntryForm
//    in-pane for a service (D5, no ServiceConfigModal overlay in here).
//
// The pane is fully LIVE (D1): every onChange flows straight out through
// onUpdateStage/onUpdateService into RoadBook's mutation handlers and on
// through RallyBuilder's updateStagePlan -- which is precisely what keeps
// normalizeLastStageService applied to every edit made here (plan doc
// constraint 2). There is no Save, no Cancel, and no draft to lose:
// "Back to rally" (or Escape, via Modal's useDialogChrome) is the only
// exit and is always non-destructive. The single-slot stageConfigDraft
// recovery is deliberately absent -- obsolete under live editing (D1/R2),
// since every change already lands in stagePlan, which RallyBuilder's
// debounced currentDraft autosave persists.
//
// This component owns exactly one piece of state: the selection cursor.
// RallyBuilder keeps the plan, RoadBook keeps every mutation (plan doc
// Option C ownership).
//
//   { type: 'stage', uid }        a stage entry's form
//   { type: 'service', uid }      that stage's in-pane service form
//   { type: 'leg', legIndex }     a leg's context (the future add-target)
//
// `initialSelection` implements D3's open-with-origin-context: RoadBook
// passes the clicked stage, or the origin leg when opened from
// "+ Add stage", so the workspace opens looking at what the user clicked.
//
// Phase 2 (#107, D2/D4): a leg context's picker card click now really adds
// -- onAddStage(legIndex, stageId) appends a born-complete brick to the END
// of that leg (RoadBook's handleAddStageFromWorkspace does the seeding +
// splice). The workspace deliberately STAYS on the leg-context pane rather
// than jumping the selection to the new brick (an earlier version of this
// did that; feedback was that it broke the "keep dealing stages" rhythm --
// every click should feel like adding a card to the leg, not a navigation).
// Instead: a self-dismissing "Stage added" toast plus a brief highlight-fade
// on the new row in the sidebar give the confirmation, and the picker stays
// put with its filters untouched (StagePicker persists its own filters
// across mounts) so the very next click adds the next stage. Replacing an
// EXISTING stage's catalog pick is a separate, explicit "Change stage"
// affordance on the stage form itself (StageEntryEditor's
// pickerMode="affordance", D2) -- the in-form picker no longer re-targets
// on a bare click the way the Phase 1 stopgap did.
//
// rbr-rally-creator-web#107 follow-up: the stage editor pane also hosts two
// contextual shortcuts -- "+ Add service after this stage" and "+ Add leg"
// -- reachable from StageEntryEditor's onAddService/onAddLeg props
// (handleAddServiceShortcut/handleAddLegShortcut below), backed by
// RoadBook's onAddServiceToStage/onAddLegFromWorkspace callbacks. These
// deliberately DO jump the workspace's selection to what they just created
// -- the opposite of the click-to-add picker's "stay put" rule above.
// Different intent: click-to-add is a repeatable rhythm where every click
// should feel like dealing the next card without looking away, but "add a
// service" / "add a leg" are one-shot, deliberate actions the user takes
// specifically to go work on that new thing next -- there's no "next one"
// to keep clicking through. Jumping is the whole point, not a regression of
// the click-to-add lesson above.
export function PickerWorkspace({
  stages,
  options,
  stagePlan,
  legSchedule,
  hiddenStageNameEnabled = false,
  initialSelection,
  onUpdateStage,
  onUpdateService,
  onDeleteStage,
  onAddStage,
  onAddServiceToStage,
  onAddLegFromWorkspace,
  onReorderStage,
  onReassignService,
  onClose,
}) {
  const [selection, setSelection] = useState(initialSelection ?? null);

  // Transient "you just added this" feedback -- a toast (auto-dismissed)
  // plus a fading highlight on the new row (CSS animation, cleared from
  // state on animationend so it can never get stuck). Both are pure UI
  // state local to this component, not plan state: the sidebar itself
  // always reflects committed stagePlan/legSchedule regardless of these.
  const [addedToast, setAddedToast] = useState(null);
  const [justAddedUid, setJustAddedUid] = useState(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  // Picker "already added" ribbon (#107 follow-up): counts, not booleans,
  // even though the ribbon itself only ever asks ">0" -- a Map is the
  // natural shape for "how many times does each catalog id appear", and
  // StagePicker's isStageAlreadyUsed already tolerates either a Map or a
  // plain object, so there's no reason to throw the count away here just
  // because today's only consumer doesn't need it. Recomputed from the live
  // stagePlan prop every render, same "never a stale local copy" rule as
  // `resolved` below.
  const stagePlanCounts = useMemo(() => {
    const counts = new Map();
    for (const entry of stagePlan) {
      counts.set(entry.stage_id, (counts.get(entry.stage_id) ?? 0) + 1);
    }
    return counts;
  }, [stagePlan]);

  // The effective selection is derived fresh from the live props every
  // render -- the plan changes under this component with every live edit,
  // so nothing plan-shaped is cached in state (see resolveWorkspaceSelection's
  // own comment for the stale-uid guard this buys).
  const resolved = resolveWorkspaceSelection(selection, stagePlan, legSchedule);
  const selectionKey = workspaceSelectionKey(resolved);

  // Live derivation of the selected entry's position facts (plan doc R5:
  // the old modal froze stageNumber/willBeLastStage at open time, which a
  // workspace that keeps rendering across plan changes must not do).
  const selectedIndex =
    resolved.type === 'leg' ? -1 : stagePlan.findIndex((s) => s._uid === resolved.uid);
  const selectedEntry = selectedIndex >= 0 ? stagePlan[selectedIndex] : null;
  const selectedStageNumber = selectedIndex + 1;
  const selectedIsLastStage = selectedIndex >= 0 && selectedIndex === stagePlan.length - 1;

  // Same primary-name preference as StageBrick's getStageNames: the local
  // planning nickname wins over the catalog name when set.
  function stageDisplayName(entry) {
    const catalogStage = entry.stage_id ? stageByCatalogId.get(entry.stage_id) : null;
    return entry._label || catalogStage?.name || 'Unassigned stage';
  }

  // rbr-rally-creator-web#141: the stage editor pane's delete affordance.
  // The next selection is computed from the CURRENT (pre-delete) stagePlan/
  // legSchedule props via resolveSelectionAfterDelete -- it has to happen
  // in this same tick, since onDeleteStage's actual mutation round-trips
  // async through RoadBook/RallyBuilder, and resolveWorkspaceSelection's
  // generic stale-uid fallback (always leg 0) would otherwise yank the user
  // to a leg they weren't even looking at. No confirm step: this reuses
  // RoadBook's existing handleDeleteStage undo-toast path unchanged (same
  // as the road book's own StageBrick cross, which also has none).
  function handleDeleteStage(uid) {
    const nextSelection = resolveSelectionAfterDelete(stagePlan, legSchedule, uid);
    onDeleteStage(uid);
    setSelection(nextSelection);
  }

  // rbr-rally-creator-web#107: the stage editor pane's "+ Add service after
  // this stage" shortcut. Unlike handleAddCardSelect above, this DOES jump
  // selection -- onAddServiceToStage assigns the service in one call (no
  // separate "now go fill it in" step the way a brand-new unassigned stage
  // needs), so landing on the service pane immediately is the natural next
  // stop, not a surprise navigation. Selection follows the exact
  // {type:'service', uid} shape resolveWorkspaceSelection already expects.
  function handleAddServiceShortcut() {
    onAddServiceToStage(resolved.uid);
    setSelection({ type: 'service', uid: resolved.uid });
  }

  // rbr-rally-creator-web#107: the stage editor pane's "+ Add leg"
  // shortcut. onAddLegFromWorkspace both creates the leg AND returns its
  // index (RoadBook.handleAddLegFromWorkspace), so the jump is a direct
  // read of that return value rather than a guess at legSchedule.length --
  // safe even if this ever fires twice in quick succession before a
  // re-render lands.
  function handleAddLegShortcut() {
    const newLegIndex = onAddLegFromWorkspace();
    setSelection({ type: 'leg', legIndex: newLegIndex });
  }

  function renderDetail() {
    if (resolved.type === 'stage') {
      return (
        <>
          <header className={styles.paneHeader}>
            <p className={styles.paneKicker}>Stage {selectedStageNumber}</p>
            <h4 className={styles.paneTitle}>{stageDisplayName(selectedEntry)}</h4>
          </header>
          {/* Plain div, not a <form> -- there is nothing to submit (D1).
              pickerMode="affordance" (Phase 2, D2/R6): the in-form
              StagePicker no longer re-targets on a bare card click -- that
              was the Phase 1 stopgap. Replacing this entry's stage is now
              the explicit "Change stage" affordance StageEntryEditor itself
              renders; every card click elsewhere in this workspace (the leg
              context below) always ADDS instead. */}
          <div className={styles.paneForm}>
            <StageEntryEditor
              value={selectedEntry}
              onChange={(next) => onUpdateStage(resolved.uid, next)}
              stages={stages}
              options={options}
              isLastStage={selectedIsLastStage}
              stageNumber={selectedStageNumber}
              hiddenStageNameEnabled={hiddenStageNameEnabled}
              onEditService={() => setSelection({ type: 'service', uid: resolved.uid })}
              pickerMode="affordance"
              stagePlanCounts={stagePlanCounts}
              onAddService={handleAddServiceShortcut}
              onAddLeg={handleAddLegShortcut}
              onDelete={() => handleDeleteStage(resolved.uid)}
            />
          </div>
        </>
      );
    }

    if (resolved.type === 'service') {
      return (
        <>
          <header className={styles.paneHeader}>
            <p className={styles.paneKicker}>Service &mdash; Stage {selectedStageNumber}</p>
            <h4 className={styles.paneTitle}>{stageDisplayName(selectedEntry)}</h4>
          </header>
          <div className={styles.paneForm}>
            {/* D5: the service form lives in-pane, same live contract as
                the stage editor. Value is trimmed to the three service
                fields so onChange emits exactly the write shape
                handleServiceModalSave has always used. */}
            <ServiceEntryForm
              value={{
                service_time: selectedEntry.service_time,
                nummechanics: selectedEntry.nummechanics,
                mechanicsSkill: selectedEntry.mechanicsSkill,
              }}
              onChange={(serviceFields) => onUpdateService(resolved.uid, serviceFields)}
              options={options}
              isLastStage={selectedIsLastStage}
              recentServiceConfigs={getRecentServiceConfigs(stagePlan, resolved.uid)}
            />
          </div>
        </>
      );
    }

    // Leg context (opened from "+ Add stage", or a leg header click) --
    // plan doc §5 defaults item 1 puts the picker here, scoped as the
    // leg's add-target (D3: sidebar selection is the cursor). Phase 2
    // (D2/D4): a card click here really adds now -- onAddStage splices a
    // new brick onto the end of THIS leg and the workspace selects it
    // (handleAddCardSelect below), so repeated clicks feel like dealing
    // cards: stay on this leg, click, watch the sidebar grow, keep going.
    const legStageCount = legSchedule[resolved.legIndex]?.stage_count || 0;

    function handleAddCardSelect(stageId) {
      const stage = stageByCatalogId.get(stageId);
      const newUid = onAddStage(resolved.legIndex, stageId);

      // Selection deliberately does NOT move to the new brick (see the
      // Phase 2 comment above) -- only the toast + row highlight change.
      // Re-triggering on every add (even the same uid twice in a row,
      // which can't actually happen here since each add gets a fresh uid)
      // clears any in-flight timeout first so a rapid string of adds each
      // gets its own full toast duration rather than the first one's timer
      // cutting a later toast short.
      clearTimeout(toastTimeoutRef.current);
      setAddedToast(stage ? `${stage.name} added` : 'Stage added');
      setJustAddedUid(newUid);
      toastTimeoutRef.current = setTimeout(() => setAddedToast(null), 2200);
    }

    return (
      <>
        <header className={styles.paneHeader}>
          <p className={styles.paneKicker}>Leg {resolved.legIndex + 1}</p>
          <h4 className={styles.paneTitle}>
            {legStageCount === 0 ? 'Add your first stage' : `${legStageCount} stage${legStageCount === 1 ? '' : 's'} planned`}
          </h4>
        </header>
        <p className={styles.addHint}>
          Pick a stage to add it to the end of Leg {resolved.legIndex + 1}. Filters stay put, so picking
          again keeps adding here.
        </p>
        <StagePicker
          stages={stages}
          selectedStageId={null}
          onSelect={handleAddCardSelect}
          stagePlanCounts={stagePlanCounts}
        />
      </>
    );
  }

  function handleSelectStage(uid) {
    setSelection({ type: 'stage', uid });
  }

  function handleSelectService(uid) {
    setSelection({ type: 'service', uid });
  }

  function handleSelectLeg(legIndex) {
    setSelection({ type: 'leg', legIndex });
  }

  return (
    <Modal variant="takeover" labelledBy="picker-workspace-title" onClose={onClose}>
      <div className={styles.header}>
        {/* Same back-affordance language as StageConfigModal's header --
            but no Save next to it: leaving is always non-destructive (D1),
            so "Back to rally" is the header's only action. */}
        <button type="button" className={styles.backButton} onClick={onClose}>
          <span aria-hidden="true">&larr;</span> Back to rally
        </button>
        <h3 id="picker-workspace-title" className={styles.headerTitle}>
          Rally workspace
        </h3>
        <p className={styles.headerHint}>Changes apply as you make them</p>
      </div>

      {/* "Stage added" confirmation -- self-dismissing (see handleAddCardSelect's
          timeout), role="status" so it's announced without stealing focus. Sits
          outside .body so it floats above both panes regardless of scroll
          position, same reasoning as the app's own Toast component. */}
      {addedToast && (
        <div className={styles.addedToast} role="status">
          {addedToast}
        </div>
      )}

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Rally itinerary">
          <Itinerary
            detail="compact"
            stages={stages}
            options={options}
            stagePlan={stagePlan}
            legSchedule={legSchedule}
            selection={resolved}
            onSelectStage={handleSelectStage}
            onSelectService={handleSelectService}
            onSelectLeg={handleSelectLeg}
            onReorderStage={onReorderStage}
            onReassignService={onReassignService}
            onAddLeg={handleAddLegShortcut}
            highlightUid={justAddedUid}
            onHighlightAnimationEnd={() => setJustAddedUid(null)}
          />
        </nav>

        {/* Keyed on the selection identity so switching rows remounts the
            editor with clean per-mount state (wet-suggestion dismissal,
            StagePicker's mount-scoped filters) -- plan doc constraint 3. */}
        <section key={selectionKey} className={styles.detail}>
          <div className={styles.detailInner}>{renderDetail()}</div>
        </section>
      </div>
    </Modal>
  );
}
