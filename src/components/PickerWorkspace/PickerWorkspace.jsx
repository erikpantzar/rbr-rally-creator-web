import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../Modal/Modal.jsx';
import { Itinerary } from '../Itinerary/Itinerary.jsx';
import { ServiceEntryForm } from '../ServiceEntryForm/ServiceEntryForm.jsx';
import { StageEntryEditor } from '../StageEntryEditor/StageEntryEditor.jsx';
import { StagePicker } from '../StagePicker/StagePicker.jsx';
import { Button } from '../Button/Button.jsx';
import { resolveWorkspaceSelection, workspaceSelectionKey } from '../../lib/pickerWorkspace.js';
import { createStageConfigForCatalogStage } from '../../lib/rallyPlan.js';
import styles from './PickerWorkspace.module.css';

// rbr-rally-creator-web#107, docs/redesign/07-picker-workspace.md Phase 1/2:
// the "smarter modal" replacement for the StageConfigModal flow, behind the
// PICKER_WORKSPACE flag (see lib/settings.js). A takeover Modal holding two
// panes:
//
//  - LEFT: the rally itinerary sidebar -- one vertical list of leg headers,
//    stage rows and assigned-service rows (plan doc D6), always rendering
//    the COMMITTED stagePlan/legSchedule props, never a local copy, so it
//    can't disagree with the road book behind it. Navigation-only: rows
//    only select; reorder/delete/add-buttons are still later phases (D6,
//    Phase 4) -- but see Phase 2 below, picker card clicks in the leg
//    context DO add now, distinct from the sidebar's own rows.
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
//
// Phase 2 (#107, D2/D4): a leg context's picker card click now really adds
// -- onAddStage(legIndex, stageId) appends a born-complete brick to the END
// of that leg (RoadBook's handleAddStageFromWorkspace does the seeding +
// splice). The workspace deliberately STAYS on the leg-context pane rather
// than jumping the selection to the new brick (an earlier version of this
// did that; feedback was that it broke the "keep dealing stages" rhythm --
// every click should feel like adding a card to the leg, not a navigation).
// Instead: a self-dismissing "Stage added" toast plus a brief highlight-fade
// on the new row in the sidebar give the confirmation, and the picker stays
// put with its filters untouched (StagePicker persists its own filters
// across mounts) so the very next click adds the next stage. Replacing an
// EXISTING stage's catalog pick is a separate, explicit "Change stage"
// affordance on the stage form itself (StageEntryEditor's
// pickerMode="affordance", D2) -- the in-form picker no longer re-targets
// on a bare click the way the Phase 1 stopgap did.
//
// rbr-rally-creator-web#107 follow-up: the stage editor pane also hosts two
// contextual shortcuts -- "+ Add service after this stage" and "+ Add leg"
// -- reachable from StageEntryEditor's onAddService/onAddLeg props
// (handleAddServiceShortcut/handleAddLegShortcut below), backed by
// RoadBook's onAddServiceToStage/onAddLegFromWorkspace callbacks. These
// deliberately DO jump the workspace's selection to what they just created
// -- the opposite of the click-to-add picker's "stay put" rule above.
// Different intent: click-to-add is a repeatable rhythm where every click
// should feel like dealing the next card without looking away, but "add a
// service" / "add a leg" are one-shot, deliberate actions the user takes
// specifically to go work on that new thing next -- there's no "next one"
// to keep clicking through. Jumping is the whole point, not a regression of
// the click-to-add lesson above.
export function PickerWorkspace({
  stages,
  options,
  stagePlan,
  legSchedule,
  hiddenStageNameEnabled = false,
  initialSelection,
  onUpdateStage,
  onUpdateService,
  onAddStage,
  onAddServiceToStage,
  onAddLegFromWorkspace,
  onReorderStage,
  onReassignService,
  onClose,
}) {
  const [selection, setSelection] = useState(initialSelection ?? null);

  // Preview-then-confirm (Hyper redesign): clicking a catalog card in the
  // leg-context pane no longer adds instantly -- it stages a not-yet-committed
  // draft config here first, previewed with the same weather/wetness/tyre/
  // nickname fields StageEntryEditor already renders for a real stage, behind
  // an explicit "Add to Leg N" button. null means no card is currently
  // previewed (the plain catalog grid shows). Local, not plan state: nothing
  // here exists in stagePlan until the confirm button actually calls
  // onAddStage.
  const [previewDraft, setPreviewDraft] = useState(null);

  // Transient "you just added this" feedback -- a toast (auto-dismissed)
  // plus a fading highlight on the new row (CSS animation, cleared from
  // state on animationend so it can never get stuck). Both are pure UI
  // state local to this component, not plan state: the sidebar itself
  // always reflects committed stagePlan/legSchedule regardless of these.
  const [addedToast, setAddedToast] = useState(null);
  const [justAddedUid, setJustAddedUid] = useState(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  const stageByCatalogId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  // Picker "already added" ribbon (#107 follow-up): counts, not booleans,
  // even though the ribbon itself only ever asks ">0" -- a Map is the
  // natural shape for "how many times does each catalog id appear", and
  // StagePicker's isStageAlreadyUsed already tolerates either a Map or a
  // plain object, so there's no reason to throw the count away here just
  // because today's only consumer doesn't need it. Recomputed from the live
  // stagePlan prop every render, same "never a stale local copy" rule as
  // `resolved` below.
  const stagePlanCounts = useMemo(() => {
    const counts = new Map();
    for (const entry of stagePlan) {
      counts.set(entry.stage_id, (counts.get(entry.stage_id) ?? 0) + 1);
    }
    return counts;
  }, [stagePlan]);

  // The effective selection is derived fresh from the live props every
  // render -- the plan changes under this component with every live edit,
  // so nothing plan-shaped is cached in state (see resolveWorkspaceSelection's
  // own comment for the stale-uid guard this buys).
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

  // rbr-rally-creator-web#107: the stage editor pane's "+ Add service after
  // this stage" shortcut. Unlike handleAddCardSelect above, this DOES jump
  // selection -- onAddServiceToStage assigns the service in one call (no
  // separate "now go fill it in" step the way a brand-new unassigned stage
  // needs), so landing on the service pane immediately is the natural next
  // stop, not a surprise navigation. Selection follows the exact
  // {type:'service', uid} shape resolveWorkspaceSelection already expects.
  function handleAddServiceShortcut() {
    onAddServiceToStage(resolved.uid);
    setSelection({ type: 'service', uid: resolved.uid });
  }

  // rbr-rally-creator-web#107: the stage editor pane's "+ Add leg"
  // shortcut. onAddLegFromWorkspace both creates the leg AND returns its
  // index (RoadBook.handleAddLegFromWorkspace), so the jump is a direct
  // read of that return value rather than a guess at legSchedule.length --
  // safe even if this ever fires twice in quick succession before a
  // re-render lands.
  function handleAddLegShortcut() {
    const newLegIndex = onAddLegFromWorkspace();
    setSelection({ type: 'leg', legIndex: newLegIndex });
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
              pickerMode="affordance" (Phase 2, D2/R6): the in-form
              StagePicker no longer re-targets on a bare card click -- that
              was the Phase 1 stopgap. Replacing this entry's stage is now
              the explicit "Change stage" affordance StageEntryEditor itself
              renders; every card click elsewhere in this workspace (the leg
              context below) always ADDS instead. */}
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
              pickerMode="affordance"
              stagePlanCounts={stagePlanCounts}
              onAddService={handleAddServiceShortcut}
              onAddLeg={handleAddLegShortcut}
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
    // leg's add-target (D3: sidebar selection is the cursor).
    //
    // Preview-then-confirm (Hyper redesign, superseding the old Phase 2
    // instant-add): a card click no longer splices a brick into the plan by
    // itself -- it stages `previewDraft` (a real, catalog-assigned config
    // built via createStageConfigForCatalogStage, same seed
    // StageEntryEditor's own card-pick uses) and shows it in a preview pane
    // with the same weather/wetness/tyre/nickname fields a committed stage
    // gets. Nothing lands in stagePlan until "Add to Leg N" explicitly
    // confirms it (handleConfirmAdd below), which is the point where
    // onAddStage actually runs and the sidebar grows. Only the fields this
    // preview pane edits travel as `overrides` -- RoadBook's
    // handleAddStageFromWorkspace still derives everything else (seeded
    // service/surface-age fields, the fresh _uid) exactly as it always has,
    // so this is additive on top of that pipeline, not a replacement for it.
    const legStageCount = legSchedule[resolved.legIndex]?.stage_count || 0;

    function handlePreviewCardSelect(stageId) {
      const stage = stageByCatalogId.get(stageId);
      if (!stage) return;
      setPreviewDraft(createStageConfigForCatalogStage(stage));
    }

    function handleConfirmAdd() {
      if (!previewDraft) return;
      const stage = stageByCatalogId.get(previewDraft.stage_id);
      // eslint-disable-next-line no-unused-vars -- destructured only to
      // exclude both from `overrides` (RoadBook's handleAddStageFromWorkspace
      // already derives _uid and stage_id itself; overrides must not clobber
      // either).
      const { _uid, stage_id: _stageId, ...overrides } = previewDraft;
      const newUid = onAddStage(resolved.legIndex, previewDraft.stage_id, overrides);
      setPreviewDraft(null);

      // Same "stay put, toast + highlight" feedback the old instant-add flow
      // gave -- confirming a preview is still meant to feel like dealing the
      // next card, not a navigation.
      clearTimeout(toastTimeoutRef.current);
      setAddedToast(stage ? `${stage.name} added` : 'Stage added');
      setJustAddedUid(newUid);
      toastTimeoutRef.current = setTimeout(() => setAddedToast(null), 2200);
    }

    if (previewDraft) {
      const previewStage = stageByCatalogId.get(previewDraft.stage_id);
      return (
        <>
          <header className={styles.paneHeader}>
            <p className={styles.paneKicker}>Adding to Leg {resolved.legIndex + 1}</p>
            <h4 className={styles.paneTitle}>{previewStage?.name ?? 'Unknown stage'}</h4>
          </header>
          <div className={styles.paneForm}>
            <StageEntryEditor
              value={previewDraft}
              onChange={setPreviewDraft}
              stages={stages}
              options={options}
              isLastStage={false}
              stageNumber={legStageCount + 1}
              hiddenStageNameEnabled={hiddenStageNameEnabled}
              pickerMode="affordance"
              stagePlanCounts={stagePlanCounts}
            />
            <div className={styles.previewActions}>
              <Button type="button" variant="secondary" onClick={() => setPreviewDraft(null)}>
                Cancel
              </Button>
              <Button type="button" variant="launch" onClick={handleConfirmAdd}>
                Add to Leg {resolved.legIndex + 1} &#9656;
              </Button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <header className={styles.paneHeader}>
          <p className={styles.paneKicker}>Leg {resolved.legIndex + 1}</p>
          <h4 className={styles.paneTitle}>
            {legStageCount === 0 ? 'Add your first stage' : `${legStageCount} stage${legStageCount === 1 ? '' : 's'} planned`}
          </h4>
        </header>
        <p className={styles.addHint}>
          Pick a stage to preview it, then confirm to add it to the end of Leg {resolved.legIndex + 1}.
        </p>
        <StagePicker
          stages={stages}
          selectedStageId={null}
          onSelect={handlePreviewCardSelect}
          stagePlanCounts={stagePlanCounts}
        />
      </>
    );
  }

  // previewDraft lives in this component, not inside renderDetail(), so the
  // key-remount trick on the <section> below doesn't reset it on its own --
  // navigating away from an in-progress preview (to a different sidebar row)
  // must explicitly discard it here, same as clicking Cancel would.
  function handleSelectStage(uid) {
    setPreviewDraft(null);
    setSelection({ type: 'stage', uid });
  }

  function handleSelectService(uid) {
    setPreviewDraft(null);
    setSelection({ type: 'service', uid });
  }

  function handleSelectLeg(legIndex) {
    setPreviewDraft(null);
    setSelection({ type: 'leg', legIndex });
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

      {/* "Stage added" confirmation -- self-dismissing (see handleAddCardSelect's
          timeout), role="status" so it's announced without stealing focus. Sits
          outside .body so it floats above both panes regardless of scroll
          position, same reasoning as the app's own Toast component. */}
      {addedToast && (
        <div className={styles.addedToast} role="status">
          {addedToast}
        </div>
      )}

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Rally itinerary">
          <Itinerary
            detail="compact"
            stages={stages}
            options={options}
            stagePlan={stagePlan}
            legSchedule={legSchedule}
            selection={resolved}
            onSelectStage={handleSelectStage}
            onSelectService={handleSelectService}
            onSelectLeg={handleSelectLeg}
            onReorderStage={onReorderStage}
            onReassignService={onReassignService}
            onAddLeg={handleAddLegShortcut}
            highlightUid={justAddedUid}
            onHighlightAnimationEnd={() => setJustAddedUid(null)}
          />
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
