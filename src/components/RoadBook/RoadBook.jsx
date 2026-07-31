import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import {
  computeLegStageRanges,
  createStageConfigFromPrevious,
  cloneStageConfigWithNewUid,
  toDatetimeLocalValue,
  formatKm,
  sumStagePlanKm,
  MAX_LEG_SPAN_DAYS,
  MAX_LEGS,
} from '../../lib/rallyPlan.js';
import { StageBrick } from '../StageBrick/StageBrick.jsx';
import { StageConfigModal } from '../StageConfigModal/StageConfigModal.jsx';
import { Toast } from '../Toast/Toast.jsx';
import styles from './RoadBook.module.css';

// How long the "Undo" toast stays up after a brick delete or leg removal,
// per DESIGN_SPEC.md's UX review note on undo. One pending undo at a time --
// starting a new one (a fresh delete, or a fresh leg removal) simply
// replaces whatever was pending, no queue/stack.
const UNDO_TIMEOUT_MS = 5000;

// Droppable wrapper around a leg's stage row. Individual StageBricks are
// themselves sortable/droppable (dnd-kit's useSortable), which handles
// "drop onto this specific brick" -- this container-level droppable is the
// fallback target for "drop into this leg" when there's no specific brick
// under the pointer (the gap past the last brick), so a brick can still be
// dragged to the end of a leg that has fewer bricks than the pointer's x
// position would otherwise land on.
// UI-level hint for the close-time <input>'s max attribute -- the real
// enforcement (clamping close_time if it's pushed past this) lives in
// RallyBuilder's handleLegFieldChange; this just keeps the native date
// picker from suggesting out-of-range values in the first place.
function maxCloseTimeFor(openTime) {
  if (!openTime) return undefined;
  const maxDate = new Date(openTime);
  maxDate.setDate(maxDate.getDate() + MAX_LEG_SPAN_DAYS);
  return toDatetimeLocalValue(maxDate);
}

function LegDropContainer({ legIndex, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `leg-container-${legIndex}`, data: { type: 'leg-container', legIndex } });
  return (
    <div ref={setNodeRef} className={[styles.stagesList, isOver ? styles.legDropActive : ''].join(' ')}>
      {children}
    </div>
  );
}

// rbr-rally-creator-web#34: inline "context bubble" that replaces
// window.confirm for the has-stages leg-removal case. Anchored to the
// leg's remove button via .legRemoveWrap (position: relative in the CSS),
// in the same spirit as StageConfigModal's .restoredNotice and Toast's
// floating action -- a small, self-contained inline notice with explicit
// action buttons, not a heavyweight modal/dialog system. Purely
// presentational: RoadBook still owns the actual merge-direction decision
// (previous leg by default, next as fallback), this just shows it and
// waits for an explicit yes/no.
function LegRemoveConfirmBubble({ legIndex, stageCount, targetLegIndex, onConfirm, onCancel }) {
  return (
    <div className={styles.legRemoveBubble} role="dialog" aria-label={`Remove Leg ${legIndex + 1}?`}>
      <p className={styles.legRemoveBubbleText}>
        Leg {legIndex + 1} has {stageCount} stage{stageCount === 1 ? '' : 's'}. Move{' '}
        {stageCount === 1 ? 'it' : 'them'} into Leg {targetLegIndex + 1} and remove Leg {legIndex + 1}?
      </p>
      <div className={styles.legRemoveBubbleActions}>
        <button type="button" className={styles.legRemoveBubbleCancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.legRemoveBubbleConfirm} onClick={onConfirm}>
          Move stages &amp; remove
        </button>
      </div>
    </div>
  );
}

// Owns the DndContext for the road book. Per DESIGN_SPEC.md's "Lego bits"
// model, the road book is no longer a fixed grid of rallyBasics.stages
// slots you drag catalog cards onto -- it's an additive list of bricks, one
// per already-configured stage, that only grows via the "+ Add stage"
// button opening StageConfigModal. Dragging is retargeted at StageBrick and
// scoped to *reordering already-placed bricks* (within a leg, or across a
// leg boundary) -- there is no more drag-a-catalog-card-onto-a-slot
// mechanic, and StageCatalogPanel is no longer rendered here as a permanent
// side panel; the stage picker now lives inside StageConfigModal.
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
  onAddLeg,
  locked = false,
}) {
  const [activeDrag, setActiveDrag] = useState(null);
  const [modalState, setModalState] = useState(null); // { mode, legIndex, uid?, initialValue }
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
  //     legSchedule entry (open_time/close_time/super_rally/stage_count) as
  //     it was right before removal, legIndex is where it lived so undo can
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  // Escape closes the bubble too, matching StageConfigModal's Escape-closes
  // convention elsewhere in this app.
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

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const stageByUid = useMemo(() => new Map(stagePlan.map((s) => [s._uid, s])), [stagePlan]);

  // Whole-rally km total (rbr-rally-creator-web#18) -- same sumStagePlanKm
  // helper each leg header below uses, just over the full stagePlan rather
  // than one leg's slice of it.
  const rallyTotalKm = sumStagePlanKm(stagePlan, stageByCatalogId);

  const legRanges = computeLegStageRanges(legSchedule);
  const containers = legRanges.map(({ startIndex, endIndex }) => stagePlan.slice(startIndex, endIndex).map((s) => s._uid));

  function findContainerOfUid(uid) {
    return containers.findIndex((c) => c.includes(uid));
  }

  function rebuildStagePlanFromContainers(newContainers) {
    return newContainers.flatMap((uids) => uids.map((uid) => stageByUid.get(uid)));
  }

  function handleDragStart(event) {
    const uid = event.active.id;
    const stagePlanEntry = stageByUid.get(uid);
    const catalogStage = stagePlanEntry?.stage_id ? stageByCatalogId.get(stagePlanEntry.stage_id) : null;
    setActiveDrag({ stage: catalogStage, uid });
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const sourceUid = active.id;
    const sourceLegIndex = findContainerOfUid(sourceUid);
    if (sourceLegIndex === -1) return;

    let destLegIndex;
    let destIndexInContainer;

    if (over.data.current?.type === 'stage-brick') {
      const overUid = over.id;
      if (overUid === sourceUid) return; // dropped on itself, no-op
      destLegIndex = findContainerOfUid(overUid);
      if (destLegIndex === -1) return;
      destIndexInContainer = containers[destLegIndex].indexOf(overUid);
    } else if (over.data.current?.type === 'leg-container') {
      destLegIndex = over.data.current.legIndex;
      destIndexInContainer = containers[destLegIndex].length;
    } else {
      return;
    }

    const newContainers = containers.map((c) => [...c]);

    if (sourceLegIndex === destLegIndex) {
      const sourceIndexInContainer = newContainers[sourceLegIndex].indexOf(sourceUid);
      newContainers[sourceLegIndex] = arrayMove(newContainers[sourceLegIndex], sourceIndexInContainer, destIndexInContainer);
      onStagePlanChange(rebuildStagePlanFromContainers(newContainers));
      return;
    }

    // Cross-leg move: pull the brick out of its source leg and splice it
    // into the destination leg at the dropped position -- then adjust each
    // leg's stage_count by one so start_stage_no recomputes to match the
    // new grouping (computeLegStageRanges derives it from these counts).
    newContainers[sourceLegIndex] = newContainers[sourceLegIndex].filter((u) => u !== sourceUid);
    newContainers[destLegIndex].splice(destIndexInContainer, 0, sourceUid);

    onStagePlanChange(rebuildStagePlanFromContainers(newContainers));
    onLegScheduleChange(
      legSchedule.map((leg, i) => {
        if (i === sourceLegIndex) return { ...leg, stage_count: Math.max(0, (leg.stage_count || 0) - 1) };
        if (i === destLegIndex) return { ...leg, stage_count: (leg.stage_count || 0) + 1 };
        return leg;
      })
    );
  }

  // Whether a brick landing at the end of `legIndex`'s row is (or would
  // become) the rally's very last stage overall -- used to drive the
  // modal's "service disabled on final stage" business rule. Only the last
  // leg's end-of-row position can ever be the rally's last stage.
  function isLastLegPosition(legIndex) {
    return legIndex === legRanges.length - 1;
  }

  function openAddModal(legIndex) {
    // Seed from whichever stage will end up immediately before this new one
    // once it's inserted -- the last brick already in this leg, or (if this
    // leg is still empty) the last brick of the leg before it -- rather
    // than the generic hardcoded defaults. That's a closer match for
    // "persist the one you made before" than always using the plan's global
    // last stage, which could otherwise carry forward a value (e.g. service
    // forced to "No Service" because it *was* the rally's last stage) onto
    // a new stage being inserted earlier in the book. See
    // createStageConfigFromPrevious in rallyPlan.js (rbr-rally-creator-web#5).
    const { endIndex } = legRanges[legIndex];
    setModalState({
      mode: 'add',
      legIndex,
      uid: null,
      initialValue: createStageConfigFromPrevious(stagePlan[endIndex - 1]),
      willBeLastStage: isLastLegPosition(legIndex),
      // rbr-rally-creator-web#64: 1-based position this new brick will land
      // at once saved (handleModalSave appends 'add'/'duplicate' at endIndex)
      // -- feeds StageConfigModal's nickname field's "Stage N" placeholder.
      stageNumber: endIndex + 1,
    });
  }

  function openEditModal(legIndex, uid) {
    setModalState({
      mode: 'edit',
      legIndex,
      uid,
      initialValue: stageByUid.get(uid),
      willBeLastStage: uid === stagePlan[stagePlan.length - 1]?._uid,
      stageNumber: stagePlan.findIndex((s) => s._uid === uid) + 1,
    });
  }

  function openDuplicateModal(legIndex, uid) {
    const { endIndex } = legRanges[legIndex];
    setModalState({
      mode: 'duplicate',
      legIndex,
      uid: null,
      initialValue: cloneStageConfigWithNewUid(stageByUid.get(uid)),
      willBeLastStage: isLastLegPosition(legIndex),
      stageNumber: endIndex + 1,
    });
  }

  function closeModal() {
    setModalState(null);
  }

  function handleModalSave(config) {
    if (!modalState) return;

    if (modalState.mode === 'edit') {
      onStagePlanChange(stagePlan.map((s) => (s._uid === modalState.uid ? config : s)));
    } else {
      // 'add' or 'duplicate': append as a brand-new brick at the end of the
      // target leg's slice of stagePlan, and grow that leg's stage_count by
      // one to match -- the road book has no fixed slot count to fill into
      // (per DESIGN_SPEC.md's additive "Lego bits" model), so a new brick
      // always means the plan (and its owning leg) get one longer.
      const { endIndex } = legRanges[modalState.legIndex];
      const nextStagePlan = [...stagePlan.slice(0, endIndex), config, ...stagePlan.slice(endIndex)];
      onStagePlanChange(nextStagePlan);
      onLegScheduleChange(
        legSchedule.map((l, li) => (li === modalState.legIndex ? { ...l, stage_count: (l.stage_count || 0) + 1 } : l))
      );
    }

    closeModal();
  }

  // Locked/read-only path: once a job has succeeded there is nothing left
  // to add/edit/reorder/delete (per DESIGN_SPEC.md's "Created / locked"
  // state), so this skips DndContext/SortableContext/modal/toast entirely
  // rather than mounting all that machinery with every handler a no-op --
  // simpler to reason about, and it's a plain early return so the normal
  // editable path below is untouched.
  if (locked) {
    return (
      <div className={styles.book}>
        {legRanges.map(({ startIndex, endIndex, startStageNo }, legIndex) => {
          const legStages = stagePlan.slice(startIndex, endIndex);
          const leg = legSchedule[legIndex];
          const legTotalKm = sumStagePlanKm(legStages, stageByCatalogId);

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>
                  Leg {legIndex + 1} <span className={styles.legStartStage}>(starts at stage {startStageNo})</span>{' '}
                  <span className={styles.legStageCount}>{legStages.length} stage{legStages.length === 1 ? '' : 's'}</span>{' '}
                  <span className={styles.legKmTotal}>{formatKm(legTotalKm)}</span>
                </h4>
                <div className={styles.legInputsLocked}>
                  <span>Open: {leg.open_time || '—'}</span>
                  <span>Close: {leg.close_time || '—'}</span>
                  <span>Super Rally: {leg.super_rally}</span>
                </div>
              </div>

              <div className={styles.stagesList}>
                {legStages.map((stageConfig, i) => {
                  const absoluteIndex = startIndex + i;
                  const catalogStage = stageConfig.stage_id ? stageByCatalogId.get(stageConfig.stage_id) : null;
                  return (
                    <StageBrick
                      key={stageConfig._uid}
                      uid={stageConfig._uid}
                      stage={catalogStage}
                      value={stageConfig}
                      stageNumber={absoluteIndex + 1}
                      locked
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className={styles.rallyTotal}>
          <span className={styles.rallyTotalLabel}>Rally total</span>
          <span className={styles.rallyTotalValue}>{formatKm(rallyTotalKm)}</span>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.book}>
        {legRanges.map(({ startIndex, endIndex, startStageNo }, legIndex) => {
          const legStages = stagePlan.slice(startIndex, endIndex);
          const leg = legSchedule[legIndex];
          const legTotalKm = sumStagePlanKm(legStages, stageByCatalogId);

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>
                  Leg {legIndex + 1} <span className={styles.legStartStage}>(starts at stage {startStageNo})</span>{' '}
                  <span className={styles.legStageCount}>{legStages.length} stage{legStages.length === 1 ? '' : 's'}</span>{' '}
                  <span className={styles.legKmTotal}>{formatKm(legTotalKm)}</span>
                </h4>
                {/* rbr-rally-creator-web#34: sits right next to the "Leg N"
                    heading (rather than at the far right of the header row,
                    past the open/close/super-rally inputs, per #29's
                    original placement) so it visually reads as "this leg's
                    remove control" instead of a stray action floating at the
                    end of the row. #29: the only leg in the rally can't be
                    removed -- a rally needs at least one -- so the control
                    is disabled rather than hidden, which would otherwise
                    read as "gone" instead of "not applicable right now". */}
                <div className={styles.legRemoveWrap}>
                  <button
                    type="button"
                    className={styles.legRemoveButton}
                    disabled={legSchedule.length <= 1}
                    aria-label={legSchedule.length <= 1 ? `Can't remove Leg ${legIndex + 1} -- it's the only leg` : `Remove Leg ${legIndex + 1}`}
                    title={legSchedule.length <= 1 ? "Can't remove the only leg" : `Remove Leg ${legIndex + 1}`}
                    onClick={() => handleRemoveLegClick(legIndex)}
                  >
                    ×
                  </button>
                  {removeConfirm?.legIndex === legIndex && (
                    <LegRemoveConfirmBubble
                      legIndex={removeConfirm.legIndex}
                      stageCount={removeConfirm.stageCount}
                      targetLegIndex={removeConfirm.targetLegIndex}
                      onConfirm={handleConfirmRemoveLeg}
                      onCancel={handleCancelRemoveLeg}
                    />
                  )}
                </div>
                <div className={styles.legInputs}>
                  <input
                    type="datetime-local"
                    placeholder="Open time"
                    value={leg.open_time}
                    onChange={(e) => onLegFieldChange(legIndex, 'open_time', e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    placeholder="Close time"
                    value={leg.close_time}
                    max={maxCloseTimeFor(leg.open_time)}
                    onChange={(e) => onLegFieldChange(legIndex, 'close_time', e.target.value)}
                  />
                  <select value={leg.super_rally} onChange={(e) => onLegFieldChange(legIndex, 'super_rally', e.target.value)}>
                    {options.superRally.map((opt) => (
                      <option key={opt} value={opt}>
                        Super Rally: {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <SortableContext items={containers[legIndex]} strategy={horizontalListSortingStrategy}>
                <LegDropContainer legIndex={legIndex}>
                  {legStages.map((stageConfig, i) => {
                    const absoluteIndex = startIndex + i;
                    const catalogStage = stageConfig.stage_id ? stageByCatalogId.get(stageConfig.stage_id) : null;
                    return (
                      <StageBrick
                        key={stageConfig._uid}
                        uid={stageConfig._uid}
                        stage={catalogStage}
                        value={stageConfig}
                        stageNumber={absoluteIndex + 1}
                        isFirst={i === 0}
                        isLast={i === legStages.length - 1}
                        onEdit={() => openEditModal(legIndex, stageConfig._uid)}
                        onDuplicate={() => openDuplicateModal(legIndex, stageConfig._uid)}
                        onDelete={() => handleDeleteStage(legIndex, i, stageConfig)}
                        onMoveUp={() => {
                          if (i === 0) return;
                          const newContainers = containers.map((c) => [...c]);
                          newContainers[legIndex] = arrayMove(newContainers[legIndex], i, i - 1);
                          onStagePlanChange(rebuildStagePlanFromContainers(newContainers));
                        }}
                        onMoveDown={() => {
                          if (i === legStages.length - 1) return;
                          const newContainers = containers.map((c) => [...c]);
                          newContainers[legIndex] = arrayMove(newContainers[legIndex], i, i + 1);
                          onStagePlanChange(rebuildStagePlanFromContainers(newContainers));
                        }}
                      />
                    );
                  })}

                  <button type="button" className={styles.addStageBrick} onClick={() => openAddModal(legIndex)}>
                    + Add stage
                  </button>

                  {legStages.length === 0 && (
                    <p className={styles.emptyLegHint} aria-hidden="true">
                      Add your first stage &rarr;
                    </p>
                  )}
                </LegDropContainer>
              </SortableContext>
            </div>
          );
        })}

        {/* Whole-rally km total (rbr-rally-creator-web#18), sitting above
            "+ Add Leg" as its own line -- keeps both visible/usable rather
            than one crowding out the other, and reads naturally as "the
            leg list is done, here's its grand total, and here's how to add
            more to it." */}
        <div className={styles.rallyTotal}>
          <span className={styles.rallyTotalLabel}>Rally total</span>
          <span className={styles.rallyTotalValue}>{formatKm(rallyTotalKm)}</span>
        </div>

        {/* Legs are additive too, per rbr-rally-creator-web#15's "Lego
            bits" model -- appended one at a time here rather than pre-sized
            by a rallyBasics.legs number input (RallyBasicsForm's "Legs"
            field is now just a read-only display of legSchedule.length).
            A new leg starts empty (0 stages); RallyBuilder's
            readinessProblems flags it as not publishable until it has at
            least one. Legs are removable too (rbr-rally-creator-web#29,
            #15's flagged follow-up, polished in #34) via each leg's "x"
            button above -- see handleRemoveLegClick for the
            empty-vs-has-stages/merge-direction logic. */}
        {/* rbr-rally-creator-web#37: the real site's wizard tops out at 6
            legs (confirmed against the backend's discovery capture) and a
            companion backend PR is enforcing that server-side -- disabling
            here instead of letting the user find out via a 400 after
            submit. Disabled rather than hidden, same reasoning as the
            "Remove leg" button above. */}
        <button
          type="button"
          className={styles.addLegButton}
          onClick={onAddLeg}
          disabled={legSchedule.length >= MAX_LEGS}
          title={legSchedule.length >= MAX_LEGS ? `Rallies can have at most ${MAX_LEGS} legs` : undefined}
        >

          + Add Leg
        </button>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div className={styles.dragPreview}>
            <p className={styles.dragPreviewName}>{activeDrag.stage?.name ?? 'Stage'}</p>
            {activeDrag.stage && (
              <p className={styles.dragPreviewMeta}>
                {activeDrag.stage.country} &middot; {activeDrag.stage.surface} &middot; {activeDrag.stage.length}
              </p>
            )}
          </div>
        ) : null}
      </DragOverlay>

      {modalState && (
        <StageConfigModal
          mode={modalState.mode}
          initialValue={modalState.initialValue}
          stages={stages}
          options={options}
          isLastStage={modalState.willBeLastStage}
          stageNumber={modalState.stageNumber}
          onSave={handleModalSave}
          onCancel={closeModal}
        />
      )}

      {pendingUndo && (
        <Toast
          message={pendingUndo.type === 'leg' ? 'Leg removed' : 'Stage removed'}
          actionLabel="Undo"
          onAction={handleUndo}
          onDismiss={clearPendingUndo}
        />
      )}
    </DndContext>
  );
}
