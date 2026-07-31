# Architecture reference

Precise, code-verified inventory of this frontend, kept as a prompting reference — file:line
citations so future work can point at exact locations instead of re-deriving them. Update this
when component boundaries or data flow change shape; day-to-day feature status still belongs in
README.md's Status section, not here.

**Read this before assuming a filed issue landed cleanly.** Two documented-vs-actual gaps have
already been found and are exactly the shape of bug that makes fixes not "stick": a UI control
that implies a feature works while nothing consumes its value (see Known rough edges below).

## File/component map

**Root** — `App.jsx` (owns `baseUrl`, credential state, `activeRally`, `sidebarOpen`),
`main.jsx`, `index.css`, `styles/tokens.css` (design tokens, light/dark).

**`src/lib/`**
- `authApi.js` / `rallyApi.js` — fetch wrappers for the two backend surfaces (auth vs.
  catalog/rally/job). Near-duplicate `request()` helpers — not shared between the two files.
- `rallyPlan.js` — stage/leg plan math, Stockholm-time helpers, shared constants
  (`MAX_LEG_SPAN_DAYS`, `MAX_LEGS`, `MIN_LEG_LEAD_MINUTES`, `CLAMP_LEG_LEAD_MINUTES` — all
  **best-guess, not confirmed live boundaries**, mirrored independently in the backend's
  `legTimeRules.js`).
- `rallyStorage.js` — `rbr.currentDraft` (autosave) + `rbr.rallies` (named history).
- `settings.js` — `rbr.baseUrl` override (devtools-only escape hatch, no Settings UI).
- `stageConfigDraft.js` / `stagePickerFilters.js` — localStorage persistence for in-progress
  stage-editor state.

**`src/components/`** — one dir per component (`.jsx` + `.module.css`): `CarGroupPicker`,
`CredentialForm`, `CredentialStatus`, `JobProgress`, `RallyBasicsForm`, `RallyBuilder` (the real
state owner, see below), `RallySidebar`, `ReadinessBanner`, `RoadBook`, `ServiceBlock`,
`ServiceConfigModal`, `StageBrick`, `StageConfigModal` (has an inline `StagePicker`), `Toast`.

## Component tree & data flow

```
App.jsx (state: baseUrl, credState, activeRally, sidebarOpen)
├─ CredentialForm / CredentialStatus        — presentational, fire onSubmit/onClear
├─ RallyBuilder (key=activeRally.id)        — owns nearly all rally-building state
│  ├─ RallyBasicsForm                       — presentational, fires onChange(nextValue)
│  ├─ CarGroupPicker                        — local UI state only (filters/open), OK by convention
│  ├─ RoadBook                              — owns transient UI state (drag/modals/undo);
│  │  │                                        business logic (merge-on-remove, undo-splice)
│  │  │                                        arguably belongs one level up, worth a look
│  │  ├─ StageBrick                          — pure
│  │  ├─ StageConfigModal                    — ⚠ reaches into localStorage directly
│  │  │  └─ ServiceConfigModal               — pure, patches local draft only
│  │  └─ ServiceConfigModal (sibling instance, opened from leg-row ServiceBlock)
│  ├─ ReadinessBanner / JobProgress / Toast  — pure
└─ RallySidebar (mounted only while open)    — ⚠ reaches into localStorage directly
```

**Stated convention** (README.md): only `App.jsx` and `RallyBuilder.jsx` touch
`fetch`/`localStorage`; every other component is props-in/callbacks-out. **Two real violations**,
neither flagged anywhere as an approved exception:
- `RallySidebar.jsx` calls `listRallies`/`deleteRally` from `rallyStorage.js` directly.
- `StageConfigModal.jsx` (and its inline `StagePicker`) calls
  `loadStageConfigDraft`/`saveStageConfigDraft`/`clearStageConfigDraft` and
  `loadStagePickerFilters`/`saveStagePickerFilters` directly.

Both work functionally — this is architecture drift, not a bug — but it means the README's
component-convention description is not what the code actually does, which matters if you're
prompting off that doc.

## Core lib exports

**`rallyPlan.js`**: `generateUid`, `createDefaultStageConfig`, `cloneStageConfigWithNewUid`,
`getDefaultTyreForSurface`/`getWetTyreForSurface`, `toDatetimeLocalValue`, `stockholmNow`,
`MAX_LEG_SPAN_DAYS`/`MAX_LEGS`/`MIN_LEG_LEAD_MINUTES`/`CLAMP_LEG_LEAD_MINUTES`,
`isLegOpenTimeTooSoon`, `clampLegTimes` (duplicates backend's `normalizeLegTimes` by hand),
`createStageConfigFromPrevious`, `computeLegStageRanges`, `normalizeLastStageService`,
`SERVICE_TIERS`/`getServiceTier`, `parseStageKm`/`sumStagePlanKm`/`formatKm`.
`distributeStagesEvenly` is exported but **dead code** — zero callers, leftover from the
pre-"Lego bits" manual stage-count model.

**`settings.js`**: `getBaseUrl` (used, App.jsx), `setBaseUrl`/`hasBaseUrl` (exported but
**unreachable through any UI** — only callable manually via devtools).

**`rallyStorage.js`**: `getCurrentDraft`/`setCurrentDraft`/`clearCurrentDraft` (RallyBuilder),
`listRallies`/`getRally`/`saveRally`/`deleteRally` (RallyBuilder + RallySidebar — see violation
above).

**`rallyApi.js`**: `getStages`, `getCarGroups`, `getCars`, `getRallyOptions`, `createRally`,
`getJobStatus`, `cancelJob` — all called only from RallyBuilder.

**`authApi.js`**: `saveCredentials`, `getCredentialsStatus`, `clearCredentials` — App.jsx only.

## State & persistence

**React state** lives almost entirely in `RallyBuilder.jsx`: `stages`, `carGroups`, `cars`,
`rallyOptions`, `rallyBasics`, `carGroupIds`, `stagePlan`, `legSchedule`, `jobId`/`job`,
`submitting`, `dryRun`, `cancelRequested`, plus UI-only bits (`savedNotice`, toast visibility).

**localStorage keys:**

| Key | Written by | Shape |
|---|---|---|
| `rbr.baseUrl` | `settings.js` | plain string |
| `rbr.currentDraft` | `rallyStorage.js` | `{updatedAt, payload:{rallyBasics,carGroupIds,stagePlan,legSchedule}}` |
| `rbr.rallies` | `rallyStorage.js` | `[{id,title,updatedAt,payload}]` |
| `rbr.stageConfigDraft` | `stageConfigDraft.js` | `{mode,targetUid,draft,savedAt}` |
| `rbr.stagePickerFilters` | `stagePickerFilters.js` | `{country,surface}` |

**Draft restore**: on mount, catalog fetch runs first; if not opening a saved rally
(`!initialPayload`), each field of `getCurrentDraft()` is merged independently and defensively.
Autosave is 400ms-debounced, gated on `!loading && job?.status !== 'succeeded'`. Cleared on job
success and on "New Rally".

## Backend integration surface

All requests via `rallyApi.js`/`authApi.js`, `credentials: 'include'` for the cross-site httpOnly
cookie.

| Endpoint | Caller | Notes |
|---|---|---|
| `/auth/credentials` POST/GET/DELETE | App.jsx | `clearCredentials` ignores fetch failure, always sets `unsaved` client-side |
| `/catalog/{stages,car-groups,cars,rally-options}` GET | RallyBuilder mount | `Promise.all`'d, **all-or-nothing** — one failure blanks the whole builder, no partial degrade/retry |
| `/rallies` POST | RallyBuilder `handleCreateRally` | error paths use `alert()`, inconsistent with the rest of the app's toast/banner UI |
| `/jobs/:id` GET | RallyBuilder poll (2s) | merges into `job` state |
| `/jobs/:id` DELETE | RallyBuilder `handleCancelJob` | fire-and-forget, poll loop is source of truth |

### `POST /rallies` payload — data completeness (audited against backend consumption)

Every field the backend's `rallyWizard.js` actually reads was checked against what this frontend
sends, one by one:

| Field | Status |
|---|---|
| `stagePlan[i].wetness_id` | sent correctly |
| `stagePlan[i].tracksettings_id` | sent correctly |
| `stagePlan[i].hidden_name` | **fixed** — was entirely unsent (no UI existed); now wired via `StageConfigModal`'s "Hidden stage name" field, shown only when `rallyBasics.hidden_stage_name` is checked |
| `stagePlan[i].choose_tyre`/`choose_setup` | sent correctly |
| `legSchedule[i].start_stage_no` | sent correctly, derived from `computeLegStageRanges` |
| `rallyBasics.password1`/`password2` | sent correctly; **match validation fixed** — was previously never compared client-side |
| Last-stage forced "No Service" | sent correctly, frontend-enforced via `normalizeLastStageService`; **backend does not enforce this itself** — a corrupted payload or future frontend regression bypassing `RallyBuilder`'s `updateStagePlan` funnel would sail through unchecked |

## Known rough edges

- **Stale docs (fixed 2026-08-01)**: `DESIGN_SPEC.md`/README both claimed the stage row "scrolls
  horizontally" — it was changed to `flex-wrap` by issue #52/#55, well before this doc's edit. If
  you're working from an older mental model of this doc, re-check current behavior in
  `RoadBook.module.css` rather than DESIGN_SPEC.md's original prose.
- **`hidden_name` gap (fixed 2026-08-01)**: the backend has a working per-stage public name field
  (`rallyWizard.js` fills RSF's own `#stage_name`), but the frontend had zero UI for it and a
  comment incorrectly asserted RSF "has no per-stage custom-name mechanism at all" — confusing it
  with the unrelated, client-only `_label` nickname field. This is the clearest concrete example
  of "planned/triaged but never actually wired to state."
- **Password confirmation gap (fixed 2026-08-01)**: two password fields existed in the UI implying
  a match check that never ran.
- **No tests anywhere** in the repo — `npm run lint` + `npm run build` are the only CI gates. The
  leg/stage-range math in `rallyPlan.js` and the drag/merge/undo logic in `RoadBook.jsx` are
  untested despite being the most intricate code in the app.
- **Cross-site cookie auth is unverified** — README's own "Known risk" section flags Safari
  ITP/strict tracking protection as untested against the actual auth mechanism.
- **Duplicated leg-time constants** between this repo's `rallyPlan.js` and the backend's
  `legTimeRules.js` — no shared source of truth, manual sync required.

## Recurring pain point (from git history)

Several issues have needed a second pass after being marked fixed: issue #84 (form padding) was
fixed via two separate PRs before it actually stuck; issue #64 (stage nickname) was implemented,
then reworked after review; issue #43 → #52 fully reversed the stage-row's scroll-vs-wrap
approach without the design docs being reconciled until this pass. When prompting for a fix,
prefer citing the exact component/line from this doc over the issue number alone — the issue
history alone hasn't been a reliable signal that the fix actually landed end-to-end.
