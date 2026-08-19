# 07 — Picker workspace: persistent sidebar + swap-in-place editing

Working doc for redesign item 7. Branch: `redesign-7-picker-sidebar`. The behavior interview
happened **2026-08-06** — outcomes in §4 (Decisions); questions the user delegated back to us
live in §5 as "defaults chosen, revisit if wrong". Sibling idea **#1** (click-a-stage-in-picker
adds it to the leg) is absorbed by this design (D2/D3); **#2** turned out to mean next/previous
*leg* and is deferred (D7).

---

## 1. Current-state map

### How StageConfigModal is opened and parameterized

RoadBook owns a single modal slot, `modalState` (`RoadBook.jsx:145`), shape
`{ mode, legIndex, uid, initialValue, willBeLastStage, stageNumber }`:

- **Add**: `openAddModal(legIndex)` (`RoadBook.jsx:624-646`) — `mode: 'add'`, `uid: null`,
  `initialValue` seeded via `createStageConfigFromPrevious(stagePlan[endIndex - 1])`
  (`rallyPlan.js:324`) from the stage that will precede the new one.
- **Edit**: `openEditModal(legIndex, uid)` (`RoadBook.jsx:648-657`) — `initialValue` is the live
  stagePlan entry (`stageByUid.get(uid)`).
- `willBeLastStage` and `stageNumber` are **frozen at open time** — computed once from the plan
  as it stood when the modal opened. Fine today (the plan can't change while the modal is up);
  a workspace that adds/switches stages while open must derive these live instead.

The modal renders only while `modalState` is non-null (`RoadBook.jsx:1048-1060`) — **mounted per
open, unmounted on close**. That mount/unmount cycle is itself the reset mechanism (see §2,
key-remount pattern).

### What the modal owns vs. receives

Receives: `mode, initialValue, stages` (catalog), `options`, `isLastStage`, `stageNumber`,
`hiddenStageNameEnabled`, `onSave`, `onCancel` (`StageConfigModal.jsx:255-265`).

Owns (all local, all lost on unmount unless saved):

- `draft` — the working copy of one stage config (`StageConfigModal.jsx:266`). Every field edit
  goes through `patch()` (`:326`). **Nothing touches stagePlan until Save.**
- `restoredFromDraft`, `dismissedWetSuggestion`, `serviceModalOpen` (`:267-281`).
- The embedded `StagePicker` (`StageConfigModal.jsx:30-224`) additionally owns its filter state;
  its country/surface filters are scoped to the currently-edited stage **once, at mount**
  (mount-only `useMemo`, `:41`) — another dependency on the per-open remount.
- Picker card click = `onSelect(id)` → patches `stage_id` + tyre/wetness/weather defaults onto
  the draft (`:409-427`). Clicking a card today *re-targets the current draft*; it never adds a
  stage. This is the exact behavior idea #1 wants to change/extend.

### Save flow

```
StageConfigModal.handleSave (:365)          clearStageConfigDraft(); onSave(draft)
        │
        ▼
RoadBook.handleModalSave (RoadBook.jsx:663-683)
   mode 'edit':  onStagePlanChange(map: replace entry with matching _uid)
   mode 'add' :  splice config at legRanges[legIndex].endIndex
                 + onLegScheduleChange(stage_count + 1 on that leg)
   then closeModal()
        │
        ▼
RallyBuilder.updateStagePlan (RallyBuilder.jsx:118-120)
   setStagePlan(normalizeLastStageService(next))     ← business rule enforced here
        │
        ▼
debounced currentDraft autosave to localStorage (RallyBuilder.jsx:329-335)
```

`Save` is disabled until `draft.stage_id` is set (`StageConfigModal.jsx:388, :595`) — this is
what guarantees no brick ever exists without a picked stage (RallyBuilder relies on it,
`RallyBuilder.jsx:549-553`).

### Single-slot draft recovery (`stageConfigDraft.js`)

- Every draft change is written immediately to localStorage key `rbr.stageConfigDraft` as an
  envelope `{ mode, targetUid, draft, savedAt }` (`StageConfigModal.jsx:309-316`).
- On first mount only (`hasCheckedStorageRef`, `:291-304`), a saved envelope is restored **if**
  mode matches and (for edit) `targetUid === initialValue._uid`, **and** the draft shows real
  progress (`saved.draft?.stage_id`). Restore shows a banner with "Discard & start fresh".
- Cleared on Save, Cancel, Back, and Escape alike (`:321-324, :365-369`).
- **Deliberately one slot** — the file's own comment (`stageConfigDraft.js:9-23`) justifies this
  with "the editor is mounted/unmounted per open... only ever one abandoned in-progress edit".
  A workspace where several entries can be dirty at once breaks that premise.

### ServiceConfigModal nesting

Two independent entry points, both rendering the same component:

1. From inside StageConfigModal ("Service" summary button → `serviceModalOpen`,
   `StageConfigModal.jsx:281, :605-617`): saving **patches the local draft only**; stagePlan is
   untouched until the outer Save.
2. From a RoadBook leg-row ServiceBlock (`serviceModalState`, `RoadBook.jsx:152, :691-714`):
   saving writes the three service fields straight onto the stagePlan entry.

ServiceConfigModal itself is dumb: takes `value`, returns `{ service_time, nummechanics,
mechanicsSkill }` via `onSave`, never touches stagePlan (`ServiceConfigModal.jsx:26`).

### New primitives (landed on main, commit b4d776d)

- `Modal` (`src/components/Modal/Modal.jsx:23`) — two variants: `takeover` (full-page layer,
  StageConfigModal's shape) and `overlay` (scrim + centered card, ServiceConfigModal's shape).
  Escape/focus chrome via `useDialogChrome`. z-index ladder is variant-bound: overlay stacks
  above takeover, which is exactly the nesting the workspace needs to keep.
- `Button` (`src/components/Button/Button.jsx`) — variant/size/className, everything else
  forwarded. No default `type`.
- `FormGroup` / `FormActions` (`src/components/FormGroup/FormGroup.jsx`) — label-above-control
  stack + right-aligned actions row; both config modals already use them, so an extracted
  entry-editor form keeps its look for free.

---

## 2. Constraints to respect

1. **Document of bricks** (`rallyPlan.js`): `stagePlan` is one flat array; each entry carries a
   client-only `_uid` (`rallyPlan.js:10`) that is dnd-kit identity and undo identity — stripped
   before submit (`RallyBuilder.jsx:412`). Legs are *not* containers: `legSchedule[i].stage_count`
   slices the flat array via `computeLegStageRanges` (`rallyPlan.js:367`). Any "add stage to leg
   N" therefore means: splice into stagePlan at that leg's `endIndex` **and** bump that leg's
   `stage_count` — both, atomically (the pattern in `handleModalSave`, `RoadBook.jsx:674-679`).
2. **Last stage never has service**: `normalizeLastStageService` (`rallyPlan.js:385`) runs inside
   RallyBuilder's `updateStagePlan` on *every* stagePlan mutation. Corollary: as long as all
   mutations flow through `onStagePlanChange`, the workspace gets this rule for free; a
   working-copy design must re-apply it itself. Also: "is this entry the last stage" changes
   whenever the workspace adds a stage — must be derived, not frozen at open (unlike today's
   `willBeLastStage`).
3. **Key-remount reset pattern**: the app resets component state by remounting, not by effects —
   App remounts RallyBuilder via `key={activeRally?.id ?? 'new'}` (`App.jsx:137`);
   StageConfigModal resets by being unmounted per open; StagePicker's mount-only filter scoping
   (`StageConfigModal.jsx:41`) depends on it. A swap-in-place detail pane keeps this pattern by
   keying the pane on the selected entry's identity (`key={selectedUid}`) so switching entries
   remounts the editor with clean local state.
4. **Draft persistence semantics**: two layers — the committed plan autosaves as `currentDraft`
   (debounced, `RallyBuilder.jsx:329`), the in-flight editor draft as the single-slot
   `rbr.stageConfigDraft`. The single-slot design is only valid while at most one entry can be
   dirty — resolved by D1: obsolete inside the fully-live workspace (see §4 and R2).
5. **dnd-kit ordering lives in RoadBook**: reorder, cross-leg moves, service-block drags, and
   drag-to-delete all operate on the live stagePlan through the same callbacks
   (`RoadBook.jsx:441-614`). The workspace must not fork ordering state; if the sidebar ever
   reorders, it should emit the same `onStagePlanChange`/`onLegScheduleChange` shapes.
6. **RoadBook owns all stagePlan mutations today** (add/edit/delete/undo/service writes), and
   RallyBuilder owns the state itself. Undo (single-slot toast, `RoadBook.jsx:178`) and the
   leg-remove flow live there too. The less the workspace duplicates of this, the better.

---

## 3. Architecture options

> **Interview outcome**: Option C confirmed — framed as a "smarter modal", NOT a full workspace
> takeover; the road book page stays the primary editing surface. The unsaved-edits crux below
> is superseded by **D1** in §4 (the detail pane went fully live — no per-entry Save at all).
> Analysis kept for the record.

The crux for all options: **what happens to unsaved edits when the user clicks another sidebar
entry** (or hits next/prev — same event). The candidate policies, referenced below:

- **P1 Autosave-on-switch**: switching commits the current draft as if Save was pressed. Simple,
  matches "the rally is one document you're walking through". Wrinkle: an `add`-mode entry with
  no `stage_id` yet *cannot* be committed (violates the no-brick-without-stage invariant) — must
  be silently dropped, kept as a ghost row, or block the switch.
- **P2 Prompt**: "Save / discard / stay" dialog on switch when dirty. Safe but adds friction to
  exactly the fluid browsing the redesign is for; next/prev (#2) becomes prompt spam.
- **P3 Per-entry draft map**: workspace keeps `Map<entryKey, draft>`; switching just stashes;
  sidebar marks dirty entries; commit happens per-entry Save or all-at-once on close. Most
  flexible, most new machinery, and multiplies the draft-recovery story.

### Option A — StageConfigModal grows the sidebar in place

Keep one component; add `stagePlan`/`legSchedule` props, a sidebar column, and internal
`selectedEntry` state; keep `onSave`-per-entry to RoadBook, which stays mutation owner. Save no
longer closes; "Back to rally" does.

- **State**: RallyBuilder owns the plan (unchanged); the modal owns selection + one draft.
- **Unsaved edits**: any of P1-P3 fits; P1 is the natural match.
- **#1 / #2**: add-from-picker needs a new callback (`onAddStage(legIndex, config)`); next/prev
  is just "select the adjacent sidebar entry".
- **Size**: medium, but StageConfigModal is already ~620 lines doing three jobs (takeover chrome,
  picker, form); growing it further makes the file worse, and the mode/initialValue/isLastStage
  prop contract fights the new "many entries" reality (frozen `stageNumber`/`isLastStage` props
  have to become derived anyway).

### Option B — Workspace owns a working copy, wholesale commit on close

New top-level component takes a snapshot of `stagePlan`+`legSchedule`, edits freely (selection,
per-entry edits, adds), and commits both arrays on "Back to rally" (or discards on cancel).

- **State**: workspace owns a full fork of the plan while open.
- **Unsaved edits**: switching is free (everything is uncommitted anyway) — effectively P3 with
  the whole plan as the draft.
- **#1 / #2**: trivial — mutate the working copy directly.
- **But**: forks every invariant. `normalizeLastStageService` must be re-applied inside the
  workspace; the sidebar shows a plan the road book behind it doesn't have; the debounced
  `currentDraft` autosave (`RallyBuilder.jsx:329`) doesn't see workspace edits, so a mid-edit
  refresh loses *everything* unless a second whole-plan draft layer is built; "cancel discards
  20 minutes of browsing/editing" is a foot-gun; undo/delete semantics diverge from RoadBook's.
  Largest change, most duplicated logic.

### Option C — New `PickerWorkspace` component, commit-per-entry through RoadBook (**recommended**)

Split rather than grow: extract StageConfigModal's form body (draft, `patch`, wet-tyre
suggestion, nested ServiceConfigModal, picker) into a reusable **`StageEntryEditor`**; build a
new **`PickerWorkspace`** (takeover `Modal`) = sidebar + detail pane hosting
`<StageEntryEditor key={entryKey} ...>`. RoadBook renders PickerWorkspace instead of
StageConfigModal and stays the sole mutation owner — the workspace is a *controlled* view over
the live `stagePlan`/`legSchedule` props and emits granular callbacks:

```
RallyBuilder ── stagePlan/legSchedule ──► RoadBook ── props ──► PickerWorkspace
     ▲                                        ▲                    │  sidebar (legs/stages/service rows)
     │                                        │                    │  detail pane: StageEntryEditor key={uid}
     └── updateStagePlan ◄── onUpdateStage(uid, cfg) ◄─────────────┤
         (normalizeLastStageService)  onAddStage(legIndex, cfg) ◄──┘
```

- **State**: RallyBuilder keeps the plan; RoadBook keeps mutations; workspace owns only
  `selection` + delegates one live draft to the keyed editor. Sidebar always renders committed
  truth (fed by live props), so every rule — normalization, stage numbering, last-stage — stays
  correct with zero duplication.
- **Unsaved edits**: originally recommended P1 autosave-on-switch with a per-entry Save kept as
  "commit + stay". **Superseded by D1**: the interview went one step further — the pane is fully
  live, every edit applies as it's made, and no per-entry Save exists at all. Same ownership,
  just a higher commit frequency: `onChange` → `onUpdateStage` instead of Save → `onUpdateStage`.
- **#1**: picker card click calls `onAddStage(legIndex, config)` — the new brick appears in the
  sidebar immediately (it's committed state). Click semantics resolved: **D2-D4** (click always
  adds, targets the selected entry's leg, lands at end of leg).
- **#2**: resolved as next/previous *leg*, deferred (D7) — sidebar navigation likely covers it.
- **Size**: medium-large but mostly *moving* code: StageEntryEditor is today's form body nearly
  verbatim; PickerWorkspace is new but thin (sidebar list + selection + callback plumbing);
  RoadBook changes are small (replace modalState open/save with workspace open + two callbacks —
  `handleModalSave`'s two branches become `handleUpdateStage`/`handleAddStage`).

**Why C over A**: same ownership story, but the seams land where the new design needs them
(entry editor reusable, keyed remount natural, old StageConfigModal can stay alive during the
transition as a thin wrapper around StageEntryEditor — which is what makes phased,
behavior-flagged delivery cheap). **Why C over B**: B trades every established invariant and
both persistence layers for freedom we don't need if switching commits eagerly.

---

## 4. Decisions (interview, 2026-08-06)

**Architecture confirmed: Option C** — but framed as a "smarter modal", NOT a full workspace
takeover. The road book page remains the primary editing surface; the workspace is the nicer
in-modal experience (`PickerWorkspace` + `StageEntryEditor` extraction, all mutations flowing
through RoadBook callbacks).

- **D1 — The detail pane is LIVE (resolves Q1, Q10, Q11).** No per-entry Save button. Every edit
  auto-applies silently to the plan as it's made, through the same RoadBook callbacks.
  Consequences:
  - Switching sidebar entries never has anything pending — the Q1 policy question dissolves.
  - "Back to rally" is the only exit and is always non-destructive: nothing to save, nothing to
    discard, no Cancel. (This reconciles the doc's earlier "Save = commit + stay" leaning:
    there is no Save at all.)
  - The single-slot `stageConfigDraft` recovery is **obsolete for workspace editing** — every
    change lands in stagePlan, which the debounced `currentDraft` autosave already persists
    (`RallyBuilder.jsx:329-335`). See R2 and Phase 3.
  - Sub-behaviors that used to patch the local draft (wet-tyre "Apply", the service fields) now
    patch the committed entry directly.
- **D2 — Picker card click ALWAYS adds a new stage brick (resolves Q3; absorbs sibling idea
  #1).** Clicking a card never re-targets an existing entry; no context-dependent click.
  Replacing an existing entry's stage becomes an explicit "change stage" affordance on the
  entry itself. Useful consequence: bricks are born complete — `stage_id` is known at click
  time (config seeded `createStageConfigFromPrevious`-style from the stage before the insert
  point), so the old "add-mode entry with no stage picked" problem (Q2) evaporates: there is no
  blank-draft phase, and the no-brick-without-stage invariant (`RallyBuilder.jsx:549-553`)
  holds by construction.
- **D3 — Adds target the SELECTED entry's leg (resolves Q4, Q12).** Sidebar selection acts as
  the cursor. The workspace opens with the origin context selected (the clicked entry, or the
  origin leg's context when opened from "+ Add stage"), so before any navigation, adds land in
  the leg the picker was opened from — exactly idea #1's original behavior.
- **D4 — Placement within the leg: end of leg (resolves Q5).** Same splice as today's add
  branch (`RoadBook.jsx:674-679`). No strong reason found to deviate.
- **D5 — Service edits in-pane (resolves Q6).** Clicking a service row swaps the detail pane to
  a service form (ServiceConfigModal's form content, live/auto-apply). No ServiceConfigModal
  overlay inside the workspace.
- **D6 — v1 sidebar is NAVIGATION-ONLY (resolves Q8, Q13, Q14).** Drag-to-reorder and add
  buttons (per-leg "+ stage", "+ leg") are confirmed wanted, but as later, additive phases
  (see Phase 4). Delete-from-sidebar is explicitly OUT — not selected. **Superseded in part
  by rbr-rally-creator-web#141**: the sidebar itself still has no delete row (that half of D6
  stands), but the stage editor pane now has a "Delete this stage" affordance — issue #141
  found that with no delete path inside the workspace at all, the only way to remove a stage
  was to back all the way out to the road book's own StageBrick cross. Reuses
  RoadBook.handleDeleteStage unchanged (same undo toast), so it isn't a second delete path.
- **D7 — Next/prev deferred (resolves Q9; closes sibling idea #2).** The original idea turned
  out to be next/previous LEG, not stage, and the user expects the sidebar to cover it.
  Revisit after v1 — likely already satisfied by sidebar navigation.
- **D8 — World map is a standalone explore view (resolves Q17).** Not part of item 7.

Wider-interview context — **separate issues, not this branch's scope**: a new GREEN
`--highlight` ramp for constructive actions; super-rally toggle pulses blue when off / solid
when on; readiness banner becomes dark orange with jump-links + 2s pulse-fade section glow.

---

## 5. Risks / unknowns (updated post-interview)

Risks:

- **R1** (updated for D1) A live pane has no Cancel — a fat-fingered edit commits instantly
  with no escape hatch. Accepted: road-book-level edits (drag reorder, service drag,
  clear-service) already behave this way. If it bites, the remedy is an undo affordance, not a
  return of Save/Cancel.
- **R2** (resolved by D1) `stageConfigDraft` recovery is obsolete inside the workspace — every
  edit lands in stagePlan, which `currentDraft` already autosaves. Removed in Phase 3; it must
  survive only as long as the old modal path does.
- **R3** `StagePicker`'s mount-scoped filters and the wet-suggestion reset assume one entry per
  mount — keying the editor per entry preserves this. Under D2 the picker is add-oriented, so
  its filter context follows the pane's context key, not an edited stage.
- **R4** Adding a stage at the end makes the previously-last stage service-eligible again
  (normalize only strips, never restores) — silent behavior change the user may not notice
  (defaults item 4).
- **R5** Frozen `stageNumber`/`isLastStage` props: every consumer (nickname placeholder, service
  disable, service form title) must move to live derivation.
- **R6** (new, from D2) The "change stage" replace flow must swap `stage_id` and its dependent
  defaults (tyre/wetness/weather) in one atomic patch — transiently nulling `stage_id` would
  violate the no-brick-without-stage invariant the rest of the app assumes.
- **R7** (new, from D1) Live per-keystroke commits flow through RallyBuilder's debounced
  `currentDraft` autosave — fine — but also mean text fields (nickname, hidden name) re-render
  the whole plan tree per keystroke. Watch for perf on large plans; memoize sidebar rows if
  needed.

### Open — defaults chosen, revisit if wrong

The interview delegated these back to us; the defaults below are what the phases will build
unless overridden. (Original questions Q1-Q17 are resolved in §4; only the delegated remainder
lives here.)

1. **Detail pane content in "add" context** (workspace opened from "+ Add stage", or an empty
   leg selected): default — the pane shows the picker prominently, scoped to the target leg
   ("add your first stage" framing when the leg is empty). Selecting an existing entry swaps to
   its form; each leg context keeps a way back to the picker view (sidebar "add" row or pane
   header affordance).
2. **"Change stage" affordance shape** (fallout of D2): default — a "Change stage" button on
   the stage entry form that opens the picker in a one-shot replace mode for that entry; the
   pick patches `stage_id` + dependent defaults atomically (R6), then returns to the form.
3. **Service rows for unassigned stages** (old Q7): default — sidebar shows service rows only
   for *assigned* services; unassigned stages reach the in-pane service editor via their own
   entry form's Service group (same D5 pane swap). Keeps the sidebar quiet; the rally's true
   last stage shows no service affordance at all.
4. **Last-stage service re-eligibility on append** (old Q15): default — stay silent in v1.
   `normalizeLastStageService` already handles the forced-off direction and the sidebar makes
   current state visible; revisit if it confuses.
5. **Ghost rows for uncommitted adds** (old Q2): moot under D2 — bricks are born complete, so
   uncommitted adds don't exist. Nothing to build; noted for the record.
6. **Narrow viewport** (old Q16): default — sidebar collapses to a toggleable drawer;
   desktop-first, v1 not blocked on it.
7. **Keyboard navigation** (remnant of old Q9): default — none in v1 beyond natural focus
   order; sidebar entries are buttons, so Tab/Enter works for free.

---

## 6. Draft task breakdown (updated for decisions)

Gate for every phase: `npm run lint` && `npm test` && `npm run build` all pass; the *current*
picker flow still works until the flag flips. Flag: a single
`PICKER_WORKSPACE = false` constant (module-level in RoadBook, or `settings.js` if we want a
runtime toggle for dogfooding) chooses which component `modalState` renders.

- **Phase 0 — extraction refactor (no behavior change, no flag needed)**
  - Extract `StageEntryEditor` as a *controlled* form — `(value, onChange, ...)`, no internal
    draft. The existing `StageConfigModal` keeps its draft state, Save/Cancel, and
    `stageConfigDraft` persistence *around* it, so today's behavior stays byte-identical.
  - Extract `StagePicker` to its own file (it's 200 lines of the 620); extract
    ServiceConfigModal's form body the same controlled way (`ServiceEntryForm`) so D5 can host
    it in-pane later, with ServiceConfigModal wrapping it unchanged.
  - Tests: existing suite green; manual smoke of add/edit/draft-restore.

- **Phase 1 — live workspace behind flag (D1, D3, D5, D6)**
  - New `PickerWorkspace`: takeover `Modal`; navigation-only sidebar (legs as headers via
    `computeLegStageRanges`, stage rows, assigned-service rows per defaults item 3); detail
    pane hosts `<StageEntryEditor key={uid}>` or `<ServiceEntryForm key={...}>` per selection,
    **fully live** — every `onChange` flows to RoadBook's new `handleUpdateStage(uid, config)`
    (split from `handleModalSave`; the service pane reuses `handleServiceModalSave`'s write
    shape).
  - Selection state + open-with-origin-context (D3); `stageNumber`/`isLastStage` derived live
    (R5). No Save/Cancel in the pane; header keeps "Back to rally" only.
  - Tests: unit-test the selection/entry-key model and the update-callback math (pure helpers
    where possible, in `rallyPlan.js` style).

- **Phase 2 — picker adds + change-stage (D2, D4)**
  - Picker card click → `handleAddStage(legIndex, config)` targeting the selected entry's leg,
    end of leg; the new brick appears in the sidebar immediately and becomes the selection
    (default; cheap to change).
  - "Change stage" affordance on the stage entry form (defaults item 2), atomic swap (R6).
  - Verify R4's default (silent) — normalization behaves, nothing surprising in the sidebar.

- **Phase 3 — flag flip + cleanup** ✅ done
  - Flip `PICKER_WORKSPACE` on by default; delete the old StageConfigModal chrome path, the
    flag, and `stageConfigDraft.js` + its call sites once nothing edits through the old modal
    (R2/D1).

- **Phase 4 — sidebar powers (later, additive; confirmed wanted per D6)** ✅ done
  - Per-leg "+ Add stage" button on every leg header (same add-target the leg row's own click
    already opens) and a single "+ Add leg" button at the bottom of the sidebar list, both
    reusing the existing `onAddStage`/`onAddLegFromWorkspace` callbacks.
  - Drag-to-reorder for sidebar stage rows: same-leg reorder and cross-leg move, full parity
    with RoadBook's own drag behavior. `applyReorderStage` (`pickerWorkspace.js`) mirrors
    `RoadBook.jsx`'s `handleDragEnd` container/`arrayMove`/splice math as a pure, unit-tested
    helper; `RoadBook.handleReorderStage` wraps it and routes the result through
    `onStagePlanChange`/`onLegScheduleChange` (constraint 5), so `normalizeLastStageService`
    still applies to every sidebar reorder the same way it does to every other plan edit.
    Service rows are intentionally not draggable in this phase (RoadBook's service-block drag
    is a separate, more involved mechanic left untouched).

All five phases are now complete — the picker-workspace redesign (#107) is fully shipped.

- **Deferred (D7)**: next/previous *leg* navigation — revisit after v1; sidebar likely already
  satisfies it. Delete-from-sidebar stays out entirely (D6).

Verification for the doc itself: none needed (planning only). For each phase:
`npm run lint && npm test && npm run build` — passing = oxlint silent, vitest all green,
vite build completes.
