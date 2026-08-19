import { useEffect, useMemo, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { FormGroup } from '../FormGroup/FormGroup.jsx';
import { Input } from '../Input/Input.jsx';
import { ServiceBlock } from '../ServiceBlock/ServiceBlock.jsx';
import { StagePicker } from '../StagePicker/StagePicker.jsx';
import { applyPickedStageToConfig, getWetTyreForSurface, isSurfaceAgeChangeable } from '../../lib/rallyPlan.js';
import styles from './StageEntryEditor.module.css';

// The stage-config form body, extracted from StageConfigModal for
// rbr-rally-creator-web#107 (docs/redesign/07-picker-workspace.md, Phase 0)
// so the upcoming PickerWorkspace's detail pane can host the same editor
// the modal uses today. Fully *controlled*, per the plan doc's Phase 0
// contract: `value` is the one stage config being edited, every field edit
// calls `onChange` with the full next config, and there is no internal
// draft -- StageConfigModal keeps its draft state, Save/Cancel, and
// stageConfigDraft persistence *around* this component, so the current
// modal flow is byte-identical; the workspace will later wire onChange
// straight into live plan updates instead (plan doc D1).
//
// Deliberately NOT included here (they're the wrapper's job):
//  - the <form> element + Save/Cancel actions: the workspace pane has no
//    Save at all (D1), and the nested ServiceConfigModal must stay rendered
//    *outside* the modal's <form> (forms can't nest; Modal doesn't portal).
//  - the service editor itself: pressing the "Service" summary button only
//    calls `onEditService` -- StageConfigModal opens its ServiceConfigModal
//    overlay exactly as before, while the workspace will swap the detail
//    pane to an in-pane ServiceEntryForm instead (D5).
//
// `isLastStage` / `stageNumber` remain plain props for now -- frozen at
// open time by the modal, derived live by the workspace later (plan doc R5).
//
// `pickerMode` (rbr-rally-creator-web#107 Phase 2, D2/R6): the old modal
// flow keeps its picker always visible, re-targeting `value.stage_id` live
// on every card click ('inline', the default -- keeps StageConfigModal's
// flag-off behavior byte-identical, since that's the only caller that
// doesn't pass this prop). The picker workspace instead only lets a card
// click ADD a brand-new brick elsewhere (D2: click always adds); replacing
// THIS entry's stage becomes an explicit "Change stage" affordance
// ('affordance' mode) that reveals the same StagePicker in a one-shot
// replace: picking a card there patches stage_id + its dependent tyre/
// wetness/weather defaults atomically via applyPickedStageToConfig (R6),
// then collapses back to the summary row.
//
// `onAddService`/`onAddLeg` (rbr-rally-creator-web#107 follow-up): two
// optional contextual shortcuts rendered together at the foot of the form,
// below the Service group -- "while I'm editing this stage" jump points the
// old modal flow never had a use for (it edited one entry with no live
// itinerary alongside it to jump around in), so both are omitted entirely
// when not supplied rather than defaulting to a no-op, keeping any future
// non-workspace caller's render byte-identical. PickerWorkspace is the only
// caller that passes them today. Each performs its own mutation (via the
// prop) and its own selection jump -- this component doesn't know or care
// what "jump" means, it just triggers the callback the same as any other
// button here.
//
// `onDelete` (rbr-rally-creator-web#141): same optional/omit-when-absent
// contract as the two shortcuts above -- PickerWorkspace's stage pane is
// the only caller that passes it, so a bare "delete cross"-style click just
// calls it straight through (no local confirm state), matching the road
// book's own StageBrick delete cross (no confirm there either, just its
// undo toast). Rendered as its own row, visually separated from the
// add-oriented shortcuts above it (danger styling vs. the constructive
// dashed-outline language .shortcutButton uses) so it doesn't read as one
// more "add" option in that row.
export function StageEntryEditor({
  value,
  onChange,
  stages,
  options,
  isLastStage,
  stageNumber,
  hiddenStageNameEnabled = false,
  onEditService,
  pickerMode = 'inline',
  stagePlanCounts,
  onAddService,
  onAddLeg,
  onDelete,
}) {
  // Only meaningful in 'affordance' mode -- whether the one-shot replace
  // picker is currently open. Per-mount state is correct here the same way
  // dismissedWetSuggestion is: a fresh mount (new selected entry) should
  // start collapsed, not carry over the previous entry's "mid change-stage"
  // state.
  const [changingStage, setChangingStage] = useState(false);
  // Whether the wet-tyre suggestion banner (see below) has been explicitly
  // dismissed for the current wetness/stage combo. Reset to false whenever
  // either changes (effect further down) so a fresh trigger of the
  // condition -- switching to a different surface, or leaving and
  // returning to 'wet' -- surfaces the suggestion again rather than staying
  // silenced forever after one dismissal. Lives here (not in the wrapper)
  // because it's per-mount UI state: the modal remounts per open, and the
  // workspace pane will remount per selected entry (key-remount pattern,
  // plan doc constraint 3), so both get the same reset-on-fresh-context.
  const [dismissedWetSuggestion, setDismissedWetSuggestion] = useState(false);

  // Controlled-component patch: hand the merged next config up. The single
  // call site per event (no two patches in one handler anywhere below)
  // makes spreading the current `value` prop equivalent to the functional
  // setState the modal used pre-extraction.
  function patch(fields) {
    onChange({ ...value, ...fields });
  }

  // Re-arm the wet-tyre suggestion whenever its trigger conditions change --
  // a newly-picked stage (different surface) or a fresh transition into
  // 'wet' should both get their own chance to suggest, rather than staying
  // silenced because an earlier, unrelated dismissal happened to still be in
  // effect.
  useEffect(() => {
    setDismissedWetSuggestion(false);
  }, [value.stage_id, value.wetness_id]);

  const selectedStage = useMemo(
    () => stages.find((s) => s.id === value.stage_id) ?? null,
    [stages, value.stage_id]
  );

  // rbr-rally-creator-web#128: a beta tester found some stages don't let the
  // real site's wizard change surface age at all -- an unsupported pick
  // ("Worn") came back silently reset to "New" rather than rejected.
  // `stage.supportsVariableSurface` is the per-stage capability flag
  // (rbr-rally-creator-service's stages.json, scraped from stages.php).
  // No stage picked yet -> nothing to lock against, so the control stays
  // enabled (applyPickedStageToConfig pins the value the moment a
  // non-changeable stage IS picked, see its own comment).
  const surfaceAgeChangeable = !selectedStage || isSurfaceAgeChangeable(selectedStage);

  // The "already added" ribbon (#107 follow-up) is meant to flag OTHER
  // stages you've already used, not this entry's own current pick --
  // seeing a ribbon on the very card you're mid-way through replacing (or
  // picking for the first time) would read as "you can't pick this",
  // which isn't the message. Subtract one occurrence for value.stage_id
  // before handing counts down, so this entry's own pick never
  // self-flags. A no-op when stagePlanCounts isn't passed at all.
  const stagePlanCountsExcludingSelf = useMemo(() => {
    if (!stagePlanCounts || !value.stage_id) return stagePlanCounts;
    const next = new Map(stagePlanCounts);
    const current = next.get(value.stage_id) ?? 0;
    if (current > 1) next.set(value.stage_id, current - 1);
    else next.delete(value.stage_id);
    return next;
  }, [stagePlanCounts, value.stage_id]);
  // Suggestion only -- per the issue's own title ("dont enforce it"), this
  // never auto-applies. It disappears (without needing an explicit dismiss)
  // as soon as any part of the condition it was suggesting for stops
  // holding: wetness moved off 'wet', the tyre already matches the wet
  // variant (e.g. the user applied it, or picked it themselves from the
  // dropdown), or the surface has no wet variant (snow).
  const suggestedWetTyre = selectedStage ? getWetTyreForSurface(selectedStage.surface) : null;
  const showWetTyreSuggestion =
    value.wetness_id === 'wet' &&
    !!suggestedWetTyre &&
    value.def_tyre_id !== suggestedWetTyre &&
    !dismissedWetSuggestion;

  // Shared by both modes: a card pick always patches stage_id + its
  // dependent tyre/wetness/weather defaults in one atomic call
  // (applyPickedStageToConfig, R6) -- never split across two patches, which
  // would transiently leave a brick without a stage_id.
  function handlePickStage(id) {
    const stage = stages.find((s) => s.id === id) ?? null;
    onChange(applyPickedStageToConfig(value, stage));
    setChangingStage(false);
  }

  return (
    <>
      {pickerMode === 'inline' ? (
        <FormGroup label="Stage">
          <StagePicker
            stages={stages}
            selectedStageId={value.stage_id}
            onSelect={handlePickStage}
            stagePlanCounts={stagePlanCountsExcludingSelf}
          />
        </FormGroup>
      ) : (
        // 'affordance' mode (PickerWorkspace, D2 fallout / defaults item 2):
        // a card click never silently re-targets this entry any more -- the
        // picker only appears once "Change stage" is explicitly clicked,
        // and collapses back to the summary the moment a card is picked.
        <FormGroup label="Stage">
          {changingStage ? (
            <>
              <StagePicker
                stages={stages}
                selectedStageId={value.stage_id}
                onSelect={handlePickStage}
                stagePlanCounts={stagePlanCountsExcludingSelf}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => setChangingStage(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <div className={styles.stageSummaryRow}>
              <span className={styles.stageSummaryName}>{selectedStage?.name ?? 'No stage picked'}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setChangingStage(true)}>
                Change stage
              </Button>
            </div>
          )}
        </FormGroup>
      )}

      {/* rbr-rally-creator-web#64: a purely local planning nickname --
          shown always, not gated on hidden_stage_name (that checkbox
          controls the real public name field below instead). Placeholder
          shows "Stage N" for this stage's position so the user still
          knows which physical stage they're naming without that number
          being something they'd type over blindly. */}
      <FormGroup label="Nickname (optional)" htmlFor="modal-label">
        <Input
          id="modal-label"
          size="md"
          type="text"
          placeholder={stageNumber ? `Stage ${stageNumber}` : 'e.g. Stage 3'}
          value={value._label ?? ''}
          onChange={(e) => patch({ _label: e.target.value })}
        />
        <p className={styles.fieldNote}>
          For your own planning view only — this does not appear on rallysimfans.hu and participants never see it.
        </p>
      </FormGroup>

      {/* rbr-rally-creator-service#20: the real public per-stage name
          shown to participants on rallysimfans.hu -- only rendered (and
          only meaningful) when "Hide stage names" is checked in Rally
          basics, matching the site's own #stage_name field, which only
          appears in that same condition. Distinct from the always-visible
          local Nickname field above. */}
      {hiddenStageNameEnabled && (
        <FormGroup label="Hidden stage name" htmlFor="modal-hidden-name">
          <Input
            id="modal-hidden-name"
            size="md"
            type="text"
            placeholder="Name shown to participants instead of the real stage name"
            value={value.hidden_name ?? ''}
            onChange={(e) => patch({ hidden_name: e.target.value })}
          />
          <p className={styles.fieldNote}>
            Shown to participants on rallysimfans.hu in place of this stage's real name.
          </p>
        </FormGroup>
      )}

      {/* rbr-rally-creator-web#124: "Age" read as a stage-metadata label
          rather than what it actually drives -- how worn-in the road
          surface is for this run. Renamed to "Surface condition"; the field
          itself (surface_age_id) is untouched, this is copy only. */}
      <FormGroup label="Surface condition">
        <div className={styles.radioGroup}>
          {options.surfaceAge.map((age) => (
            <label
              key={age.value}
              className={[styles.radioLabel, !surfaceAgeChangeable ? styles.radioLabelDisabled : ''].join(' ')}
            >
              <input
                type="radio"
                name="surface-age"
                value={age.value}
                checked={value.surface_age_id === age.value}
                disabled={!surfaceAgeChangeable}
                onChange={(e) => patch({ surface_age_id: e.target.value })}
              />
              {age.label}
            </label>
          ))}
        </div>
        {!surfaceAgeChangeable ? (
          <p className={styles.fieldNote}>
            This stage doesn’t support changing surface age on rallysimfans.hu — it always runs as “New”.
          </p>
        ) : (
          <p className={styles.fieldNote}>
            Gravel: "New" means no ruts but lots of loose gravel, as if you're the first car on the
            road; "Worn" means ruts have formed but less gravel is loose. Tarmac: "New" means no
            gravel, dirt, or mud has been dragged onto the road yet.
          </p>
        )}
      </FormGroup>

      {/* rbr-rally-creator-web#79: wetness/weather options are per-stage
          (see selectedStage.wetnessOptions/weatherOptions above), so with
          no stage picked yet there's nothing to populate these with --
          showing them disabled-but-empty read as "broken" rather than "not
          applicable yet". Hidden outright until a stage is selected;
          StagePicker's onSelect already seeds both fields from the newly
          picked stage's first option, so they appear already populated
          the moment the fields themselves appear. */}
      {selectedStage && (
        <>
          <FormGroup label="Wetness" htmlFor="modal-wetness">
            <select
              id="modal-wetness"
              value={value.wetness_id}
              onChange={(e) => patch({ wetness_id: e.target.value })}
            >
              {(selectedStage.wetnessOptions ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </FormGroup>

          <FormGroup label="Weather" htmlFor="modal-tracksettings">
            <select
              id="modal-tracksettings"
              value={value.tracksettings_id}
              onChange={(e) => patch({ tracksettings_id: e.target.value })}
            >
              {(selectedStage.weatherOptions ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </FormGroup>
        </>
      )}

      <FormGroup label="Default tyre" htmlFor="modal-tyre">
        <select id="modal-tyre" value={value.def_tyre_id} onChange={(e) => patch({ def_tyre_id: e.target.value })}>
          {options.tyreOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {showWetTyreSuggestion && (
          <div className={styles.tyreSuggestion}>
            <span>Wet conditions &mdash; switch to {suggestedWetTyre}?</span>
            <div className={styles.tyreSuggestionActions}>
              <Button type="button" variant="secondary" size="sm" onClick={() => patch({ def_tyre_id: suggestedWetTyre })}>
                Apply
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setDismissedWetSuggestion(true)}>
                Ignore
              </Button>
            </div>
          </div>
        )}
      </FormGroup>

      <div className={styles.checkboxes}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={value.choose_tyre}
            onChange={(e) => patch({ choose_tyre: e.target.checked })}
          />
          Allow tyre choice
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={value.choose_setup}
            onChange={(e) => patch({ choose_setup: e.target.checked })}
          />
          Allow setup choice
        </label>
      </div>

      <FormGroup label="Service">
        {/* rbr-rally-creator-web#80: opens the same ServiceConfigModal
            the road book's leg-row blue blocks use, rather than keeping
            a separate inline editor here -- one editing surface for
            service, reachable from two entry points. What "opens" means
            belongs to the wrapper (onEditService): the modal overlays
            ServiceConfigModal, the workspace will swap panes (D5). */}
        <ServiceBlock
          variant="summary"
          serviceTime={value.service_time}
          disabled={isLastStage}
          disabledReason={
            isLastStage ? 'Service is disabled on the rally’s final stage (enforced by the site).' : null
          }
          onClick={onEditService}
        />
        {isLastStage && (
          <p className={styles.fieldNote}>Service is disabled on the rally’s final stage (enforced by the site).</p>
        )}
      </FormGroup>

      {/* rbr-rally-creator-web#107 follow-up: contextual shortcuts, only
          while editing an existing stage (PickerWorkspace's stage pane) --
          "keep going without backing out to the sidebar". Rendered as a
          quiet footer rather than mixed into the fields above it, echoing
          how "Change stage" reads as a distinct action from the form
          content it sits above (.stageSummaryRow) rather than a field
          itself. Each shortcut is independently optional (see the props
          comment above) so this whole block simply doesn't render for any
          future non-workspace caller.
          "+ Add service" is disabled on the rally's true last stage --
          normalizeLastStageService (RallyBuilder, on every stagePlan
          change) would just strip whatever it wrote right back out, since
          the site's own rule is there's no next stage left to service
          before. The Service group above already explains this in prose
          when isLastStage; the button's title attribute repeats it briefly
          for anyone hovering the disabled shortcut without scrolling back
          up to re-read the form. */}
      {(onAddService || onAddLeg) && (
        <div className={styles.shortcutRow}>
          {onAddService && (
            <button
              type="button"
              className={styles.shortcutButton}
              disabled={isLastStage}
              title={
                isLastStage
                  ? 'Service is disabled on the rally’s final stage (enforced by the site).'
                  : 'Give this stage a service stop and open it to fine-tune'
              }
              onClick={onAddService}
            >
              + Add service after this stage
            </button>
          )}
          {onAddLeg && (
            <button type="button" className={styles.shortcutButton} onClick={onAddLeg}>
              + Add leg
            </button>
          )}
        </div>
      )}

      {/* rbr-rally-creator-web#141: lets the workspace's stage pane delete
          the stage it's showing, without backing all the way out to the
          road book to find its StageBrick cross (the only other way to
          delete a stage before this). No confirm dialog -- the road book's
          own cross doesn't have one either, relying entirely on
          RoadBook.handleDeleteStage's 5s undo toast, which this reuses
          unchanged (RoadBook.jsx's handleDeleteStageFromWorkspace). */}
      {onDelete && (
        <div className={styles.deleteRow}>
          <button type="button" className={styles.deleteButton} onClick={onDelete}>
            Delete this stage
          </button>
        </div>
      )}
    </>
  );
}
