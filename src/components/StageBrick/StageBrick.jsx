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

// rbr-rally-creator-web#142: tracksettings_id is a free-text "<TimeOfDay>
// <CloudCover> <Condition>" string straight from the catalog (e.g. "Morning
// HeavyCloud HeavyRain", "Noon LightCloud NoRain") -- there's no separate
// structured precipitation field to read instead. "NoRain"/"NoSnow" are
// real catalog values (a stage's weather options include the *absence* of
// rain/snow as its own entry), so a bare `.includes('Rain')` would
// misclassify them -- both branches rule those out explicitly.
function classifyWeather(tracksettingsId) {
  if (!tracksettingsId) return 'unknown';
  if (tracksettingsId.includes('Rain') && !tracksettingsId.includes('NoRain')) return 'rain';
  if (tracksettingsId.includes('Snow') && !tracksettingsId.includes('NoSnow')) return 'snow';
  return 'dry';
}

const WEATHER_LABELS = { rain: 'Rain', snow: 'Snow', dry: 'Dry', unknown: 'Weather' };

// wetness_id is already one of these three catalog values verbatim -- this
// map only turns it into the wetness gauge's fill count (see WetnessGlyph),
// not a reinterpretation of the value itself.
const WETNESS_LEVELS = { dry: 1, damp: 2, wet: 3 };

function wetnessLabel(wetnessId) {
  if (!wetnessId) return 'Unknown';
  return wetnessId[0].toUpperCase() + wetnessId.slice(1);
}

// Small line-icon set, hand-drawn as plain SVG primitives (circles/lines/
// rects) rather than fragile bezier paths -- forgiving geometry that stays
// legible at the brick's compact badge size without pulling in an external
// icon library for four glyphs.
function TyreGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <line x1="8" y1="2" x2="8" y2="4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="11.7" x2="8" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="8" x2="4.3" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11.7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SetupGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6.2" cy="4" r="1.6" fill="currentColor" />
      <line x1="2" y1="8.4" x2="14" y2="8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10.4" cy="8.4" r="1.6" fill="currentColor" />
      <line x1="2" y1="12.8" x2="14" y2="12.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="5" cy="12.8" r="1.6" fill="currentColor" />
    </svg>
  );
}

// One glyph body covers all four weather states: a filled cloud blob (or a
// sun for 'dry') plus a row of marks underneath that differ by SHAPE, not
// just color, so rain/snow stay distinguishable without relying on hue
// (rbr-rally-creator-web#142's colorblind-safety requirement).
function WeatherGlyph({ variant }) {
  if (variant === 'dry') {
    return (
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="2.6" fill="currentColor" />
        <line x1="8" y1="1.6" x2="8" y2="3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="8" y1="12.6" x2="8" y2="14.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="1.6" y1="8" x2="3.4" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="12.6" y1="8" x2="14.4" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
      <circle cx="5.6" cy="7.6" r="2.3" fill="currentColor" />
      <circle cx="8.6" cy="6.4" r="2.9" fill="currentColor" />
      <circle cx="11.1" cy="8" r="2" fill="currentColor" />
      <rect x="4" y="7.6" width="8.5" height="2.6" rx="1.3" fill="currentColor" />
      {variant === 'rain' ? (
        <>
          <line x1="6" y1="12" x2="5" y2="14.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9" y1="12" x2="8" y2="14.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="12" y1="12" x2="11" y2="14.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="5.6" cy="13.3" r="0.9" fill="currentColor" />
          <circle cx="8.6" cy="13.3" r="0.9" fill="currentColor" />
          <circle cx="11.6" cy="13.3" r="0.9" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

// Signal-strength-style gauge: `level` bars filled solid, the rest outlined
// only -- the bar COUNT is the signal (colorblind-safe by construction),
// color is just a secondary weight cue layered on top.
function WetnessGlyph({ level }) {
  const bars = [1, 2, 3];
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
      {bars.map((bar, i) => {
        const height = 4 + i * 3.5;
        return (
          <rect
            key={bar}
            x={2.5 + i * 4}
            y={14 - height}
            width="2.6"
            height={height}
            fill={bar <= level ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}

// rbr-rally-creator-web#142: the issue's own ask ("make it red if not
// available") -- but color is never the only signal. `.optionBadgeOff`'s
// diagonal bar (StageBrick.module.css) draws over whichever glyph is
// passed in, so "not allowed" reads as a distinct SHAPE (icon-with-slash)
// layered on the red tint, not just a hue swap a colorblind user could miss.
function OptionBadge({ allowed, label, children }) {
  const className = [styles.optionBadge, allowed ? styles.optionBadgeOn : styles.optionBadgeOff].join(' ');
  const text = `${label}: ${allowed ? 'allowed' : 'not allowed'}`;
  return (
    <span className={className} title={text} aria-label={text}>
      {children}
    </span>
  );
}

function FactBadge({ tone, title, icon, children }) {
  return (
    <span className={[styles.factBadge, styles[tone]].join(' ')} title={title}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

// Shared by the editable brick and its locked/DragOverlay twin so the two
// never drift -- everything the issue (#142) asked to see lives here once:
// tyre/setup availability, weather, surface wetness, tyre compound, and
// finally distance pinned to the row's right edge (.distanceMeta's
// margin-left: auto in StageBrick.module.css) regardless of how the rest
// wraps.
function StageMetaGroup({ stage, value }) {
  const weather = classifyWeather(value.tracksettings_id);
  const wetnessLevel = WETNESS_LEVELS[value.wetness_id] ?? 0;
  const weatherTone = `weather${weather[0].toUpperCase()}${weather.slice(1)}`;
  const wetnessTone = `wetness${wetnessLevel || 1}`;
  return (
    <span className={styles.stageMetaGroup}>
      <OptionBadge allowed={value.choose_tyre} label="Tyre change">
        <TyreGlyph />
      </OptionBadge>
      <OptionBadge allowed={value.choose_setup} label="Setup change">
        <SetupGlyph />
      </OptionBadge>
      <FactBadge tone={weatherTone} title={value.tracksettings_id || 'Unknown weather'} icon={<WeatherGlyph variant={weather} />}>
        {WEATHER_LABELS[weather]}
      </FactBadge>
      <FactBadge
        tone={wetnessTone}
        title={`Surface: ${wetnessLabel(value.wetness_id)}`}
        icon={<WetnessGlyph level={wetnessLevel} />}
      >
        {wetnessLabel(value.wetness_id)}
      </FactBadge>
      {value.def_tyre_id && <span className={styles.stageMeta}>{value.def_tyre_id}</span>}
      {stage && (
        <span className={[styles.stageMeta, styles.distanceMeta].join(' ')}>{formatKm(parseStageKm(stage))}</span>
      )}
    </span>
  );
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
        <StageMetaGroup stage={stage} value={value} />
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
        <StageMetaGroup stage={stage} value={value} />
      </button>
    </div>
  );
}
