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

// rbr-rally-creator-web#64: per the maintainer's own comment on the issue,
// an optional per-stage nickname (`_label`, set via StageConfigModal's
// "Nickname (optional)" field) is a purely local planning label -- never
// sent to rallysimfans.hu (stripped before submission in RallyBuilder's
// handleCreateRally, same as `_uid`). Shown as the PRIMARY text with the
// real catalog stage name as a muted SECONDARY line alongside it, always --
// unlike an earlier pass that fully swapped the display name, which could
// make a bricked stage's real identity disappear entirely once nicknamed.
// When there's no nickname, this just renders the real name as the sole
// line.
// rbr-rally-creator-web#95: also surface the real per-stage public name
// (`hidden_name`, set via StageConfigModal's "Hidden stage name" field) that
// rallysimfans.hu shows to participants in place of the real stage name --
// only meaningful (and only rendered) when "Hide stage names" is checked in
// Rally basics (`hiddenEnabled`, threaded down the same way as in
// StageConfigModal), so a planner can tell at a glance which stages have one
// set without opening each stage's modal.
function getStageNames(stage, label, hiddenName, hiddenEnabled) {
  const realName = stage?.name ?? 'Unknown stage';
  const hidden = hiddenEnabled && hiddenName ? hiddenName : null;
  return label
    ? { primary: label, secondary: realName, hidden }
    : { primary: realName, secondary: null, hidden };
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
// Delete is the only remaining control, hidden at rest and revealed on
// :hover/:focus-within of the brick root (see StageBrick.module.css) --
// purely a CSS concern, no JSX branching needed. The rest of the brick's
// surface is both the drag source (dnd-kit listeners/attributes live on the
// root itself, not a separate handle) and the click-to-edit target --
// PointerSensor's activationConstraint (distance: 6, see RoadBook.jsx) is
// what tells a plain click from a drag apart, so onEdit only fires when the
// pointer didn't move far enough to count as a drag.
export function StageBrick({
  uid,
  stage,
  value,
  stageNumber,
  onEdit,
  onDelete,
  locked = false,
  hiddenStageNameEnabled = false,
  fullWidth = false,
}) {
  // Sortable hook is called unconditionally (Rules of Hooks) even though
  // its output is only used on the editable path below -- locked bricks
  // never actually need drag wiring, but the hook itself is cheap and this
  // keeps StageBrick a single component rather than needing a second one
  // just to dodge a conditional hook call.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: uid,
    data: { type: 'stage-brick' },
  });

  // Locked bricks render a plain, flat summary -- per DESIGN_SPEC.md's
  // "Created / locked" state ("bricks render in a plain locked/summary
  // style"), simpler than even the normal collapsed brick's resting state
  // (which still carries hover-revealed edit affordances). No drag handle,
  // no controls, no click-to-edit.
  if (locked) {
    const lockedNames = getStageNames(stage, value._label, value.hidden_name, hiddenStageNameEnabled);
    const lockedClassName = [styles.brickLocked, fullWidth ? styles.fullWidth : ''].filter(Boolean).join(' ');
    return (
      <div className={lockedClassName}>
        <span className={styles.stageNumber}>{stageNumber}</span>
        <span className={styles.surfaceGlyph} title={stage?.surface ?? 'Unknown surface'}>
          {surfaceGlyph(stage?.surface)}
        </span>
        <span className={styles.stageName}>{lockedNames.primary}</span>
        {lockedNames.secondary && <span className={styles.stageNameSecondary}>{lockedNames.secondary}</span>}
        {lockedNames.hidden && (
          <span
            className={styles.stageHiddenName}
            title="Shown to participants on rallysimfans.hu in place of this stage's real name"
          >
            Hidden: {lockedNames.hidden}
          </span>
        )}
        <span className={styles.stageMetaGroup}>
          {stage && <span className={styles.stageMeta}>{formatKm(parseStageKm(stage))}</span>}
          <span className={styles.stageMeta}>{value.tracksettings_id}</span>
          <span className={styles.stageMeta}>{value.def_tyre_id}</span>
        </span>
      </div>
    );
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const rootClassName = [
    styles.brick,
    isDragging ? styles.dragging : '',
    isOver ? styles.dropTarget : '',
    fullWidth ? styles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ');

  function stopAndRun(fn) {
    return (e) => {
      e.stopPropagation();
      fn();
    };
  }

  const brickNames = getStageNames(stage, value._label, value.hidden_name, hiddenStageNameEnabled);

  function handleDeleteKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      stopAndRun(onDelete)(e);
    }
  }

  return (
    <div ref={setNodeRef} style={style} className={rootClassName} {...listeners} {...attributes}>
      {/* rbr-rally-creator-web#96: a plain cross glyph, not a <button> --
          the issue asked to remove the button-styled delete affordance in
          favor of a red cross. Kept clickable/keyboard-operable
          (role="button", tabIndex, Enter/Space). Same hover/:focus-within
          reveal trick .controls used to use, except red from the moment
          it's revealed rather than needing a second, more precise hover of
          the control itself.
          rbr-rally-creator-web#121: this is now the SOLE way to delete a
          stage -- the old drag-to-remove zone (dropping a dragged brick on
          a per-leg target) was removed because dragging a stage between
          legs could land on it and delete the stage by accident. This
          cross's undo toast (RoadBook.jsx's handleDeleteStage) is unchanged. */}
      <span
        role="button"
        tabIndex={0}
        className={styles.deleteCorner}
        onClick={stopAndRun(onDelete)}
        onKeyDown={handleDeleteKeyDown}
        aria-label={`Delete stage ${stageNumber}`}
        title="Delete"
      >
        ×
      </span>

      <button type="button" className={styles.body} onClick={onEdit}>
        <span className={styles.stageNumber}>{stageNumber}</span>
        <span className={styles.surfaceGlyph} title={stage?.surface ?? 'Unknown surface'}>
          {surfaceGlyph(stage?.surface)}
        </span>
        <span className={styles.stageName}>{brickNames.primary}</span>
        {brickNames.secondary && <span className={styles.stageNameSecondary}>{brickNames.secondary}</span>}
        {brickNames.hidden && (
          <span
            className={styles.stageHiddenName}
            title="Shown to participants on rallysimfans.hu in place of this stage's real name"
          >
            Hidden: {brickNames.hidden}
          </span>
        )}
        <span className={styles.stageMetaGroup}>
          {stage && <span className={styles.stageMeta}>{formatKm(parseStageKm(stage))}</span>}
          <span className={styles.stageMeta}>{value.tracksettings_id}</span>
          <span className={styles.stageMeta}>{value.def_tyre_id}</span>
        </span>
      </button>
    </div>
  );
}
