import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { computeLegStageRanges } from '../../lib/rallyPlan.js';
import { StageSlot } from '../StageSlot/StageSlot.jsx';
import { StageCatalogPanel } from '../StageCatalogPanel/StageCatalogPanel.jsx';
import styles from './RoadBook.module.css';

// Droppable wrapper around a leg's stage list. Individual StageSlots are
// themselves sortable/droppable (dnd-kit's useSortable), which handles
// "drop onto this specific stage" -- this container-level droppable is the
// fallback target for "drop into this leg" when there's no specific card
// under the pointer (an empty leg, or the gap past the last card), so a
// stage can still be dragged into a leg that currently has zero stages.
function LegDropContainer({ legIndex, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `leg-container-${legIndex}`, data: { type: 'leg-container', legIndex } });
  return (
    <div ref={setNodeRef} className={[styles.stagesList, isOver ? styles.legDropActive : ''].join(' ')}>
      {children}
      {isOver && <div className={styles.legDropHint}>Drop to place in this leg</div>}
    </div>
  );
}

// Owns the DndContext for the road book: dragging a catalog card into a
// slot, reordering within a leg, and dragging a stage across a leg
// boundary (which live-recomputes leg stage_count / start_stage_no). Still
// "simple in, simple out" -- stagePlan/legSchedule/stages/options come in
// as props, all mutations go back out via onStagePlanChange/
// onLegScheduleChange callbacks; RallyBuilder remains the only place that
// owns the actual state and talks to the API.
export function RoadBook({
  stages,
  options,
  stagePlan,
  legSchedule,
  onStagePlanChange,
  onLegScheduleChange,
  onLegFieldChange,
}) {
  const [activeDrag, setActiveDrag] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const stageByUid = useMemo(() => new Map(stagePlan.map((s) => [s._uid, s])), [stagePlan]);

  const legRanges = computeLegStageRanges(legSchedule);
  const containers = legRanges.map(({ startIndex, endIndex }) =>
    stagePlan.slice(startIndex, endIndex).map((s) => s._uid)
  );

  function findContainerOfUid(uid) {
    return containers.findIndex((c) => c.includes(uid));
  }

  function rebuildStagePlanFromContainers(newContainers) {
    return newContainers.flatMap((uids) => uids.map((uid) => stageByUid.get(uid)));
  }

  function handleDragStart(event) {
    const { active } = event;
    if (active.data.current?.type === 'catalog-stage') {
      setActiveDrag({ type: 'catalog-stage', stage: active.data.current.stage });
    } else {
      const uid = active.id;
      const stagePlanEntry = stageByUid.get(uid);
      const catalogStage = stagePlanEntry?.stage_id ? stageByCatalogId.get(stagePlanEntry.stage_id) : null;
      setActiveDrag({ type: 'stage-slot', stage: catalogStage, uid });
    }
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDrag(null);

    if (!over) {
      if (active.data.current?.type === 'catalog-stage') {
        setFeedback('Drop the stage card onto a road-book slot to assign it.');
      }
      return;
    }

    // Case 1: a catalog card was dropped -- it replaces whichever slot it
    // landed on (keeping that slot's other config as-is). It never creates
    // a new slot: the road book always has exactly rallyBasics.stages
    // fixed positions.
    if (active.data.current?.type === 'catalog-stage') {
      const targetUid = over.data.current?.type === 'stage-slot' ? over.id : null;
      if (!targetUid) {
        setFeedback('Drop the stage card directly onto a stage slot, not the leg background.');
        return;
      }
      const targetEntry = stageByUid.get(targetUid);
      if (!targetEntry) return;

      const nextStagePlan = stagePlan.map((s) =>
        s._uid === targetUid ? { ...s, stage_id: active.data.current.stage.id } : s
      );
      onStagePlanChange(nextStagePlan);
      return;
    }

    // Case 2: an existing stage slot was dragged -- reorder within a leg,
    // or move across a leg boundary.
    const sourceUid = active.id;
    const sourceLegIndex = findContainerOfUid(sourceUid);
    if (sourceLegIndex === -1) return;

    let destLegIndex;
    let destIndexInContainer;

    if (over.data.current?.type === 'stage-slot') {
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
      newContainers[sourceLegIndex] = arrayMove(
        newContainers[sourceLegIndex],
        sourceIndexInContainer,
        destIndexInContainer
      );
      onStagePlanChange(rebuildStagePlanFromContainers(newContainers));
      return;
    }

    // Cross-leg move: pull the stage out of its source leg and splice it
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.layout}>
        <div className={styles.book}>
          {feedback && <p className={styles.feedback}>{feedback}</p>}

          {legRanges.map(({ startIndex, endIndex, startStageNo }, legIndex) => {
            const legStages = stagePlan.slice(startIndex, endIndex);
            const leg = legSchedule[legIndex];

            return (
              <div key={legIndex} className={styles.legGroup}>
                <div className={styles.legHeader}>
                  <h4>
                    Leg {legIndex + 1}{' '}
                    <span className={styles.legStartStage}>(starts at stage {startStageNo})</span>
                  </h4>
                  <div className={styles.legInputs}>
                    <label className={styles.legFieldLabel}>
                      Stages in this leg
                      <input
                        type="number"
                        min="0"
                        max={stagePlan.length}
                        value={leg.stage_count}
                        onChange={(e) =>
                          onLegFieldChange(legIndex, 'stage_count', parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </label>
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
                      onChange={(e) => onLegFieldChange(legIndex, 'close_time', e.target.value)}
                    />
                    <select
                      value={leg.super_rally}
                      onChange={(e) => onLegFieldChange(legIndex, 'super_rally', e.target.value)}
                    >
                      {options.superRally.map((opt) => (
                        <option key={opt} value={opt}>
                          Super Rally: {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <SortableContext items={containers[legIndex]} strategy={verticalListSortingStrategy}>
                  <LegDropContainer legIndex={legIndex}>
                    {legStages.length === 0 && (
                      <p className={styles.emptyLeg}>No stages in this leg -- drag one in.</p>
                    )}
                    {legStages.map((stageConfig, i) => {
                      const absoluteIndex = startIndex + i;
                      const catalogStage = stageConfig.stage_id
                        ? stageByCatalogId.get(stageConfig.stage_id)
                        : null;
                      return (
                        <StageSlot
                          key={stageConfig._uid}
                          uid={stageConfig._uid}
                          stage={catalogStage}
                          value={stageConfig}
                          options={options}
                          stageNumber={absoluteIndex + 1}
                          isLastStage={absoluteIndex === stagePlan.length - 1}
                          onChange={(updated) => {
                            const nextPlan = [...stagePlan];
                            nextPlan[absoluteIndex] = updated;
                            onStagePlanChange(nextPlan);
                          }}
                        />
                      );
                    })}
                  </LegDropContainer>
                </SortableContext>
              </div>
            );
          })}
        </div>

        <StageCatalogPanel stages={stages} />
      </div>

      <DragOverlay>
        {activeDrag?.stage ? (
          <div className={styles.dragPreview}>
            <p className={styles.dragPreviewName}>{activeDrag.stage.name}</p>
            <p className={styles.dragPreviewMeta}>
              {activeDrag.stage.country} &middot; {activeDrag.stage.surface} &middot; {activeDrag.stage.length}
            </p>
          </div>
        ) : activeDrag ? (
          <div className={styles.dragPreview}>
            <p className={styles.dragPreviewName}>Empty slot</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
