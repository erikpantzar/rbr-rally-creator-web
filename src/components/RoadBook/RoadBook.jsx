import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import {
  computeLegStageRanges,
  createStageConfigFromPrevious,
  toDatetimeLocalValue,
  formatKm,
  sumStagePlanKm,
  getServiceTier,
  MAX_LEG_SPAN_DAYS,
  MAX_LEGS,
} from '../../lib/rallyPlan.js';
import { StageBrick } from '../StageBrick/StageBrick.jsx';
import { StageConfigModal } from '../StageConfigModal/StageConfigModal.jsx';
import { ServiceConfigModal } from '../ServiceConfigModal/ServiceConfigModal.jsx';
import { ServiceBlock } from '../ServiceBlock/ServiceBlock.jsx';
import { Toast } from '../Toast/Toast.jsx';
import styles from './RoadBook.module.css';

// How long the "Undo" toast stays up after a brick delete or leg removal,
// per DESIGN_SPEC.md's UX review note on undo. One pending undo at a time --
// starting a new one (a fresh delete, or a fresh leg removal) simply
// replaces whatever was pending, no queue/stack.
const UNDO_TIMEOUT_MS = 5000;

// Handed to DndContext in place of the real sensors while the road book is
// locked: with no sensors mounted, no drag can ever start, which is what
// lets the whole dnd wiring (DndContext/SortableContext/LegDropContainer
// and every onDrag* handler) stay mounted-but-inert in locked mode instead
// of being torn out -- see the comment above the render in RoadBook below.
// Module-level constant rather than a fresh [] per render so DndContext's
// sensor setup isn't needlessly re-run every time the component renders.
const NO_SENSORS = [];

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

// rbr-rally-creator-web#96: drag-to-delete target, rendered at the end of
// each leg's row (to the right of that leg's stages) -- one per leg rather
// than a single book-wide zone, so "drag it out to the right" reads as
// naturally reachable from wherever a brick lives, without a long drag
// across the whole document. Only mounted while a stage brick is actually
// being dragged (see the `activeDrag?.type === 'stage'` guard where this is
// rendered below) -- a drop target nobody can see is just visual clutter
// the rest of the time, matching .addStageBrick's "not always doing
// something" treatment for the empty-leg hint. Dropping on it routes
// through handleDragEnd's `remove-zone` branch, which reuses
// handleDeleteStage exactly -- no separate removal logic here.
function RemoveDropZone({ legIndex }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `remove-zone-${legIndex}`,
    data: { type: 'remove-zone', legIndex },
  });
  return (
    <div
      ref={setNodeRef}
      className={[styles.removeZone, isOver ? styles.removeZoneOver : ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      Drop to remove
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
  hiddenStageNameEnabled = false,
  locked = false,
}) {
  const [activeDrag, setActiveDrag] = useState(null);
  const [modalState, setModalState] = useState(null); // { mode, legIndex, uid?, initialValue }
  // rbr-rally-creator-web#80: which stage's ServiceConfigModal (if any) is
  // open -- { uid, stageNumber, isLastStage }. Entirely separate from
  // modalState above (StageConfigModal and ServiceConfigModal are sibling
  // modals per the final design, never shown at once from the same click),
  // but both can coexist if ServiceConfigModal was opened *from* the
  // "Service" summary button inside an already-open StageConfigModal.
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

  // rbr-rally-creator-web#96: service blocks are independently sortable, not
  // just implicit passengers on their stage. A service block has no
  // identity of its own in stagePlan (it's a few fields *on* a stage entry),
  // so an assigned one is addressed by a derived id, `service:<stageUid>`,
  // meaning "the service block currently assigned to this stage."
  // SERVICE_ID_PREFIX and the two helpers below are the only place that
  // encoding lives.
  const SERVICE_ID_PREFIX = 'service:';
  const serviceSortableId = (stageUid) => `${SERVICE_ID_PREFIX}${stageUid}`;
  const stageUidFromServiceSortableId = (id) =>
    typeof id === 'string' && id.startsWith(SERVICE_ID_PREFIX) ? id.slice(SERVICE_ID_PREFIX.length) : null;

  function isServiceAssigned(stageConfig) {
    return getServiceTier(stageConfig.service_time).key !== 'none';
  }

  // rbr-rally-creator-web#97: the last assignable (non-rally-final) stage in
  // a leg that doesn't have a service assigned yet -- what the leg's single
  // "+ Add service" button targets. null when every assignable stage in the
  // leg already has one (or there's no assignable stage at all), in which
  // case the button isn't rendered for that leg.
  function lastUnassignedServiceStageUid(legIndex) {
    const { startIndex, endIndex } = legRanges[legIndex];
    for (let absoluteIndex = endIndex - 1; absoluteIndex >= startIndex; absoluteIndex--) {
      if (absoluteIndex === stagePlan.length - 1) continue; // rally's true last stage: never assignable
      const stageConfig = stagePlan[absoluteIndex];
      if (!isServiceAssigned(stageConfig)) return stageConfig._uid;
    }
    return null;
  }

  // Per-leg flat sequence dnd-kit sorts: each stage uid, followed by its
  // service token if (and only if) it currently has one assigned. The
  // rally's true last stage never gets a service token slot at all, per the
  // existing business rule (no stage left to service before). The "+ Add
  // service" button is a plain click target now (see ServiceConfigModal's
  // opener below), not part of the sortable sequence.
  const legSequences = containers.map((uids, legIndex) => {
    const { startIndex } = legRanges[legIndex];
    return uids.flatMap((uid, i) => {
      const absoluteIndex = startIndex + i;
      const isRallyLastStage = absoluteIndex === stagePlan.length - 1;
      const stageConfig = stageByUid.get(uid);
      if (isRallyLastStage) return [uid];
      return isServiceAssigned(stageConfig) ? [uid, serviceSortableId(uid)] : [uid];
    });
  });

  function findContainerOfUid(uid) {
    return containers.findIndex((c) => c.includes(uid));
  }

  function findLegOfSequenceId(id) {
    return legSequences.findIndex((seq) => seq.includes(id));
  }

  function rebuildStagePlanFromContainers(newContainers) {
    return newContainers.flatMap((uids) => uids.map((uid) => stageByUid.get(uid)));
  }

  function handleDragStart(event) {
    const uid = event.active.id;
    const draggedServiceOf = stageUidFromServiceSortableId(uid);
    if (draggedServiceOf) {
      const stagePlanEntry = stageByUid.get(draggedServiceOf);
      setActiveDrag({ type: 'service', value: stagePlanEntry, uid });
      return;
    }
    const stagePlanEntry = stageByUid.get(uid);
    const catalogStage = stagePlanEntry?.stage_id ? stageByCatalogId.get(stagePlanEntry.stage_id) : null;
    const stageNumber = stagePlan.findIndex((s) => s._uid === uid) + 1;
    setActiveDrag({ type: 'stage', stage: catalogStage, value: stagePlanEntry, stageNumber, uid });
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  // rbr-rally-creator-web#96: tracks whether the pointer is currently over
  // one of the RemoveDropZones, purely so the DragOverlay's floating brick
  // can turn red while it's hovering the zone it would delete into if
  // dropped -- a live "about to remove this" preview, same idea as
  // .legDropActive/.dropTarget's existing over-state highlighting elsewhere
  // in this file. Reading `over` off DndContext's own onDragOver (rather
  // than each RemoveDropZone's individual useDroppable().isOver) keeps this
  // as a single piece of state regardless of how many remove zones exist
  // (one per leg), since only one can ever be "the" one being hovered at a
  // time anyway.
  function handleDragOver(event) {
    const overRemoveZone = event.over?.data.current?.type === 'remove-zone';
    setActiveDrag((prev) => {
      if (!prev || prev.overRemoveZone === overRemoveZone) return prev;
      return { ...prev, overRemoveZone };
    });
  }

  // Moving an already-assigned service block to a different stage: doesn't
  // reorder stagePlan itself -- stagePlan's stage order is untouched.
  // Instead, the service *fields* land on whichever stage ends up
  // immediately before the drop position, and the stage it was dragged away
  // from reverts to "No Service" -- matching the earlier decision that a
  // service block belongs to "the stage that follows it after drop", not a
  // free-floating item.
  function handleServiceDragEnd(sourceStageUid, draggedSequenceId, over) {
    let destLegIndex;
    let destSequence;
    let destIndexInSequence;

    if (over.data.current?.type === 'stage-brick' || over.data.current?.type === 'service-block') {
      const overId = over.id;
      destLegIndex = findLegOfSequenceId(overId);
      if (destLegIndex === -1) return;
      destSequence = legSequences[destLegIndex];
      destIndexInSequence = destSequence.indexOf(overId);
    } else if (over.data.current?.type === 'leg-container') {
      destLegIndex = over.data.current.legIndex;
      destSequence = legSequences[destLegIndex];
      destIndexInSequence = destSequence.length;
    } else {
      return;
    }

    // Simulate the drop: remove the dragged token from its current slot,
    // insert it at the target position, then read off whichever stage token
    // now sits immediately before it -- that's the new owner.
    const withoutSource = destSequence.filter((id) => id !== draggedSequenceId);
    const clampedIndex = Math.min(destIndexInSequence, withoutSource.length);
    const reordered = [...withoutSource.slice(0, clampedIndex), draggedSequenceId, ...withoutSource.slice(clampedIndex)];
    const droppedAt = reordered.indexOf(draggedSequenceId);
    const precedingId = droppedAt > 0 ? reordered[droppedAt - 1] : null;
    const targetStageUid = precedingId && !stageUidFromServiceSortableId(precedingId) ? precedingId : null;

    if (!targetStageUid || targetStageUid === sourceStageUid) return; // no real target, or dropped back in place

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

  function handleClearService(stageUid) {
    onStagePlanChange(
      stagePlan.map((s) =>
        s._uid === stageUid ? { ...s, service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' } : s
      )
    );
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const draggedServiceOf = stageUidFromServiceSortableId(active.id);
    if (draggedServiceOf) {
      handleServiceDragEnd(draggedServiceOf, active.id, over);
      return;
    }

    const sourceUid = active.id;
    const sourceLegIndex = findContainerOfUid(sourceUid);
    if (sourceLegIndex === -1) return;

    // rbr-rally-creator-web#96: dropping a stage brick on a RemoveDropZone
    // deletes it -- routed through the exact same handleDeleteStage the
    // per-brick delete cross uses (undo toast, stage_count decrement, all of
    // it), rather than duplicating that logic here. indexInLeg is derived
    // the same way the stage-brick/leg-container branches below derive
    // destination indices, just against the *source* leg since there's no
    // destination position for a delete.
    if (over.data.current?.type === 'remove-zone') {
      const indexInLeg = containers[sourceLegIndex].indexOf(sourceUid);
      const stageConfig = stageByUid.get(sourceUid);
      if (stageConfig) handleDeleteStage(sourceLegIndex, indexInLeg, stageConfig);
      return;
    }

    let destLegIndex;
    let destIndexInContainer;

    if (over.data.current?.type === 'stage-brick') {
      const overUid = over.id;
      if (overUid === sourceUid) return; // dropped on itself, no-op
      destLegIndex = findContainerOfUid(overUid);
      if (destLegIndex === -1) return;
      destIndexInContainer = containers[destLegIndex].indexOf(overUid);
    } else if (over.data.current?.type === 'service-block') {
      // Dropping a stage brick onto a service token: treat it the same as
      // dropping onto that token's owning stage brick, so a stage can still
      // be moved to "right after" a given position even if the pointer
      // lands on the service block instead of the stage.
      const overStageUid = stageUidFromServiceSortableId(over.id);
      destLegIndex = findContainerOfUid(overStageUid);
      if (destLegIndex === -1) return;
      destIndexInContainer = containers[destLegIndex].indexOf(overStageUid) + 1;
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

  function closeModal() {
    setModalState(null);
  }

  function handleModalSave(config) {
    if (!modalState) return;

    if (modalState.mode === 'edit') {
      onStagePlanChange(stagePlan.map((s) => (s._uid === modalState.uid ? config : s)));
    } else {
      // 'add': append as a brand-new brick at the end of the target leg's
      // slice of stagePlan, and grow that leg's stage_count by one to match
      // -- the road book has no fixed slot count to fill into (per
      // DESIGN_SPEC.md's additive "Lego bits" model), so a new brick always
      // means the plan (and its owning leg) get one longer.
      const { endIndex } = legRanges[modalState.legIndex];
      const nextStagePlan = [...stagePlan.slice(0, endIndex), config, ...stagePlan.slice(endIndex)];
      onStagePlanChange(nextStagePlan);
      onLegScheduleChange(
        legSchedule.map((l, li) => (li === modalState.legIndex ? { ...l, stage_count: (l.stage_count || 0) + 1 } : l))
      );
    }

    closeModal();
  }

  // rbr-rally-creator-web#80: opens ServiceConfigModal scoped to one stage
  // -- `uid` is implicit from whichever brick/block the user clicked, never
  // asked for via a picker inside the modal itself. isLastStage reuses the
  // exact same "is this the rally's true final stage" check StageConfigModal
  // already gets passed (see willBeLastStage above), so the disabled
  // business rule matches wherever this is opened from.
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

  // Same underlying state update StageConfigModal's save already makes
  // (write service_time/nummechanics/mechanicsSkill onto the target stage's
  // stagePlan entry) -- just triggered from this separate entry point
  // instead of the full stage-edit form.
  function handleServiceModalSave(serviceFields) {
    if (!serviceModalState) return;
    onStagePlanChange(
      stagePlan.map((s) => (s._uid === serviceModalState.uid ? { ...s, ...serviceFields } : s))
    );
    closeServiceModal();
  }

  // One render tree serves both the editable road book and the locked/
  // read-only one (DESIGN_SPEC.md's "Created / locked" state, shown once a
  // creation job is running or finished). These used to be two separately
  // hand-maintained copies -- a locked early return plus the full editable
  // tree -- which meant every visual change had to land twice and drift was
  // only ever one missed edit away. Now `locked` switches the interactive
  // affordances off in place instead:
  //
  //  - The dnd wiring (DndContext/SortableContext/LegDropContainer and the
  //    onDrag* handlers) stays mounted in locked mode, with its sensors
  //    swapped for NO_SENSORS -- no sensors means no drag can ever start,
  //    so all of it is inert while locked. Keeping it mounted (rather than
  //    conditionally wrapping) keeps the element tree's shape identical
  //    across the `locked` flip, which happens live mid-session the moment
  //    a job starts: if the wrappers came and went, React would unmount and
  //    remount every brick on the flip. None of these wrappers add visible
  //    DOM of their own (LegDropContainer renders the same .stagesList div
  //    the old locked tree wrote by hand), so the locked rendering comes
  //    out unchanged.
  //  - Everything that exists only to *edit* the plan -- the leg remove
  //    button/bubble, the schedule inputs (plain text renders in their
  //    place, per the spec's "render as plain text instead"), the
  //    add-stage/add-service/add-leg affordances, remove drop zones,
  //    DragOverlay, both modals, and the undo toast -- renders only when
  //    !locked.
  return (
    <DndContext
      sensors={locked ? NO_SENSORS : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.book}>
        {legRanges.map(({ startIndex, endIndex }, legIndex) => {
          const legStages = stagePlan.slice(startIndex, endIndex);
          const leg = legSchedule[legIndex];
          const legTotalKm = sumStagePlanKm(legStages, stageByCatalogId);

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>
                  Leg {legIndex + 1}{' '}
                  <span className={styles.legStageCount}>{legStages.length} stage{legStages.length === 1 ? '' : 's'}</span>{' '}
                  <span className={styles.legKmTotal}>{formatKm(legTotalKm)}</span>
                </h4>
                {locked ? (
                  /* Locked: the schedule renders as plain text rather than
                     disabled inputs, per DESIGN_SPEC.md's "Created / locked"
                     state ("render as plain text instead"), and the leg
                     remove control disappears entirely -- there's nothing
                     left to restructure once the job has run. */
                  <div className={styles.legInputsLocked}>
                    <span>Open: {leg.open_time || '—'}</span>
                    <span>Close: {leg.close_time || '—'}</span>
                    <span>Super Rally: {leg.super_rally}</span>
                  </div>
                ) : (
                  <>
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
                      {/* rbr-rally-creator-web#63: rallysimfans.hu itself
                          schedules on Europe/Stockholm time regardless of where
                          the browser viewing this app is -- a user outside
                          Sweden would otherwise have no reason to know that
                          "now" for these fields isn't their own wall clock (see
                          stockholmNow()/isLegOpenTimeTooSoon in rallyPlan.js).
                          Reuses the existing muted uppercase .legFieldLabel
                          convention rather than introducing a new label style. */}
                      <label className={styles.legFieldLabel}>
                        <span className={styles.legFieldLabelText}>Open</span>
                        <input
                          type="datetime-local"
                          className={styles.legTimeInputOpen}
                          placeholder="Open time"
                          value={leg.open_time}
                          onChange={(e) => onLegFieldChange(legIndex, 'open_time', e.target.value)}
                        />
                      </label>
                      <label className={styles.legFieldLabel}>
                        <span className={styles.legFieldLabelText}>Close</span>
                        <input
                          type="datetime-local"
                          className={styles.legTimeInputClose}
                          placeholder="Close time"
                          value={leg.close_time}
                          max={maxCloseTimeFor(leg.open_time)}
                          onChange={(e) => onLegFieldChange(legIndex, 'close_time', e.target.value)}
                        />
                      </label>
                      {/* rbr-rally-creator-web#61: options.superRally only ever
                          has two entries in practice ('disabled'/'150%'), so a
                          dropdown was overkill for a plain either/or choice --
                          a single button that flips to the other value on click
                          is the more direct control. Written generically against
                          options.superRally.length (cycling to the *next* entry,
                          wrapping around) rather than hardcoding the two known
                          literal strings, so this keeps working even if that
                          option list ever changes shape. rbr-rally-creator-web#94:
                          .superRallyActive (keyed off super_rally !== 'disabled',
                          not the exact '150%' string) marks the toggle as active,
                          so its state reads at a glance instead of only via the
                          button's text label. rbr-rally-creator-web#103: the
                          class pair now carries the full state design -- OFF
                          pulses on an outlined-blue base, ON is a solid blue
                          fill (see RoadBook.module.css). */}
                      <button
                        type="button"
                        className={[styles.superRallyToggle, leg.super_rally !== 'disabled' ? styles.superRallyActive : '']
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          const currentIndex = options.superRally.indexOf(leg.super_rally);
                          const nextIndex = (currentIndex + 1 + options.superRally.length) % options.superRally.length;
                          onLegFieldChange(legIndex, 'super_rally', options.superRally[nextIndex]);
                        }}
                      >
                        Super Rally: {leg.super_rally}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <SortableContext items={legSequences[legIndex]} strategy={horizontalListSortingStrategy}>
                <LegDropContainer legIndex={legIndex}>
                  {legStages.map((stageConfig, i) => {
                    const absoluteIndex = startIndex + i;
                    const catalogStage = stageConfig.stage_id ? stageByCatalogId.get(stageConfig.stage_id) : null;
                    // rbr-rally-creator-web#80: only the rally's true final
                    // stage overall gets no service block, matching the
                    // site's own isLastStage-driven disable behavior.
                    // rbr-rally-creator-web#97: among the other stages, a
                    // block only renders inline once it's actually assigned
                    // -- an unassigned stage shows nothing, since assignment
                    // now happens by dragging the leg's single +Add slot in,
                    // not via an always-present per-stage placeholder.
                    const isRallyLastStage = absoluteIndex === stagePlan.length - 1;
                    const showServiceBlock = !isRallyLastStage && isServiceAssigned(stageConfig);
                    return (
                      // Fragment, not a sortable wrapper itself -- StageBrick
                      // and ServiceBlock each carry their own useSortable id
                      // (stageConfig._uid, and serviceSortableId(uid)
                      // respectively), both listed in `legSequences[legIndex]`
                      // above, so dnd-kit sees them as two independent drag
                      // sources/drop targets rather than one paired unit.
                      <Fragment key={stageConfig._uid}>
                        <StageBrick
                          uid={stageConfig._uid}
                          stage={catalogStage}
                          value={stageConfig}
                          stageNumber={absoluteIndex + 1}
                          locked={locked}
                          onEdit={locked ? undefined : () => openEditModal(legIndex, stageConfig._uid)}
                          onDelete={locked ? undefined : () => handleDeleteStage(legIndex, i, stageConfig)}
                          hiddenStageNameEnabled={hiddenStageNameEnabled}
                        />
                        {/* rbr-rally-creator-web#80/#97 + locked: the same
                            block serves both modes -- locked just renders it
                            disabled with every affordance stripped (no
                            sortable id, no click-to-edit, no clear cross),
                            so a created rally's road book still reads the
                            full service rhythm at a glance while staying
                            read-only like everything else. */}
                        {showServiceBlock && (
                          <div className={styles.serviceBlockWrap}>
                            <ServiceBlock
                              serviceTime={stageConfig.service_time}
                              disabled={locked}
                              sortableId={locked ? null : serviceSortableId(stageConfig._uid)}
                              onClick={locked ? undefined : () => openServiceModal(stageConfig._uid)}
                              onClear={locked ? undefined : () => handleClearService(stageConfig._uid)}
                            />
                          </div>
                        )}
                      </Fragment>
                    );
                  })}

                  {/* Everything past the placed bricks is edit-mode-only
                      affordance -- a locked leg row simply ends after its
                      last brick/service block, matching the read-only
                      "Created / locked" rendering. */}
                  {!locked && (
                    <>
                      {/* rbr-rally-creator-web#97: the leg's one always-present
                          "+ Add service" slot, at the very end of the row --
                          clicking it opens ServiceConfigModal directly, scoped
                          to the leg's last stage that doesn't have one assigned
                          yet (lastUnassignedServiceStageUid). Omitted once every
                          assignable stage in the leg already has a service (or
                          there's no assignable stage at all) -- nothing left for
                          it to target. */}
                      {(() => {
                        const targetUid = lastUnassignedServiceStageUid(legIndex);
                        if (!targetUid) return null;
                        return (
                          <div className={styles.serviceBlockWrap}>
                            <ServiceBlock serviceTime="No Service" onClick={() => openServiceModal(targetUid)} />
                          </div>
                        );
                      })()}

                      <button
                        type="button"
                        className={[styles.addStageBrick, legStages.length === 0 ? styles.addStageBrickEmpty : '']
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => openAddModal(legIndex)}
                      >
                        + Add stage
                      </button>

                      {legStages.length === 0 && (
                        <p className={styles.emptyLegHint} aria-hidden="true">
                          Add your first stage &rarr;
                        </p>
                      )}

                      {/* rbr-rally-creator-web#96: only occupies space while a
                          stage brick is actually being dragged -- see
                          RemoveDropZone's own comment above for why. */}
                      {activeDrag?.type === 'stage' && <RemoveDropZone legIndex={legIndex} />}
                    </>
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
        {!locked && (
          <button
            type="button"
            className={styles.addLegButton}
            onClick={onAddLeg}
            disabled={legSchedule.length >= MAX_LEGS}
            title={legSchedule.length >= MAX_LEGS ? `Rallies can have at most ${MAX_LEGS} legs` : undefined}
          >

            + Add Leg
          </button>
        )}
      </div>

      {/* rbr-rally-creator-web#96: the dragged item's overlay is the real
          StageBrick/ServiceBlock itself (via the same `locked`-style plain
          rendering StageBrick already has for the read-only road book, and
          ServiceBlock's non-sortable mode when sortableId is omitted) --
          guarantees the floating preview matches the source block's shape
          and size exactly, rather than a bespoke box that has to be kept in
          sync by hand. */}
      {/* The overlay/modal/toast layer only exists while editing -- gated
          on !locked (not just on the state that opens each one) so that a
          modal or undo toast left open at the exact moment a creation job
          starts vanishes with the flip, exactly as it did when the locked
          path was a separate early-return tree without this layer. */}
      {!locked && (
        <DragOverlay>
          {activeDrag?.type === 'stage' && (
            <StageBrick
              uid={activeDrag.uid}
              stage={activeDrag.stage}
              value={activeDrag.value}
              stageNumber={activeDrag.stageNumber}
              locked
              hiddenStageNameEnabled={hiddenStageNameEnabled}
              dangerHighlight={activeDrag.overRemoveZone}
            />
          )}
          {activeDrag?.type === 'service' && (
            <div className={styles.serviceBlockWrap}>
              <ServiceBlock serviceTime={activeDrag.value?.service_time} />
            </div>
          )}
        </DragOverlay>
      )}

      {!locked && modalState && (
        <StageConfigModal
          mode={modalState.mode}
          initialValue={modalState.initialValue}
          stages={stages}
          options={options}
          isLastStage={modalState.willBeLastStage}
          stageNumber={modalState.stageNumber}
          hiddenStageNameEnabled={hiddenStageNameEnabled}
          onSave={handleModalSave}
          onCancel={closeModal}
        />
      )}

      {/* rbr-rally-creator-web#80: opened from a leg-row ServiceBlock click
          (openServiceModal above) -- entirely separate from modalState/
          StageConfigModal above. No stage picker inside it; `uid` (and thus
          which stagePlan entry gets written back to) is fixed at open time
          by whichever block was clicked. */}
      {!locked && serviceModalState && (
        <ServiceConfigModal
          value={stageByUid.get(serviceModalState.uid)}
          options={options}
          stageNumber={serviceModalState.stageNumber}
          isLastStage={serviceModalState.isLastStage}
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
    </DndContext>
  );
}
