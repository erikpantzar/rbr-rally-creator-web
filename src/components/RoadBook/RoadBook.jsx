import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import {
  computeLegStageRanges,
  createStageConfigFromPrevious,
  cloneStageConfigWithNewUid,
  toDatetimeLocalValue,
  MAX_LEG_SPAN_DAYS,
} from '../../lib/rallyPlan.js';
import { StageBrick } from '../StageBrick/StageBrick.jsx';
import { StageConfigModal } from '../StageConfigModal/StageConfigModal.jsx';
import { Toast } from '../Toast/Toast.jsx';
import styles from './RoadBook.module.css';

// How long the "Undo" toast stays up after a brick delete, per
// DESIGN_SPEC.md's UX review note on undo. One pending delete at a time --
// starting a new one (via a fresh delete) simply replaces whatever was
// pending, no queue/stack.
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
  // Single in-flight undo slot: { config, legIndex, indexInLeg }. config is
  // the deleted stage's full plan entry (including its original _uid) so
  // undo can splice it back into stagePlan exactly where it was, and bump
  // that leg's stage_count back up -- the same cross-leg math handleDragEnd
  // already does for drag moves, just adding one instead of moving one.
  const [pendingUndo, setPendingUndo] = useState(null);
  const undoTimerRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

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

    setPendingUndo({ config: stageConfig, legIndex, indexInLeg });
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setPendingUndo(null);
    }, UNDO_TIMEOUT_MS);
  }

  function handleUndoDelete() {
    if (!pendingUndo) return;
    const { config, legIndex, indexInLeg } = pendingUndo;

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

    clearPendingUndo();
  }

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const stageByUid = useMemo(() => new Map(stagePlan.map((s) => [s._uid, s])), [stagePlan]);

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
    });
  }

  function openEditModal(legIndex, uid) {
    setModalState({
      mode: 'edit',
      legIndex,
      uid,
      initialValue: stageByUid.get(uid),
      willBeLastStage: uid === stagePlan[stagePlan.length - 1]?._uid,
    });
  }

  function openDuplicateModal(legIndex, uid) {
    setModalState({
      mode: 'duplicate',
      legIndex,
      uid: null,
      initialValue: cloneStageConfigWithNewUid(stageByUid.get(uid)),
      willBeLastStage: isLastLegPosition(legIndex),
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

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>
                  Leg {legIndex + 1} <span className={styles.legStartStage}>(starts at stage {startStageNo})</span>{' '}
                  <span className={styles.legStageCount}>{legStages.length} stage{legStages.length === 1 ? '' : 's'}</span>
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

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>
                  Leg {legIndex + 1} <span className={styles.legStartStage}>(starts at stage {startStageNo})</span>{' '}
                  <span className={styles.legStageCount}>{legStages.length} stage{legStages.length === 1 ? '' : 's'}</span>
                </h4>
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

        {/* Legs are additive too, per rbr-rally-creator-web#15's "Lego
            bits" model -- appended one at a time here rather than pre-sized
            by a rallyBasics.legs number input (RallyBasicsForm's "Legs"
            field is now just a read-only display of legSchedule.length).
            A new leg starts empty (0 stages); RallyBuilder's
            readinessProblems flags it as not publishable until it has at
            least one. There's no "remove leg" control yet -- deliberately
            left as a follow-up, since removing a leg with stages already in
            it would orphan/need to reassign that stage data, and the only
            leg that's ever risk-free to remove (an empty trailing one) is a
            narrower case than a general remove button would imply. */}
        <button type="button" className={styles.addLegButton} onClick={onAddLeg}>
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
          onSave={handleModalSave}
          onCancel={closeModal}
        />
      )}

      {pendingUndo && (
        <Toast message="Stage removed" actionLabel="Undo" onAction={handleUndoDelete} onDismiss={clearPendingUndo} />
      )}
    </DndContext>
  );
}
