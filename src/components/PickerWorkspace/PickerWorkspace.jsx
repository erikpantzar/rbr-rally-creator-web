import { useMemo, useState } from 'react';
import { Modal } from '../Modal/Modal.jsx';
import { ServiceEntryForm } from '../ServiceEntryForm/ServiceEntryForm.jsx';
import { StageEntryEditor } from '../StageEntryEditor/StageEntryEditor.jsx';
import { StagePicker } from '../StagePicker/StagePicker.jsx';
import {
  buildWorkspaceRows,
  resolveWorkspaceSelection,
  workspaceSelectionKey,
} from '../../lib/pickerWorkspace.js';
import { formatKm, parseStageKm, sumStagePlanKm } from '../../lib/rallyPlan.js';
import styles from './PickerWorkspace.module.css';

// rbr-rally-creator-web#107, docs/redesign/07-picker-workspace.md Phase 1:
// the "smarter modal" replacement for the StageConfigModal flow, behind the
// PICKER_WORKSPACE flag (see lib/settings.js). A takeover Modal holding two
// panes:
//
//  - LEFT: the rally itinerary sidebar -- one vertical list of leg headers,
//    stage rows and assigned-service rows (plan doc D6), always rendering
//    the COMMITTED stagePlan/legSchedule props, never a local copy, so it
//    can't disagree with the road book behind it. Navigation-only in this
//    phase: rows only select; adds/reorder/delete come in later phases.
//  - RIGHT: the detail pane, hosting the Phase-0-extracted controlled
//    editors keyed per selection (the app's key-remount reset pattern, plan
//    doc constraint 3) -- StageEntryEditor for a stage, ServiceEntryForm
//    in-pane for a service (D5, no ServiceConfigModal overlay in here).
//
// The pane is fully LIVE (D1): every onChange flows straight out through
// onUpdateStage/onUpdateService into RoadBook's mutation handlers and on
// through RallyBuilder's updateStagePlan -- which is precisely what keeps
// normalizeLastStageService applied to every edit made here (plan doc
// constraint 2). There is no Save, no Cancel, and no draft to lose:
// "Back to rally" (or Escape, via Modal's useDialogChrome) is the only
// exit and is always non-destructive. The single-slot stageConfigDraft
// recovery is deliberately absent -- obsolete under live editing (D1/R2),
// since every change already lands in stagePlan, which RallyBuilder's
// debounced currentDraft autosave persists.
//
// This component owns exactly one piece of state: the selection cursor.
// RallyBuilder keeps the plan, RoadBook keeps every mutation (plan doc
// Option C ownership).
//
//   { type: 'stage', uid }        a stage entry's form
//   { type: 'service', uid }      that stage's in-pane service form
//   { type: 'leg', legIndex }     a leg's context (the future add-target)
//
// `initialSelection` implements D3's open-with-origin-context: RoadBook
// passes the clicked stage, or the origin leg when opened from
// "+ Add stage", so the workspace opens looking at what the user clicked.
export function PickerWorkspace({
  stages,
  options,
  stagePlan,
  legSchedule,
  hiddenStageNameEnabled = false,
  initialSelection,
  onUpdateStage,
  onUpdateService,
  onClose,
}) {
  const [selection, setSelection] = useState(initialSelection ?? null);

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const stageByUid = useMemo(() => new Map(stagePlan.map((s) => [s._uid, s])), [stagePlan]);

  // Both the sidebar rows and the effective selection are derived fresh
  // from the live props every render -- the plan changes under this
  // component with every live edit, so nothing plan-shaped is cached in
  // state (see resolveWorkspaceSelection's own comment for the stale-uid
  // guard this buys).
  const rows = buildWorkspaceRows(stagePlan, legSchedule);
  const resolved = resolveWorkspaceSelection(selection, stagePlan, legSchedule);
  const selectionKey = workspaceSelectionKey(resolved);

  // Live derivation of the selected entry's position facts (plan doc R5:
  // the old modal froze stageNumber/willBeLastStage at open time, which a
  // workspace that keeps rendering across plan changes must not do).
  const selectedIndex =
    resolved.type === 'leg' ? -1 : stagePlan.findIndex((s) => s._uid === resolved.uid);
  const selectedEntry = selectedIndex >= 0 ? stagePlan[selectedIndex] : null;
  const selectedStageNumber = selectedIndex + 1;
  const selectedIsLastStage = selectedIndex >= 0 && selectedIndex === stagePlan.length - 1;

  // Same primary-name preference as StageBrick's getStageNames: the local
  // planning nickname wins over the catalog name when set.
  function stageDisplayName(entry) {
    const catalogStage = entry.stage_id ? stageByCatalogId.get(entry.stage_id) : null;
    return entry._label || catalogStage?.name || 'Unassigned stage';
  }

  function stageKmText(entry) {
    const catalogStage = entry.stage_id ? stageByCatalogId.get(entry.stage_id) : null;
    return catalogStage ? formatKm(parseStageKm(catalogStage)) : null;
  }

  function isRowSelected(row) {
    if (row.type === 'leg') return resolved.type === 'leg' && resolved.legIndex === row.legIndex;
    return resolved.type === row.type && resolved.uid === row.uid;
  }

  // Sidebar rows are plain buttons -- Tab/Enter navigation comes for free,
  // and the plan doc's defaults item 7 explicitly scopes v1 to exactly
  // that (no arrow-key roving focus yet).
  function renderRow(row) {
    const selected = isRowSelected(row);

    if (row.type === 'leg') {
      const legStages = stagePlan.slice(row.startIndex, row.endIndex);
      const stageCount = legStages.length;
      const legKm = sumStagePlanKm(legStages, stageByCatalogId);
      return (
        <button
          key={`leg:${row.legIndex}`}
          type="button"
          className={[styles.legRow, selected ? styles.rowSelected : ''].filter(Boolean).join(' ')}
          aria-current={selected || undefined}
          onClick={() => setSelection({ type: 'leg', legIndex: row.legIndex })}
        >
          <span className={styles.legRowName}>Leg {row.legIndex + 1}</span>
          <span className={styles.legRowMeta}>
            {stageCount} stage{stageCount === 1 ? '' : 's'}
          </span>
          <span className={styles.legRowMeta}>{formatKm(legKm)}</span>
        </button>
      );
    }

    const entry = stageByUid.get(row.uid);

    if (row.type === 'service') {
      return (
        <button
          key={`service:${row.uid}`}
          type="button"
          className={[styles.serviceRow, selected ? styles.rowSelected : ''].filter(Boolean).join(' ')}
          aria-current={selected || undefined}
          onClick={() => setSelection({ type: 'service', uid: row.uid })}
        >
          <span className={styles.serviceRowLabel}>Service</span>
          <span className={styles.serviceRowTime}>{entry.service_time}</span>
        </button>
      );
    }

    const km = stageKmText(entry);
    return (
      <button
        key={`stage:${row.uid}`}
        type="button"
        className={[styles.stageRow, selected ? styles.rowSelected : ''].filter(Boolean).join(' ')}
        aria-current={selected || undefined}
        onClick={() => setSelection({ type: 'stage', uid: row.uid })}
      >
        <span className={styles.stageRowNumber}>{row.stageNumber}</span>
        <span className={styles.stageRowName}>{stageDisplayName(entry)}</span>
        {km && <span className={styles.stageRowKm}>{km}</span>}
      </button>
    );
  }

  // Sits right after an empty leg's header -- same "this leg is empty"
  // legibility the road book's own emptyLegHint provides, minus the arrow
  // (there's no add affordance in the sidebar to point at yet, per D6).
  function renderEmptyLegHint(row, rowIndex) {
    if (row.type !== 'leg' || row.startIndex !== row.endIndex) return null;
    const nextRow = rows[rowIndex + 1];
    if (nextRow && nextRow.legIndex === row.legIndex) return null;
    return (
      <p key={`empty:${row.legIndex}`} className={styles.emptyLegHint}>
        No stages yet
      </p>
    );
  }

  function renderDetail() {
    if (resolved.type === 'stage') {
      return (
        <>
          <header className={styles.paneHeader}>
            <p className={styles.paneKicker}>Stage {selectedStageNumber}</p>
            <h4 className={styles.paneTitle}>{stageDisplayName(selectedEntry)}</h4>
          </header>
          {/* Plain div, not a <form> -- there is nothing to submit (D1).
              The in-form StagePicker keeps today's edit-modal semantics in
              this phase: picking a card re-targets THIS entry's stage_id
              (live, and atomically with its tyre/wetness/weather defaults
              in one onChange, which is R6's requirement by construction).
              D2's click-always-ADDS + the explicit "Change stage"
              affordance replace this in Phase 2. */}
          <div className={styles.paneForm}>
            <StageEntryEditor
              value={selectedEntry}
              onChange={(next) => onUpdateStage(resolved.uid, next)}
              stages={stages}
              options={options}
              isLastStage={selectedIsLastStage}
              stageNumber={selectedStageNumber}
              hiddenStageNameEnabled={hiddenStageNameEnabled}
              onEditService={() => setSelection({ type: 'service', uid: resolved.uid })}
            />
          </div>
        </>
      );
    }

    if (resolved.type === 'service') {
      return (
        <>
          <header className={styles.paneHeader}>
            <p className={styles.paneKicker}>Service &mdash; Stage {selectedStageNumber}</p>
            <h4 className={styles.paneTitle}>{stageDisplayName(selectedEntry)}</h4>
          </header>
          <div className={styles.paneForm}>
            {/* D5: the service form lives in-pane, same live contract as
                the stage editor. Value is trimmed to the three service
                fields so onChange emits exactly the write shape
                handleServiceModalSave has always used. */}
            <ServiceEntryForm
              value={{
                service_time: selectedEntry.service_time,
                nummechanics: selectedEntry.nummechanics,
                mechanicsSkill: selectedEntry.mechanicsSkill,
              }}
              onChange={(serviceFields) => onUpdateService(resolved.uid, serviceFields)}
              options={options}
              isLastStage={selectedIsLastStage}
            />
          </div>
        </>
      );
    }

    // Leg context (opened from "+ Add stage", or a leg header click) --
    // plan doc §5 defaults item 1 puts the picker here, scoped as the
    // leg's future add-target. In THIS phase it's a preview only: the
    // click-adds wiring (D2/D3/D4, onAddStage into this leg) is Phase 2,
    // so onSelect is a documented no-op and the note above the picker says
    // so, rather than cards that silently do nothing.
    const legRow = rows.find((r) => r.type === 'leg' && r.legIndex === resolved.legIndex);
    const legStageCount = legRow ? legRow.endIndex - legRow.startIndex : 0;
    return (
      <>
        <header className={styles.paneHeader}>
          <p className={styles.paneKicker}>Leg {resolved.legIndex + 1}</p>
          <h4 className={styles.paneTitle}>
            {legStageCount === 0 ? 'Add your first stage' : `${legStageCount} stage${legStageCount === 1 ? '' : 's'} planned`}
          </h4>
        </header>
        <p className={styles.pickerPhaseNote}>
          Browsing only for now &mdash; picking a stage here will add it to Leg {resolved.legIndex + 1} in
          the next phase. Until then, add stages from the road book&rsquo;s &ldquo;+ Add stage&rdquo; button.
        </p>
        <StagePicker
          stages={stages}
          selectedStageId={null}
          onSelect={() => {
            // Phase 2 (#107): handleAddStage(legIndex, config) lands here.
          }}
        />
      </>
    );
  }

  return (
    <Modal variant="takeover" labelledBy="picker-workspace-title" onClose={onClose}>
      <div className={styles.header}>
        {/* Same back-affordance language as StageConfigModal's header --
            but no Save next to it: leaving is always non-destructive (D1),
            so "Back to rally" is the header's only action. */}
        <button type="button" className={styles.backButton} onClick={onClose}>
          <span aria-hidden="true">&larr;</span> Back to rally
        </button>
        <h3 id="picker-workspace-title" className={styles.headerTitle}>
          Rally workspace
        </h3>
        <p className={styles.headerHint}>Changes apply as you make them</p>
      </div>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Rally itinerary">
          {rows.map((row, rowIndex) => (
            [renderRow(row), renderEmptyLegHint(row, rowIndex)]
          ))}
        </nav>

        {/* Keyed on the selection identity so switching rows remounts the
            editor with clean per-mount state (wet-suggestion dismissal,
            StagePicker's mount-scoped filters) -- plan doc constraint 3. */}
        <section key={selectionKey} className={styles.detail}>
          <div className={styles.detailInner}>{renderDetail()}</div>
        </section>
      </div>
    </Modal>
  );
}
