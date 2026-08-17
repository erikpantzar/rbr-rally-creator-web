import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeLegStageRanges,
  createStageConfigFromPrevious,
  createDefaultServiceFields,
  applyPickedStageToConfig,
  getRecentServiceConfigs,
  MAX_LEGS,
} from '../../lib/rallyPlan.js';
import {
  applyStageConfigUpdate,
  applyServiceFieldsUpdate,
  applyAddStage,
  applyAddLeg,
  applyReorderStage,
} from '../../lib/pickerWorkspace.js';
import { PickerWorkspace } from '../PickerWorkspace/PickerWorkspace.jsx';
import { Itinerary } from '../Itinerary/Itinerary.jsx';
import { ServiceConfigModal } from '../ServiceConfigModal/ServiceConfigModal.jsx';
import { Toast } from '../Toast/Toast.jsx';

// How long the "Undo" toast stays up after a brick delete or leg removal,
// per DESIGN_SPEC.md's UX review note on undo. One pending undo at a time --
// starting a new one (a fresh delete, or a fresh leg removal) simply
// replaces whatever was pending, no queue/stack.
const UNDO_TIMEOUT_MS = 5000;

// Owns the road book's mutation/undo/modal state. Per DESIGN_SPEC.md's "Lego bits"
// model, the road book is no longer a fixed grid of rallyBasics.stages
// slots you drag catalog cards onto -- it's an additive list of bricks, one
// per already-configured stage, that only grows via the "+ Add stage"
// button opening PickerWorkspace. Dragging is retargeted at StageBrick and
// scoped to *reordering already-placed bricks* (within a leg, or across a
// leg boundary) -- there is no more drag-a-catalog-card-onto-a-slot
// mechanic, and StageCatalogPanel is no longer rendered here as a permanent
// side panel; the stage picker now lives inside PickerWorkspace
// (rbr-rally-creator-web#107).
//
// Still "simple in, simple out" -- stagePlan/legSchedule/stages/options
// come in as props, all mutations go back out via
// onStagePlanChange/onLegScheduleChange callbacks; RallyBuilder remains the
// only place that owns the actual state and talks to the API.
export function RoadBook({
  stages,
  options,
  stagePlan,
  legSchedule,
  onStagePlanChange,
  onLegScheduleChange,
  onLegFieldChange,
  onSharedLegFieldChange,
  onSetLegSynced,
  onAddLeg,
  hiddenStageNameEnabled = false,
  locked = false,
}) {
  const [modalState, setModalState] = useState(null); // { mode, legIndex, uid? } -- opens PickerWorkspace
  // rbr-rally-creator-web#80: which stage's ServiceConfigModal (if any) is
  // open -- { uid, stageNumber, isLastStage }. Entirely separate from
  // modalState above -- PickerWorkspace and this standalone ServiceConfigModal
  // are sibling modals, never shown at once from the same click (this one is
  // opened directly from a leg-row ServiceBlock click, not through
  // modalState/PickerWorkspace).
  const [serviceModalState, setServiceModalState] = useState(null);
  // Single in-flight undo slot, shared by stage-delete and leg-remove (the
  // Toast below is one fixed-position element -- two independent pending
  // states could in theory both be "live" and would render on top of each
  // other, so this is deliberately one discriminated slot rather than a
  // second `pendingLegUndo` sibling). Starting either kind of undo replaces
  // whatever was pending, same "no queue/stack" rule as before; in practice
  // a stage-delete and a leg-removal can't both be mid-flight anyway since
  // they're separate user actions and this is a single-user UI.
  //
  // Shape is one of:
  //   { type: 'stage', config, legIndex, indexInLeg } -- config is the
  //     deleted stage's full plan entry (including its original _uid) so
  //     undo can splice it back into stagePlan exactly where it was, and
  //     bump that leg's stage_count back up -- the same cross-leg math
  //     handleDragEnd already does for drag moves, just adding one instead
  //     of moving one.
  //   { type: 'leg', legIndex, legConfig, targetLegIndex,
  //     targetStageCountBefore } -- legConfig is the removed leg's full
  //     legSchedule entry (open_time/close_time/stage_count) as it was
  //     right before removal, legIndex is where it lived so undo can
  //     reinsert it there, and targetStageCountBefore is the merge target's
  //     stage_count *before* the removed leg's stages were folded in, so
  //     undo can restore it exactly rather than subtracting stageCount back
  //     out of whatever the target's count happens to be by the time Undo
  //     is clicked.
  const [pendingUndo, setPendingUndo] = useState(null);
  const undoTimerRef = useRef(null);

  // rbr-rally-creator-web#34: which leg's remove-confirmation bubble (if
  // any) is currently open -- { legIndex, stageCount, targetLegIndex,
  // direction }. Only one at a time, same "single pending thing" shape as
  // pendingUndo above. null means no bubble is showing.
  const [removeConfirm, setRemoveConfirm] = useState(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // If the leg count changes out from under an open confirmation bubble
  // (e.g. a leg was added/removed by some other path while it was up), the
  // captured legIndex/targetLegIndex could now point at the wrong row --
  // simplest safe response is to just close it rather than let a stale
  // confirm act on the wrong leg.
  useEffect(() => {
    setRemoveConfirm(null);
  }, [legSchedule.length]);

  // Escape closes the bubble too, matching Modal's Escape-closes convention
  // (useDialogChrome) elsewhere in this app.
  useEffect(() => {
    if (!removeConfirm) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setRemoveConfirm(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [removeConfirm]);

  function clearPendingUndo() {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingUndo(null);
  }

  function handleDeleteStage(legIndex, indexInLeg, stageConfig) {
    // A second delete while a toast is already showing discards the earlier
    // pending-undo state (per spec: one pending undo at a time, no queue) --
    // clearing the old timer here before starting the new one prevents it
    // from firing later and wiping out the *new* pending undo.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    onStagePlanChange(stagePlan.filter((s) => s._uid !== stageConfig._uid));
    onLegScheduleChange(
      legSchedule.map((l, li) => (li === legIndex ? { ...l, stage_count: Math.max(0, (l.stage_count || 0) - 1) } : l))
    );

    setPendingUndo({ type: 'stage', config: stageConfig, legIndex, indexInLeg });
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setPendingUndo(null);
    }, UNDO_TIMEOUT_MS);
  }

  // rbr-rally-creator-web#29's follow-up to #15: legs are additive but were
  // never removable. A leg with 0 stages is risk-free to drop outright (the
  // same case #15's own comment called out as safe) -- anything else needs
  // to ask where its stages go, since deleting them outright would silently
  // orphan stage data the user spent time configuring.
  //
  // No stagePlan surgery is needed for the merge case: computeLegStageRanges
  // derives every leg's [startIndex, endIndex) slice of the flat stagePlan
  // array purely from stage_count, in leg order. Leg K's stages already sit
  // immediately after leg K-1's in that array, so folding leg K's
  // stage_count onto its neighbor's and dropping leg K's legSchedule entry
  // is enough -- the merged leg's wider range now covers exactly the same
  // (already-contiguous) stagePlan slice both legs used to split between
  // them. stagePlan itself never moves.
  function handleRemoveLegClick(legIndex) {
    const leg = legSchedule[legIndex];
    const stageCount = leg.stage_count || 0;

    if (stageCount === 0) {
      onLegScheduleChange(legSchedule.filter((_, i) => i !== legIndex));
      return;
    }

    const hasPrevious = legIndex > 0;
    const hasNext = legIndex < legSchedule.length - 1;
    if (!hasPrevious && !hasNext) {
      // Only leg in the rally -- nothing to merge its stages into, and a
      // rally needs at least one leg, so removal isn't possible. The
      // control is disabled for this case below; this is just a defensive
      // no-op if it's ever reached anyway.
      return;
    }

    // Default direction is the previous leg per the issue; falls back to
    // the next leg when removing the first leg (no previous exists). Rather
    // than acting immediately (the old window.confirm path), stash the
    // decision and open the inline confirmation bubble -- handleConfirmRemoveLeg
    // below performs the actual merge once the user explicitly agrees.
    const targetLegIndex = hasPrevious ? legIndex - 1 : legIndex + 1;
    const direction = hasPrevious ? 'previous' : 'next';

    setRemoveConfirm({ legIndex, stageCount, targetLegIndex, direction });
  }

  function handleConfirmRemoveLeg() {
    if (!removeConfirm) return;
    const { legIndex, targetLegIndex, stageCount } = removeConfirm;

    // Capture the removed leg's full config and the merge target's
    // stage_count as they stand right now, before either is touched --
    // this is exactly what handleUndoRemoveLeg needs to reverse the merge
    // precisely, rather than re-deriving it from post-merge state later.
    const legConfig = legSchedule[legIndex];
    const targetStageCountBefore = legSchedule[targetLegIndex].stage_count || 0;

    const nextLegSchedule = legSchedule
      .map((l, i) => (i === targetLegIndex ? { ...l, stage_count: targetStageCountBefore + stageCount } : l))
      .filter((_, i) => i !== legIndex);

    // Same "one pending undo at a time" rule as handleDeleteStage: clear
    // any still-running timer (e.g. a stage-delete undo that's still up)
    // before replacing pendingUndo, so it can't fire later and clobber this
    // brand-new leg-removal undo.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    onLegScheduleChange(nextLegSchedule);
    setRemoveConfirm(null);

    setPendingUndo({ type: 'leg', legIndex, legConfig, targetLegIndex, targetStageCountBefore });
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setPendingUndo(null);
    }, UNDO_TIMEOUT_MS);
  }

  function handleCancelRemoveLeg() {
    setRemoveConfirm(null);
  }

  function handleUndoStageDelete(pending) {
    const { config, legIndex, indexInLeg } = pending;

    // Re-derive the leg's current start/end from live legSchedule/stagePlan
    // (not from stale legRanges captured at delete time) -- reinsertion
    // happens after arbitrary time has passed, during which other edits
    // could have shifted stagePlan around.
    const freshRanges = computeLegStageRanges(legSchedule);
    const { startIndex, endIndex } = freshRanges[legIndex];
    const insertAt = Math.min(startIndex + indexInLeg, endIndex);

    onStagePlanChange([...stagePlan.slice(0, insertAt), config, ...stagePlan.slice(insertAt)]);
    onLegScheduleChange(
      legSchedule.map((l, li) => (li === legIndex ? { ...l, stage_count: (l.stage_count || 0) + 1 } : l))
    );
  }

  function handleUndoRemoveLeg(pending) {
    const { legIndex, legConfig, targetLegIndex, targetStageCountBefore } = pending;

    // Reinsert the removed leg at its original index first -- that alone
    // restores every other leg's index to exactly what it was pre-removal
    // (removal only ever drops one entry, nothing else shifts), so
    // targetLegIndex (captured at removal time) is safe to use as-is
    // against the reinserted array to restore its original stage_count,
    // rather than re-deriving "current" target index from a shifted one.
    if (legIndex < 0 || legIndex > legSchedule.length || targetLegIndex < 0) return;

    const withLegReinserted = [...legSchedule.slice(0, legIndex), legConfig, ...legSchedule.slice(legIndex)];
    if (targetLegIndex >= withLegReinserted.length) return;

    onLegScheduleChange(
      withLegReinserted.map((l, i) => (i === targetLegIndex ? { ...l, stage_count: targetStageCountBefore } : l))
    );
  }

  // Dispatches to the right undo based on what's pending -- see the
  // pendingUndo declaration above for why stage-delete and leg-remove share
  // this one slot/Toast instead of separate state.
  function handleUndo() {
    if (!pendingUndo) return;
    if (pendingUndo.type === 'leg') {
      handleUndoRemoveLeg(pendingUndo);
    } else {
      handleUndoStageDelete(pendingUndo);
    }
    clearPendingUndo();
  }

  const stageByUid = useMemo(() => new Map(stagePlan.map((s) => [s._uid, s])), [stagePlan]);

  const legRanges = computeLegStageRanges(legSchedule);

  function handleClearService(stageUid) {
    onStagePlanChange(
      stagePlan.map((s) =>
        s._uid === stageUid ? { ...s, service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' } : s
      )
    );
  }

  // rbr-rally-creator-web#96: a dragged service block's fields land on
  // whichever stage it's dropped after (targetStageUid, resolved by
  // Itinerary), and the stage it was dragged away from reverts to "No
  // Service" -- a service belongs to "the stage that follows it after
  // drop", not a free-floating item.
  function handleReassignService(sourceStageUid, targetStageUid) {
    const { service_time, nummechanics, mechanicsSkill } = stageByUid.get(sourceStageUid);
    onStagePlanChange(
      stagePlan.map((s) => {
        if (s._uid === targetStageUid) return { ...s, service_time, nummechanics, mechanicsSkill };
        if (s._uid === sourceStageUid) {
          return { ...s, service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' };
        }
        return s;
      })
    );
  }

  // rbr-rally-creator-web#107 (Phase 3): modalState is now just PickerWorkspace's
  // open/selection signal -- mode, legIndex, uid. It used to also carry
  // initialValue/willBeLastStage/stageNumber for StageConfigModal, which
  // froze them at open time; PickerWorkspace derives all of that live from
  // the plan instead (plan doc R5), so those fields are gone.
  function openAddModal(legIndex) {
    setModalState({ mode: 'add', legIndex, uid: null });
  }

  function openEditModal(legIndex, uid) {
    setModalState({ mode: 'edit', legIndex, uid });
  }

  function closeModal() {
    setModalState(null);
  }

  // rbr-rally-creator-web#107: PickerWorkspace's LIVE per-change updates
  // (plan doc D1: the workspace pane has no Save; every StageEntryEditor
  // onChange lands here immediately). Routing through onStagePlanChange is
  // what keeps normalizeLastStageService applied to every one of these
  // writes -- RallyBuilder's updateStagePlan runs it on each call (plan
  // doc constraint 2).
  function handleUpdateStage(uid, config) {
    onStagePlanChange(applyStageConfigUpdate(stagePlan, uid, config));
  }

  // Same write shape for service fields only -- shared by the standalone
  // ServiceConfigModal's Save (opened from a leg-row ServiceBlock click) and
  // the workspace's in-pane ServiceEntryForm (plan doc D5).
  function handleUpdateService(uid, serviceFields) {
    onStagePlanChange(applyServiceFieldsUpdate(stagePlan, uid, serviceFields));
  }

  // Phase 2 (#107, D2/D3/D4): PickerWorkspace's click-to-add. `legIndex` is
  // the caller's cursor -- the selected entry's leg per D3 -- and `stageId`
  // is whichever catalog card was clicked; this builds the same
  // "born-complete" brick handleModalSave's old 'add' branch built (seeded
  // from the stage that will precede it via createStageConfigFromPrevious,
  // rbr-rally-creator-web#5, then the picked stage's defaults applied
  // atomically via applyPickedStageToConfig, R6) and splices it onto the
  // end of that leg (D4) via applyAddStage. Returns the new brick's _uid so
  // the workspace can select it immediately (the doc's Phase 2 spec: one
  // click per stage, no re-navigating to find what you just added).
  function handleAddStageFromWorkspace(legIndex, stageId) {
    const { endIndex } = legRanges[legIndex];
    const seeded = createStageConfigFromPrevious(stagePlan[endIndex - 1]);
    const stage = stages.find((s) => s.id === stageId) ?? null;
    const config = applyPickedStageToConfig(seeded, stage);

    const { stagePlan: nextStagePlan, legSchedule: nextLegSchedule } = applyAddStage(
      stagePlan,
      legSchedule,
      legIndex,
      config
    );
    onStagePlanChange(nextStagePlan);
    onLegScheduleChange(nextLegSchedule);

    return config._uid;
  }

  // rbr-rally-creator-web#107: the stage editor pane's "+ Add service after
  // this stage" shortcut -- gives `uid`'s stage a sensible starting service
  // (createDefaultServiceFields, the same three values a brand-new stage
  // config already seeds) via the exact same write shape
  // handleUpdateService/handleServiceModalSave use, so this is genuinely
  // "assign a service" and not a parallel code path. Guards against the
  // rally's true last stage defensively -- StageEntryEditor already hides
  // the button whenever isLastStage is true (normalizeLastStageService would
  // just strip it back out on the next onStagePlanChange anyway, per the
  // site's real business rule), but a stale click from an in-flight render
  // shouldn't silently write a service the plan will immediately erase.
  function handleAddServiceToStage(uid) {
    if (uid === stagePlan[stagePlan.length - 1]?._uid) return;
    handleUpdateService(uid, createDefaultServiceFields());
  }

  // rbr-rally-creator-web#107: the stage editor pane's "+ Add leg" shortcut
  // -- same createDefaultLegConfig(0) append RoadBook's own "+ Add Leg"
  // button (onAddLeg/handleAddLeg in RallyBuilder) already performs, just
  // reachable from inside the workspace too so the user never has to back
  // out to the road book to start a new leg. Pulled out as applyAddLeg
  // (pickerWorkspace.js) so this handler stays a one-liner, mirroring
  // handleAddStageFromWorkspace's own split above. Returns the new leg's
  // index so the workspace can jump selection to its leg-context pane.
  function handleAddLegFromWorkspace() {
    const { legSchedule: nextLegSchedule, legIndex } = applyAddLeg(legSchedule);
    onLegScheduleChange(nextLegSchedule);
    return legIndex;
  }

  function handleReorderStage(uid, destLegIndex, destIndex) {
    const { stagePlan: nextStagePlan, legSchedule: nextLegSchedule } = applyReorderStage(
      stagePlan,
      legSchedule,
      uid,
      destLegIndex,
      destIndex
    );
    onStagePlanChange(nextStagePlan);
    onLegScheduleChange(nextLegSchedule);
  }

  // rbr-rally-creator-web#80: opens ServiceConfigModal scoped to one stage
  // -- `uid` is implicit from whichever brick/block the user clicked, never
  // asked for via a picker inside the modal itself. isLastStage is the same
  // "is this the rally's true final stage" check PickerWorkspace derives
  // live for its own in-pane service form, so the disabled business rule
  // matches wherever service editing is opened from.
  function openServiceModal(uid) {
    const stageIndex = stagePlan.findIndex((s) => s._uid === uid);
    setServiceModalState({
      uid,
      stageNumber: stageIndex + 1,
      isLastStage: uid === stagePlan[stagePlan.length - 1]?._uid,
    });
  }

  function closeServiceModal() {
    setServiceModalState(null);
  }

  // Same underlying state update handleUpdateService/onUpdateService make
  // for PickerWorkspace's in-pane service form (write
  // service_time/nummechanics/mechanicsSkill onto the target stage's
  // stagePlan entry) -- just triggered from this separate entry point
  // instead of the workspace.
  function handleServiceModalSave(serviceFields) {
    if (!serviceModalState) return;
    handleUpdateService(serviceModalState.uid, serviceFields);
    closeServiceModal();
  }

  // Itinerary (shared with PickerWorkspace's sidebar, at reduced detail)
  // owns the actual leg/stage/service rendering and all drag-and-drop --
  // RoadBook itself is now just the mutation/undo/modal state and the two
  // modals layered on top. `locked` passes straight through: Itinerary
  // renders the same DESIGN_SPEC.md "Created / locked" plain-text/no-sensors
  // treatment it always did.
  return (
    <>
      <Itinerary
        detail="full"
        stages={stages}
        options={options}
        stagePlan={stagePlan}
        legSchedule={legSchedule}
        hiddenStageNameEnabled={hiddenStageNameEnabled}
        locked={locked}
        onLegFieldChange={onLegFieldChange}
        onSharedLegFieldChange={onSharedLegFieldChange}
        onSetLegSynced={onSetLegSynced}
        onRemoveLeg={handleRemoveLegClick}
        onAddStage={openAddModal}
        onEditStage={openEditModal}
        onDeleteStage={handleDeleteStage}
        onOpenService={openServiceModal}
        onClearService={handleClearService}
        onAddLeg={onAddLeg}
        onReorderStage={handleReorderStage}
        onReassignService={handleReassignService}
        removeConfirm={removeConfirm}
        onConfirmRemoveLeg={handleConfirmRemoveLeg}
        onCancelRemoveLeg={handleCancelRemoveLeg}
        rallyTotal
        addLegDisabled={legSchedule.length >= MAX_LEGS}
        addLegDisabledReason={legSchedule.length >= MAX_LEGS ? `Rallies can have at most ${MAX_LEGS} legs` : undefined}
      />

      {/* rbr-rally-creator-web#107: openAddModal/openEditModal render the
          PickerWorkspace -- the only picker/editor flow now (the old
          StageConfigModal chrome + flag were removed in Phase 3, plan doc
          §6). It's a controlled view over the live stagePlan/legSchedule
          props (plan doc Option C) -- selection starts from the origin
          context (D3: the clicked stage, or the origin leg for "+ Add
          stage"), edits flow back LIVE through
          handleUpdateStage/handleUpdateService (D1), picker-adds flow
          through handleAddStageFromWorkspace (D2/D4), and closing just
          clears modalState -- nothing pending to save or discard. Position
          facts (stageNumber, isLastStage) are derived live inside the
          workspace from the plan, not frozen at open time (plan doc R5).
          onAddServiceToStage/onAddLegFromWorkspace: the stage editor pane's
          two contextual shortcuts ("+ Add service after this stage", "+ Add
          leg") -- unlike the picker-add flow above, these two DO jump the
          workspace's selection to what they just created (explicit
          intentional navigation, not the "keep dealing cards" rhythm D2's
          click-to-add is tuned for). */}
      {!locked && modalState && (
        <PickerWorkspace
          stages={stages}
          options={options}
          stagePlan={stagePlan}
          legSchedule={legSchedule}
          hiddenStageNameEnabled={hiddenStageNameEnabled}
          initialSelection={
            modalState.mode === 'edit'
              ? { type: 'stage', uid: modalState.uid }
              : { type: 'leg', legIndex: modalState.legIndex }
          }
          onUpdateStage={handleUpdateStage}
          onUpdateService={handleUpdateService}
          onAddStage={handleAddStageFromWorkspace}
          onAddServiceToStage={handleAddServiceToStage}
          onAddLegFromWorkspace={handleAddLegFromWorkspace}
          onReorderStage={handleReorderStage}
          onReassignService={handleReassignService}
          onClose={closeModal}
        />
      )}

      {/* rbr-rally-creator-web#80: opened from a leg-row ServiceBlock click
          (openServiceModal above) -- entirely separate from modalState/
          PickerWorkspace above. No stage picker inside it; `uid` (and thus
          which stagePlan entry gets written back to) is fixed at open time
          by whichever block was clicked. */}
      {!locked && serviceModalState && (
        <ServiceConfigModal
          value={stageByUid.get(serviceModalState.uid)}
          options={options}
          stageNumber={serviceModalState.stageNumber}
          isLastStage={serviceModalState.isLastStage}
          recentServiceConfigs={getRecentServiceConfigs(stagePlan, serviceModalState.uid)}
          onSave={handleServiceModalSave}
          onCancel={closeServiceModal}
        />
      )}

      {!locked && pendingUndo && (
        <Toast
          message={pendingUndo.type === 'leg' ? 'Leg removed' : 'Stage removed'}
          actionLabel="Undo"
          onAction={handleUndo}
          onDismiss={clearPendingUndo}
        />
      )}
    </>
  );
}
