import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatKm, parseStageKm } from '../../lib/rallyPlan.js';
import styles from './StageBrick.module.css';

// First-letter-of-surface badge -- a placeholder glyph, not a real icon
// system (DESIGN_SPEC.md flags "icon set for surface/weather/tyre" as an
// open item deferred past this pass). Gravel/Tarmac/Snow are the surfaces
// the catalog actually uses; anything else falls back to its own first
// letter so an unrecognised surface still renders *something* recognisable
// rather than crashing or rendering blank.
const SURFACE_GLYPHS = {
  gravel: 'G',
  tarmac: 'T',
  snow: 'S',
};

function surfaceGlyph(surface) {
  if (!surface) return '?';
  return SURFACE_GLYPHS[surface.toLowerCase()] ?? surface[0].toUpperCase();
}

// rbr-rally-creator-web#64 ("Minimal" option): once hidden_stage_name is on,
// the brick's name line shows the cover name instead of the real catalog
// name -- this is where a user scanning their road book would actually
// notice the surprise-preserving behavior, rather than only inside a modal
// they might not reopen. `locked` bricks have no click-to-edit affordance,
// so their empty-state fallback drops the "click to name" instruction that
// would otherwise be misleading.
function getDisplayStageName(hiddenStageName, stage, customName, locked) {
  if (!hiddenStageName) return stage?.name ?? 'Unknown stage';
  if (customName) return customName;
  return locked ? 'Untitled stage' : 'Untitled stage — click to name';
}

// One placed stage, rendered collapsed/summary-only per DESIGN_SPEC.md's
// brick states ("Expanded: only on click (opens the modal) -- no inline
// expand"). Replaces StageSlot's fixed-position/inline-expand model:
// RoadBook now renders exactly one brick per configured stage (no empty
// placeholder bricks), and every brick is a real, already-assigned stage --
// "add" happens through the separate "+ Add stage" button, not by dragging
// onto an empty brick.
//
// Sortable via dnd-kit (same mechanics StageSlot used) so it can be dragged
// to reorder within a leg or across a leg boundary -- RoadBook still owns
// the DndContext and the actual reordering/leg-count math on drop.
//
// Delete/up/down/duplicate controls live in a single `.controls` wrapper,
// hidden at rest and revealed on :hover/:focus-within of the brick root (see
// StageBrick.module.css) -- purely a CSS concern, no JSX branching needed.
export function StageBrick({
  uid,
  stage,
  value,
  stageNumber,
  isFirst,
  isLast,
  onEdit,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  hiddenStageName = false,
  locked = false,
}) {
  // Sortable hook is called unconditionally (Rules of Hooks) even though
  // its output is only used on the editable path below -- locked bricks
  // never actually need drag wiring, but the hook itself is cheap and this
  // keeps StageBrick a single component rather than needing a second one
  // just to dodge a conditional hook call.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, setActivatorNodeRef } =
    useSortable({ id: uid, data: { type: 'stage-brick' } });

  // Locked bricks render a plain, flat summary -- per DESIGN_SPEC.md's
  // "Created / locked" state ("bricks render in a plain locked/summary
  // style"), simpler than even the normal collapsed brick's resting state
  // (which still carries hover-revealed edit affordances). No drag handle,
  // no controls, no click-to-edit.
  if (locked) {
    return (
      <div className={styles.brickLocked}>
        <span className={styles.stageNumber}>{stageNumber}</span>
        <span className={styles.surfaceGlyph} title={stage?.surface ?? 'Unknown surface'}>
          {surfaceGlyph(stage?.surface)}
        </span>
        <span className={styles.stageName}>
          {getDisplayStageName(hiddenStageName, stage, value.custom_name, true)}
        </span>
        {stage && <span className={styles.stageMeta}>{formatKm(parseStageKm(stage))}</span>}
        <span className={styles.stageMeta}>{value.tracksettings_id}</span>
        <span className={styles.stageMeta}>{value.def_tyre_id}</span>
      </div>
    );
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const rootClassName = [styles.brick, isDragging ? styles.dragging : '', isOver ? styles.dropTarget : '']
    .filter(Boolean)
    .join(' ');

  function stopAndRun(fn) {
    return (e) => {
      e.stopPropagation();
      fn();
    };
  }

  return (
    <div ref={setNodeRef} style={style} className={rootClassName}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.dragHandle}
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag stage ${stageNumber}`}
        >
          ⠿
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={stopAndRun(onMoveUp)}
          disabled={isFirst}
          aria-label={`Move stage ${stageNumber} up`}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={stopAndRun(onMoveDown)}
          disabled={isLast}
          aria-label={`Move stage ${stageNumber} down`}
        >
          ↓
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={stopAndRun(onDuplicate)}
          aria-label={`Duplicate stage ${stageNumber}`}
          title="Duplicate"
        >
          ⧉
        </button>
        <button
          type="button"
          className={[styles.controlButton, styles.deleteButton].join(' ')}
          onClick={stopAndRun(onDelete)}
          aria-label={`Delete stage ${stageNumber}`}
          title="Delete"
        >
          ×
        </button>
      </div>

      <button type="button" className={styles.body} onClick={onEdit}>
        <span className={styles.stageNumber}>{stageNumber}</span>
        <span className={styles.surfaceGlyph} title={stage?.surface ?? 'Unknown surface'}>
          {surfaceGlyph(stage?.surface)}
        </span>
        <span className={styles.stageName}>
          {getDisplayStageName(hiddenStageName, stage, value.custom_name, false)}
        </span>
        {stage && <span className={styles.stageMeta}>{formatKm(parseStageKm(stage))}</span>}
        <span className={styles.stageMeta}>{value.tracksettings_id}</span>
        <span className={styles.stageMeta}>{value.def_tyre_id}</span>
      </button>
    </div>
  );
}
