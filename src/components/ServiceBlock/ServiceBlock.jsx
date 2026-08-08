import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getServiceTier } from '../../lib/rallyPlan.js';
import styles from './ServiceBlock.module.css';

// rbr-rally-creator-web#80/#96: presentational piece shared by two entry
// points -- the compact block RoadBook renders after each non-final stage
// brick (now independently sortable, see below), and the summary/button
// StageConfigModal renders in its own "Service" form-group. Both call
// onClick to open ServiceConfigModal scoped to their stage; neither owns
// any service state itself.
//
// `variant` picks between the two layouts ('bar' for RoadBook's leg-row
// block, 'summary' for StageConfigModal's inline button) since the visual
// shape differs enough that one CSS class can't cover both, but the
// underlying "tier -> label/color" logic is identical either way.
//
// `sortableId`, when given, wires this block into dnd-kit as its own drag
// source/drop target (RoadBook#96: an assigned service block moves
// independently of its stage now, not just implicitly along with it) --
// omitted for the 'summary' variant, the locked path, and the leg's "+ Add
// service" button (RoadBook#97: assigning one is a plain click that opens
// ServiceConfigModal, not a drag), none of which drag.
// `onClear`, when given, renders a small × the way StageBrick's delete
// control does, for clearing an assigned block back to unassigned without a
// drag.
export function ServiceBlock({
  serviceTime,
  variant = 'bar',
  disabled = false,
  disabledReason = null,
  onClick,
  onClear,
  sortableId = null,
  fullWidth = false,
}) {
  const tier = getServiceTier(serviceTime);
  const hasService = tier.key !== 'none';

  // Hook is called unconditionally (Rules of Hooks); its output is only
  // wired onto the DOM node when sortableId is actually provided. `disabled:
  // !sortableId` keeps dnd-kit from treating a non-sortable render (the
  // 'summary' variant, or a disabled/locked block) as a drag source at all.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: sortableId ?? 'service-block-inert',
    data: { type: 'service-block' },
    disabled: !sortableId || disabled,
  });

  const sortableStyle = sortableId
    ? { transform: CSS.Transform.toString(transform), transition }
    : undefined;

  const className = [
    styles.block,
    styles[variant],
    hasService ? styles.active : styles.empty,
    disabled ? styles.disabled : '',
    sortableId ? styles.draggable : '',
    isDragging ? styles.dragging : '',
    isOver ? styles.dropTarget : '',
    fullWidth ? styles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      ref={sortableId ? setNodeRef : undefined}
      style={sortableStyle}
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : hasService ? `${tier.label} — click to edit` : 'Click to add service'}
      {...(sortableId ? listeners : undefined)}
      {...(sortableId ? attributes : undefined)}
    >
      {hasService ? (
        <>
          <span className={styles.label}>{tier.label}</span>
          <span className={styles.detail}>{serviceTime}</span>
          {onClear && (
            <span
              className={styles.clearButton}
              role="button"
              tabIndex={0}
              aria-label="Remove service"
              title="Remove service"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onClear();
                }
              }}
            >
              ×
            </span>
          )}
        </>
      ) : (
        <span className={styles.label}>+ Add service</span>
      )}
    </button>
  );
}
