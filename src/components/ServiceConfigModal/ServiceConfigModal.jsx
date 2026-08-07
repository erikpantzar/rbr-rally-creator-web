import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { FormActions } from '../FormGroup/FormGroup.jsx';
import { Modal } from '../Modal/Modal.jsx';
import { ServiceEntryForm } from '../ServiceEntryForm/ServiceEntryForm.jsx';
import styles from './ServiceConfigModal.module.css';

// rbr-rally-creator-web#80: separate sibling modal to StageConfigModal,
// scoped entirely to one stage's service_time/nummechanics/mechanicsSkill.
// The form body (tier row + duration/mechanics/skill selects) lives in
// ServiceEntryForm since rbr-rally-creator-web#107's Phase 0 extraction
// (docs/redesign/07-picker-workspace.md) -- this component is now only the
// overlay chrome around it: the centered card, the local draft the
// controlled form edits, and Save/Cancel. Behavior unchanged.
//
// Deliberately has NO stage picker inside it -- which stage it applies to
// is implicit from where it was opened (the leg-list blue block), passed in
// here as `stageLabel`/`stageNumber` purely for display, and `value` is that
// one stage's current service fields. onSave hands back just the three
// service fields; the caller (RoadBook) is responsible for writing them onto
// the right stagePlan entry -- this component never touches stagePlan
// itself.
//
// Originally mirrored the now-removed StageConfigModal's structural
// conventions (full-page overlay, sticky header with Back/Save,
// Escape-to-close, .actions row at the bottom) since DESIGN_SPEC.md treated
// them as siblings in the same system; StageConfigModal is gone
// (rbr-rally-creator-web#107 Phase 3 -- PickerWorkspace replaced it, and
// hosts its own in-pane service form for the flows that used to nest a
// ServiceConfigModal inside it), but this standalone entry point (opened
// directly from a leg-row ServiceBlock click) still renders as a smaller
// centered card rather than a full-page overlay, reusing the same
// tokens/actions-row/Escape conventions so it still reads as "part of the
// same app".
export function ServiceConfigModal({ value, options, stageLabel, stageNumber, isLastStage, disabledReason, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    service_time: value.service_time,
    nummechanics: value.nummechanics,
    mechanicsSkill: value.mechanicsSkill,
  });

  function handleSave(e) {
    e.preventDefault();
    onSave(draft);
  }

  const title = stageNumber ? `Service — Stage ${stageNumber}` : 'Service';

  return (
    <Modal variant="overlay" labelledBy="service-config-modal-title" onClose={onCancel}>
      <div className={styles.header}>
        <h3 id="service-config-modal-title">{title}</h3>
        {stageLabel && <p className={styles.headerSubtitle}>{stageLabel}</p>}
      </div>

      <form className={styles.form} onSubmit={handleSave}>
        <ServiceEntryForm
          value={draft}
          onChange={setDraft}
          options={options}
          isLastStage={isLastStage}
          disabledReason={disabledReason}
        />

        <FormActions>
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isLastStage}>
            Save
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
