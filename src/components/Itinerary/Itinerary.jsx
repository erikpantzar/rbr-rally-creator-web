import { Fragment, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  computeLegStageRanges,
  toDatetimeLocalValue,
  formatKm,
  parseStageKm,
  sumStagePlanKm,
  getServiceTier,
  isLegSynced,
  getSharedLegTimes,
  MAX_LEG_SPAN_DAYS,
} from '../../lib/rallyPlan.js';
import { StageBrick } from '../StageBrick/StageBrick.jsx';
import { ServiceBlock } from '../ServiceBlock/ServiceBlock.jsx';
import styles from './Itinerary.module.css';

const NO_SENSORS = [];

function maxCloseTimeFor(openTime) {
  if (!openTime) return undefined;
  const maxDate = new Date(openTime);
  maxDate.setDate(maxDate.getDate() + MAX_LEG_SPAN_DAYS);
  return toDatetimeLocalValue(maxDate);
}

function LegDropContainer({ legIndex, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `leg-container-${legIndex}`, data: { type: 'leg-container', legIndex } });
  return (
    <div ref={setNodeRef} className={[styles.stagesList, isOver ? styles.legDropActive : ''].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

// Compact mode's leg header doubles as the drop target for "append to the
// end of this leg" -- the equivalent of full mode's LegDropContainer, which
// wraps the whole stage list there instead. Same 'leg-container' droppable
// type/id shape as LegDropContainer so handleDragEnd's leg-container branch
// handles both without knowing which detail mode is rendering.
function CompactLegHeaderDroppable({ legIndex, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `leg-container-${legIndex}`, data: { type: 'leg-container', legIndex } });
  return (
    <div ref={setNodeRef} className={isOver ? styles.compactLegRowDropActive : undefined}>
      {children}
    </div>
  );
}

// Compact mode's drag source for both stage and service rows -- the sidebar
// otherwise renders plain nav buttons with no dnd-kit wiring at all, so
// nothing there was ever draggable. `sortableId` is the row's own uid for a
// stage, or the derived service:<uid> token for a service row (matching
// legSequences' encoding), and `sortableType` mirrors full mode's
// 'stage-brick'/'service-block' droppable types so handleDragEnd's existing
// branches resolve drops from either detail level identically.
function SortableCompactRow({ sortableId, sortableType, className, children, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { type: sortableType },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={[className, isDragging ? styles.compactRowDragging : ''].filter(Boolean).join(' ')}
      {...attributes}
      {...listeners}
      {...rest}
    >
      {children}
    </button>
  );
}

// rbr-rally-creator-web#143: two choices now that a leg has stages to lose --
// the pre-existing safe merge (onConfirmMove, kept as the visually primary
// action per the issue's UX call) and a new destructive delete
// (onConfirmDelete). The delete action sits below a divider in its own row
// rather than beside Move/Cancel, deliberately separated in both spatial
// position and color language (legRemoveBubbleDelete's danger styling vs.
// legRemoveBubbleConfirm's primary/accent one below) so a reflexive click
// can't land on "permanently delete" by muscle memory from the old
// single-button layout.
function LegRemoveConfirmBubble({ legIndex, stageCount, targetLegIndex, onConfirmMove, onConfirmDelete, onCancel }) {
  return (
    <div className={styles.legRemoveBubble} role="dialog" aria-label={`Remove Leg ${legIndex + 1}?`}>
      <p className={styles.legRemoveBubbleText}>
        Leg {legIndex + 1} has {stageCount} stage{stageCount === 1 ? '' : 's'}. Move{' '}
        {stageCount === 1 ? 'it' : 'them'} into Leg {targetLegIndex + 1}, or delete{' '}
        {stageCount === 1 ? 'it' : 'them'} along with the leg.
      </p>
      <div className={styles.legRemoveBubbleActions}>
        <button type="button" className={styles.legRemoveBubbleCancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.legRemoveBubbleConfirm} onClick={onConfirmMove}>
          Move stages &amp; remove
        </button>
      </div>
      <div className={styles.legRemoveBubbleDangerZone}>
        <button type="button" className={styles.legRemoveBubbleDelete} onClick={onConfirmDelete}>
          Delete leg &amp; {stageCount} stage{stageCount === 1 ? '' : 's'} permanently
        </button>
      </div>
    </div>
  );
}

// Single vertical, full-width list of leg/stage/service blocks -- the one
// itinerary view shared by the main road book (detail="full") and
// PickerWorkspace's sidebar (detail="compact"). Both are projections of the
// same committed stagePlan/legSchedule; `detail` only ever changes how much
// of each row renders, never the row order or the underlying drag/selection
// model, so the two views can never visually disagree about what the rally
// actually contains.
//
//   detail="full"    -- the editable road book: one shared open/close
//                        control above the leg list drives every leg still
//                        following the default (rbr-rally-creator-web#127);
//                        each leg header carries a hover/focus-revealed
//                        actions row -- add stage, add service, remove leg
//                        (rbr-rally-creator-web#144) -- and, only once it's
//                        broken sync, its own independent open/close
//                        inputs. Super Rally is a single rally-wide control
//                        in RallyBasicsForm (rbr-rally-creator-web#123),
//                        not per leg. Stages render as StageBrick with
//                        edit/delete, assigned services render as
//                        ServiceBlock with click/clear. The standalone "+
//                        Add stage" brick and unassigned-service
//                        placeholder only ever appear in the last leg now
//                        (#144) -- every other leg's header actions row is
//                        the sole path to either, so it must stay reachable
//                        by hover, focus, and touch alike. Drag reorders
//                        stages (within/across legs) and drags a service
//                        block to reassign it to a different stage;
//                        deleting a stage is a click on its StageBrick's
//                        delete cross, never a drag gesture
//                        (rbr-rally-creator-web#121 removed the old
//                        drag-to-remove zone -- too easy to hit by accident
//                        while reordering).
//   detail="compact"  -- PickerWorkspace's sidebar: rows are plain nav
//                        buttons (onSelect only), leg header is just a
//                        name/count/km summary + "+ Add stage". Drag still
//                        reorders stages; there is nothing to delete here,
//                        so no remove zones/undo exist in this mode.
export function Itinerary({
  detail = 'full',
  stages,
  stagePlan,
  legSchedule,
  hiddenStageNameEnabled = false,
  locked = false,
  selection = null,
  onSelectStage,
  onSelectService,
  onSelectLeg,
  onLegFieldChange,
  onSharedLegFieldChange,
  onSetLegSynced,
  onRemoveLeg,
  onAddStage,
  onEditStage,
  onDeleteStage,
  onOpenService,
  onClearService,
  onAddLeg,
  onReorderStage,
  onReassignService,
  removeConfirm,
  onConfirmRemoveLeg,
  onConfirmRemoveLegWithStages,
  onCancelRemoveLeg,
  rallyTotal = false,
  addLegDisabled = false,
  addLegDisabledReason,
  highlightUid = null,
  onHighlightAnimationEnd,
}) {
  const [activeDrag, setActiveDrag] = useState(null);

  const isFull = detail === 'full';
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const stageByUid = useMemo(() => new Map(stagePlan.map((s) => [s._uid, s])), [stagePlan]);

  // rbr-rally-creator-web#127: rule 1 of the agreed behavior -- a single
  // shared open/close control above the leg list, not one per leg.
  // hasSyncedLeg guards against every leg having broken sync (an unusual
  // but valid state): with nothing left to fan an edit out to, the control
  // is disabled rather than accepting typing that would silently go nowhere.
  const sharedLegTimes = getSharedLegTimes(legSchedule);
  const hasSyncedLeg = legSchedule.some(isLegSynced);

  const legRanges = computeLegStageRanges(legSchedule);
  const containers = legRanges.map(({ startIndex, endIndex }) => stagePlan.slice(startIndex, endIndex).map((s) => s._uid));

  const rallyTotalKm = sumStagePlanKm(stagePlan, stageByCatalogId);

  const SERVICE_ID_PREFIX = 'service:';
  const serviceSortableId = (stageUid) => `${SERVICE_ID_PREFIX}${stageUid}`;
  const stageUidFromServiceSortableId = (id) =>
    typeof id === 'string' && id.startsWith(SERVICE_ID_PREFIX) ? id.slice(SERVICE_ID_PREFIX.length) : null;

  function isServiceAssigned(stageConfig) {
    return getServiceTier(stageConfig.service_time).key !== 'none';
  }

  function lastUnassignedServiceStageUid(legIndex) {
    const { startIndex, endIndex } = legRanges[legIndex];
    for (let absoluteIndex = endIndex - 1; absoluteIndex >= startIndex; absoluteIndex--) {
      if (absoluteIndex === stagePlan.length - 1) continue;
      const stageConfig = stagePlan[absoluteIndex];
      if (!isServiceAssigned(stageConfig)) return stageConfig._uid;
    }
    return null;
  }

  // Per-leg flat sequence dnd-kit sorts: each stage uid, followed by its
  // service token if (and only if) it currently has one assigned.
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

    const withoutSource = destSequence.filter((id) => id !== draggedSequenceId);
    const clampedIndex = Math.min(destIndexInSequence, withoutSource.length);
    const reordered = [...withoutSource.slice(0, clampedIndex), draggedSequenceId, ...withoutSource.slice(clampedIndex)];
    const droppedAt = reordered.indexOf(draggedSequenceId);
    const precedingId = droppedAt > 0 ? reordered[droppedAt - 1] : null;
    const targetStageUid = precedingId && !stageUidFromServiceSortableId(precedingId) ? precedingId : null;

    if (!targetStageUid || targetStageUid === sourceStageUid) return;

    onReassignService(sourceStageUid, targetStageUid);
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

    let destLegIndex;
    let destIndexInContainer;

    if (over.data.current?.type === 'stage-brick') {
      const overUid = over.id;
      if (overUid === sourceUid) return;
      destLegIndex = findContainerOfUid(overUid);
      if (destLegIndex === -1) return;
      destIndexInContainer = containers[destLegIndex].indexOf(overUid);
    } else if (over.data.current?.type === 'service-block') {
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

    onReorderStage(sourceUid, destLegIndex, destIndexInContainer);
  }

  function stageDisplayName(entry) {
    const catalogStage = entry.stage_id ? stageByCatalogId.get(entry.stage_id) : null;
    return entry._label || catalogStage?.name || 'Unassigned stage';
  }

  function stageKmText(entry) {
    const catalogStage = entry.stage_id ? stageByCatalogId.get(entry.stage_id) : null;
    return catalogStage ? formatKm(parseStageKm(catalogStage)) : null;
  }

  function isStageSelected(uid) {
    return selection?.type === 'stage' && selection.uid === uid;
  }

  function isServiceSelected(uid) {
    return selection?.type === 'service' && selection.uid === uid;
  }

  function isLegSelected(legIndex) {
    return selection?.type === 'leg' && selection.legIndex === legIndex;
  }

  function renderCompactLegHeader(legIndex, legStages, legTotalKm) {
    const stageCount = legStages.length;
    return (
      <CompactLegHeaderDroppable legIndex={legIndex}>
        <div
          className={[styles.compactLegRow, isLegSelected(legIndex) ? styles.rowSelected : ''].filter(Boolean).join(' ')}
        >
          <button
            type="button"
            className={styles.compactLegRowMain}
            aria-current={isLegSelected(legIndex) || undefined}
            onClick={() => onSelectLeg(legIndex)}
          >
            <span className={styles.compactLegRowName}>Leg {legIndex + 1}</span>
            <span className={styles.compactLegRowMeta}>
              {stageCount} stage{stageCount === 1 ? '' : 's'}
            </span>
            <span className={styles.compactLegRowMeta}>{formatKm(legTotalKm)}</span>
          </button>
          <button type="button" className={styles.compactLegRowAddStage} onClick={() => onSelectLeg(legIndex)}>
            + Add stage
          </button>
        </div>
      </CompactLegHeaderDroppable>
    );
  }

  // rbr-rally-creator-web#144: the leg's per-row actions (add stage/add
  // service/remove leg) -- revealed on hover/focus of the header rather
  // than sitting permanently in the stage list (that's now reserved for
  // the rally-end affordances in the main map below). Pinned open
  // (legActionsRowPinned) whenever hiding it would strand the user: the
  // remove-confirm bubble is mid-conversation, or the leg is empty and this
  // row is its only way to gain a stage.
  function renderFullLegHeader(legIndex, legStages, legTotalKm, leg) {
    const synced = isLegSynced(leg);
    const removeConfirmOpenForThisLeg = removeConfirm?.legIndex === legIndex;
    // rbr-rally-creator-web#144: same target resolution as the rally-end
    // "No Service" placeholder below (lastUnassignedServiceStageUid) --
    // null means every stage in this leg already has a service, or is the
    // rally's true final stage (which normalizeLastStageService forbids a
    // service on), so the button disables rather than opening a modal that
    // has nothing valid to attach to.
    const addServiceTargetUid = lastUnassignedServiceStageUid(legIndex);
    return (
      <div className={styles.legHeader}>
        <h4>
          Leg {legIndex + 1}{' '}
          <span className={styles.legStageCount}>
            {legStages.length} stage{legStages.length === 1 ? '' : 's'}
          </span>{' '}
          <span className={styles.legKmTotal}>{formatKm(legTotalKm)}</span>
        </h4>
        {locked ? (
          <div className={styles.legInputsLocked}>
            <span>Open: {leg.open_time || '—'}</span>
            <span>Close: {leg.close_time || '—'}</span>
            {!synced && <span className={styles.legSyncBadge}>Custom times</span>}
          </div>
        ) : (
          <>
            <div
              className={[
                styles.legActionsRow,
                removeConfirmOpenForThisLeg || legStages.length === 0 ? styles.legActionsRowPinned : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button type="button" className={styles.legActionButton} onClick={() => onAddStage(legIndex)}>
                + Stage
              </button>
              <button
                type="button"
                className={styles.legActionButton}
                disabled={!addServiceTargetUid}
                title={addServiceTargetUid ? `Add service to Leg ${legIndex + 1}` : 'No stage in this leg can take a service'}
                onClick={() => onOpenService(addServiceTargetUid)}
              >
                + Service
              </button>
              <div className={styles.legRemoveWrap}>
                <button
                  type="button"
                  className={styles.legRemoveButton}
                  disabled={legSchedule.length <= 1}
                  aria-label={legSchedule.length <= 1 ? `Can't remove Leg ${legIndex + 1} -- it's the only leg` : `Remove Leg ${legIndex + 1}`}
                  title={legSchedule.length <= 1 ? "Can't remove the only leg" : `Remove Leg ${legIndex + 1}`}
                  onClick={() => onRemoveLeg(legIndex)}
                >
                  ×
                </button>
                {removeConfirmOpenForThisLeg && (
                  <LegRemoveConfirmBubble
                    legIndex={removeConfirm.legIndex}
                    stageCount={removeConfirm.stageCount}
                    targetLegIndex={removeConfirm.targetLegIndex}
                    onConfirmMove={onConfirmRemoveLeg}
                    onConfirmDelete={onConfirmRemoveLegWithStages}
                    onCancel={onCancelRemoveLeg}
                  />
                )}
              </div>
            </div>
            <div className={styles.legInputs}>
              {synced ? (
                <>
                  <span className={styles.legSyncedTimes}>
                    Open {leg.open_time || '—'} &middot; Close {leg.close_time || '—'}
                  </span>
                  <button
                    type="button"
                    className={styles.legSyncToggle}
                    onClick={() => onSetLegSynced(legIndex, false)}
                  >
                    Set different times for this leg
                  </button>
                </>
              ) : (
                <>
                  <label className={styles.legFieldLabel}>
                    <span>Open</span>
                    <input
                      type="datetime-local"
                      placeholder="Open time"
                      value={leg.open_time}
                      onChange={(e) => onLegFieldChange(legIndex, 'open_time', e.target.value)}
                    />
                  </label>
                  <label className={styles.legFieldLabel}>
                    <span>Close</span>
                    <input
                      type="datetime-local"
                      placeholder="Close time"
                      value={leg.close_time}
                      max={maxCloseTimeFor(leg.open_time)}
                      onChange={(e) => onLegFieldChange(legIndex, 'close_time', e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.legSyncToggle}
                    onClick={() => onSetLegSynced(legIndex, true)}
                  >
                    Use shared times
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderCompactStageRow(stageConfig, absoluteIndex) {
    const km = stageKmText(stageConfig);
    const justAdded = stageConfig._uid === highlightUid;
    return (
      <SortableCompactRow
        key={stageConfig._uid}
        sortableId={stageConfig._uid}
        sortableType="stage-brick"
        className={[
          styles.compactStageRow,
          isStageSelected(stageConfig._uid) ? styles.rowSelected : '',
          justAdded ? styles.compactStageRowAdded : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-current={isStageSelected(stageConfig._uid) || undefined}
        onClick={() => onSelectStage(stageConfig._uid)}
        onAnimationEnd={justAdded ? onHighlightAnimationEnd : undefined}
      >
        <span className={styles.compactStageRowNumber}>{absoluteIndex + 1}</span>
        <span className={styles.compactStageRowName}>{stageDisplayName(stageConfig)}</span>
        {km && <span className={styles.compactStageRowKm}>{km}</span>}
      </SortableCompactRow>
    );
  }

  function renderCompactServiceRow(stageConfig) {
    return (
      <SortableCompactRow
        key={`service:${stageConfig._uid}`}
        sortableId={serviceSortableId(stageConfig._uid)}
        sortableType="service-block"
        className={[styles.compactServiceRow, isServiceSelected(stageConfig._uid) ? styles.rowSelected : '']
          .filter(Boolean)
          .join(' ')}
        aria-current={isServiceSelected(stageConfig._uid) || undefined}
        onClick={() => onSelectService(stageConfig._uid)}
      >
        <span className={styles.compactServiceRowLabel}>Service</span>
        <span className={styles.compactServiceRowTime}>{stageConfig.service_time}</span>
      </SortableCompactRow>
    );
  }

  return (
    <DndContext
      sensors={locked ? NO_SENSORS : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={isFull ? styles.book : styles.compactBook}>
        {isFull && !locked && (
          <div className={styles.sharedSchedule}>
            <span className={styles.sharedScheduleLabel}>All legs open/close</span>
            <div className={styles.legInputs}>
              <label className={styles.legFieldLabel}>
                <span>Open</span>
                <input
                  type="datetime-local"
                  placeholder="Open time"
                  value={sharedLegTimes.open_time}
                  disabled={!hasSyncedLeg}
                  onChange={(e) => onSharedLegFieldChange('open_time', e.target.value)}
                />
              </label>
              <label className={styles.legFieldLabel}>
                <span>Close</span>
                <input
                  type="datetime-local"
                  placeholder="Close time"
                  value={sharedLegTimes.close_time}
                  max={maxCloseTimeFor(sharedLegTimes.open_time)}
                  disabled={!hasSyncedLeg}
                  onChange={(e) => onSharedLegFieldChange('close_time', e.target.value)}
                />
              </label>
            </div>
            {!hasSyncedLeg && (
              <p className={styles.sharedScheduleHint}>
                Every leg has its own times -- nothing is following this right now.
              </p>
            )}
          </div>
        )}

        {legRanges.map(({ startIndex, endIndex }, legIndex) => {
          const legStages = stagePlan.slice(startIndex, endIndex);
          const leg = legSchedule[legIndex];
          const legTotalKm = sumStagePlanKm(legStages, stageByCatalogId);
          // rbr-rally-creator-web#144: the standalone "+ Add stage" brick and
          // "No Service" placeholder now live only at the natural end of the
          // rally (the last leg) -- every other leg's only path to either is
          // the header's hover actions row (renderFullLegHeader above).
          const isLastLeg = legIndex === legRanges.length - 1;

          return (
            <div key={legIndex} className={isFull ? styles.legGroup : styles.compactLegGroup}>
              {isFull
                ? renderFullLegHeader(legIndex, legStages, legTotalKm, leg)
                : renderCompactLegHeader(legIndex, legStages, legTotalKm)}

              <SortableContext items={legSequences[legIndex]} strategy={verticalListSortingStrategy}>
                {isFull ? (
                  <LegDropContainer legIndex={legIndex}>
                    {legStages.map((stageConfig, i) => {
                      const absoluteIndex = startIndex + i;
                      const catalogStage = stageConfig.stage_id ? stageByCatalogId.get(stageConfig.stage_id) : null;
                      const isRallyLastStage = absoluteIndex === stagePlan.length - 1;
                      const showServiceBlock = !isRallyLastStage && isServiceAssigned(stageConfig);
                      return (
                        <Fragment key={stageConfig._uid}>
                          <StageBrick
                            uid={stageConfig._uid}
                            stage={catalogStage}
                            value={stageConfig}
                            stageNumber={absoluteIndex + 1}
                            locked={locked}
                            onEdit={locked ? undefined : () => onEditStage(legIndex, stageConfig._uid)}
                            onDelete={locked ? undefined : () => onDeleteStage(legIndex, i, stageConfig)}
                            hiddenStageNameEnabled={hiddenStageNameEnabled}
                            fullWidth
                          />
                          {showServiceBlock && (
                            <div className={styles.serviceBlockWrap}>
                              <ServiceBlock
                                serviceTime={stageConfig.service_time}
                                disabled={locked}
                                sortableId={locked ? null : serviceSortableId(stageConfig._uid)}
                                onClick={locked ? undefined : () => onOpenService(stageConfig._uid)}
                                onClear={locked ? undefined : () => onClearService(stageConfig._uid)}
                                fullWidth
                              />
                            </div>
                          )}
                        </Fragment>
                      );
                    })}

                    {!locked && (
                      <>
                        {isLastLeg &&
                          (() => {
                            const targetUid = lastUnassignedServiceStageUid(legIndex);
                            if (!targetUid) return null;
                            return (
                              <div className={styles.serviceBlockWrap}>
                                <ServiceBlock serviceTime="No Service" onClick={() => onOpenService(targetUid)} fullWidth />
                              </div>
                            );
                          })()}

                        {isLastLeg && (
                          <button
                            type="button"
                            className={[styles.addStageBrick, legStages.length === 0 ? styles.addStageBrickEmpty : '']
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => onAddStage(legIndex)}
                          >
                            + Add stage
                          </button>
                        )}

                        {legStages.length === 0 &&
                          (isLastLeg ? (
                            <p className={styles.emptyLegHint} aria-hidden="true">
                              Add your first stage &rarr;
                            </p>
                          ) : (
                            <p className={styles.emptyLegHint} aria-hidden="true">
                              Hover Leg {legIndex + 1}&apos;s header above to add a stage &uarr;
                            </p>
                          ))}
                      </>
                    )}
                  </LegDropContainer>
                ) : (
                  <>
                    {legStages.map((stageConfig, i) => {
                      const absoluteIndex = startIndex + i;
                      const isRallyLastStage = absoluteIndex === stagePlan.length - 1;
                      const showServiceRow = !isRallyLastStage && isServiceAssigned(stageConfig);
                      return (
                        <Fragment key={stageConfig._uid}>
                          {renderCompactStageRow(stageConfig, absoluteIndex)}
                          {showServiceRow && renderCompactServiceRow(stageConfig)}
                        </Fragment>
                      );
                    })}
                    {legStages.length === 0 && <p className={styles.compactEmptyLegHint}>No stages yet</p>}
                  </>
                )}
              </SortableContext>
            </div>
          );
        })}

        {isFull && rallyTotal && (
          <div className={styles.rallyTotal}>
            <span className={styles.rallyTotalLabel}>Rally total</span>
            <span className={styles.rallyTotalValue}>{formatKm(rallyTotalKm)}</span>
          </div>
        )}

        {!locked && (
          <button
            type="button"
            className={isFull ? styles.addLegButton : styles.compactAddLeg}
            onClick={onAddLeg}
            disabled={addLegDisabled}
            title={addLegDisabled ? addLegDisabledReason : undefined}
          >
            + Add leg
          </button>
        )}
      </div>

      {isFull && !locked && (
        <DragOverlay>
          {activeDrag?.type === 'stage' && (
            <StageBrick
              uid={activeDrag.uid}
              stage={activeDrag.stage}
              value={activeDrag.value}
              stageNumber={activeDrag.stageNumber}
              locked
              hiddenStageNameEnabled={hiddenStageNameEnabled}
            />
          )}
          {activeDrag?.type === 'service' && (
            <div className={styles.serviceBlockWrap}>
              <ServiceBlock serviceTime={activeDrag.value?.service_time} />
            </div>
          )}
        </DragOverlay>
      )}
    </DndContext>
  );
}
