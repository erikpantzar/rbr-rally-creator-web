import { useEffect, useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { FormActions } from '../FormGroup/FormGroup.jsx';
import { Modal } from '../Modal/Modal.jsx';
import { ServiceConfigModal } from '../ServiceConfigModal/ServiceConfigModal.jsx';
import { StageEntryEditor } from '../StageEntryEditor/StageEntryEditor.jsx';
import { loadStageConfigDraft, saveStageConfigDraft, clearStageConfigDraft } from '../../lib/stageConfigDraft.js';
import styles from './StageConfigModal.module.css';

// Full-page overlay around the stage-config form. The form body itself
// (stage picker, nickname/hidden-name, surface age, wetness, weather, tyre
// compound + choose_tyre/choose_setup, the "Service" summary button) lives
// in StageEntryEditor since rbr-rally-creator-web#107's Phase 0 extraction
// (docs/redesign/07-picker-workspace.md) -- this component is now only the
// modal *chrome* around it: takeover layer, Back/Save header, the local
// draft the controlled editor edits, the single-slot stageConfigDraft
// recovery, and the nested ServiceConfigModal (rbr-rally-creator-web#80;
// rendered here, outside the <form>, both because forms can't nest and
// because the upcoming PickerWorkspace replaces this overlay flow with an
// in-pane service form -- plan doc D5). Behavior is unchanged from before
// the extraction; the workspace phases build on the extracted editor, not
// on this wrapper.
//
// Replaces the form that used to live inline in StageSlot's "Edit details"
// panel; now it's the *only* way to create or edit a brick's config (per
// DESIGN_SPEC.md: "clicking it opens a dialog... on save, the dialog
// closes and a new brick appears").
//
// Was originally a centered backdrop+dialog; rbr-rally-creator-web#16 asked
// for a full-screen overlay instead ("its full view... a full layer on top
// of the app") with the close (x) replaced by an explicit "<- Back to
// rally" affordance and Save always reachable without scrolling. There's no
// "outside" to click on a full-page layer, so the old click-outside-closes
// backdrop behavior is gone; Escape still closes it (now via the same
// handleCancel as the Back button) since that's still a reasonable "back
// out" shortcut in a full-page context.
//
// `mode` is 'add' | 'edit' purely for the title copy; 'add' starts from a
// blank draft and calls onSave with a config that has no matching brick yet
// in the parent's eyes, while RoadBook is responsible for treating 'edit'
// as "update in place" -- this component only edits a local draft and hands
// the finished object back.

export function StageConfigModal({
  mode,
  initialValue,
  stages,
  options,
  isLastStage,
  stageNumber,
  hiddenStageNameEnabled = false,
  onSave,
  onCancel,
}) {
  const [draft, setDraft] = useState(initialValue);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  // rbr-rally-creator-web#80: whether the "Service" summary button in the
  // editor below has opened its own ServiceConfigModal -- entirely local to
  // this modal instance (there's exactly one stage being edited here,
  // `draft`, so no uid/stage lookup is needed the way RoadBook's
  // serviceModalState needs one). Saving from it just patches the local
  // draft same as any other field; nothing is written to stagePlan until
  // this modal's own Save.
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const hasCheckedStorageRef = useRef(false);

  // On first mount, prefer a matching abandoned in-progress draft (see
  // stageConfigDraft.js) over the freshly-computed initialValue -- but only
  // if it looks like genuine progress (a stage was actually picked), so a
  // draft that's just the untouched seed doesn't shadow a legitimate fresh
  // previous-stage-seeded default (rbr-rally-creator-web#5). Subsequent
  // initialValue changes (while this instance stays mounted) just reset the
  // draft normally -- the storage check only ever happens once per open.
  useEffect(() => {
    if (!hasCheckedStorageRef.current) {
      hasCheckedStorageRef.current = true;
      const saved = loadStageConfigDraft();
      const sameTarget = saved && saved.mode === mode && (mode !== 'edit' || saved.targetUid === initialValue?._uid);
      if (sameTarget && saved.draft?.stage_id) {
        setDraft(saved.draft);
        setRestoredFromDraft(true);
        return;
      }
    }
    setDraft(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue, mode]);

  // Save every change immediately so a refresh or closed tab mid-edit can
  // be recovered -- debouncing isn't worth the complexity here, this is a
  // small object and localStorage writes are cheap. Stays keyed off the
  // wrapper's `draft` after the #107 extraction: the controlled editor
  // hands every keystroke back via onChange/setDraft, so the persistence
  // cadence is identical to when the draft lived inside the form component.
  useEffect(() => {
    saveStageConfigDraft({
      mode,
      targetUid: mode === 'edit' ? (initialValue?._uid ?? null) : null,
      draft,
      savedAt: Date.now(),
    });
  }, [draft, mode, initialValue]);

  // Escape/focus wiring lives in Modal (useDialogChrome) -- handed
  // handleCancel rather than onCancel directly so backing out via Escape
  // still clears the recovery draft, same as the Back/Cancel buttons.
  function handleCancel() {
    clearStageConfigDraft();
    onCancel();
  }

  // Lets the user explicitly bail out of a restored draft back to the
  // "normal" starting point (previous-stage seed / the brick's saved
  // values) if the recovered in-progress edit isn't what they wanted.
  function handleDiscardDraft() {
    clearStageConfigDraft();
    setDraft(initialValue);
    setRestoredFromDraft(false);
  }

  function handleSave(e) {
    e.preventDefault();
    clearStageConfigDraft();
    onSave(draft);
  }

  function patch(fields) {
    setDraft((prev) => ({ ...prev, ...fields }));
  }

  const title = mode === 'edit' ? 'Edit stage' : 'Add stage';

  return (
    <Modal variant="takeover" labelledBy="stage-config-modal-title" onClose={handleCancel}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <button type="button" className={styles.backButton} onClick={handleCancel}>
              <span aria-hidden="true">&larr;</span> Back to rally
            </button>
            <h3 id="stage-config-modal-title">{title}</h3>
          </div>
          <Button
            type="submit"
            form="stage-config-form"
            variant="primary"
            className={styles.headerSaveButton}
            disabled={!draft.stage_id}
          >
            Save
          </Button>
        </div>
      </div>

      {restoredFromDraft && (
        <div className={styles.restoredNotice}>
          <span>Restored your unsaved changes from before.</span>
          <Button type="button" variant="secondary" size="sm" onClick={handleDiscardDraft}>
            Discard &amp; start fresh
          </Button>
        </div>
      )}

      <form id="stage-config-form" className={styles.form} onSubmit={handleSave}>
        <StageEntryEditor
          value={draft}
          onChange={setDraft}
          stages={stages}
          options={options}
          isLastStage={isLastStage}
          stageNumber={stageNumber}
          hiddenStageNameEnabled={hiddenStageNameEnabled}
          onEditService={() => setServiceModalOpen(true)}
        />

        <FormActions>
          <Button type="button" variant="secondary" size="md" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={!draft.stage_id}>
            Save
          </Button>
        </FormActions>
      </form>

      {/* rbr-rally-creator-web#80: sibling modal, opened on top of this one
          -- no stage picker inside it, since "which stage" is just this
          modal's own `draft`. Saving patches `draft` locally; nothing hits
          stagePlan until this outer modal's own Save/onSave. */}
      {serviceModalOpen && (
        <ServiceConfigModal
          value={draft}
          options={options}
          stageNumber={stageNumber}
          isLastStage={isLastStage}
          onSave={(serviceFields) => {
            patch(serviceFields);
            setServiceModalOpen(false);
          }}
          onCancel={() => setServiceModalOpen(false)}
        />
      )}
    </Modal>
  );
}
