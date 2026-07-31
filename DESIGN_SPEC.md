# Design spec: the rally as a document

Status: **implemented**. Every piece described below — the document/brick structure and
interaction model, all six UX-review recommendations (duplicate-brick action, hover-revealed
brick controls, sticky leg headings plus per-leg stage-count badges, the readiness banner, the
undo toast, and "duplicate as new draft" for the locked state), and the amber visual language in
`tokens.css` — has landed in `src/`. See README.md's Status section for the current plain-language
rundown of what's built. Kept here as the reference for *why* the current structure looks the way
it does; treat the body below as historical/design record rather than a forward-looking TODO,
except where a line is explicitly flagged as still open.
Created: 2026-07-31 (implementation completed shortly after, see git log)

## Premise

The app currently reads as a stack of separate forms (credentials, rally
basics, car groups, per-leg/per-stage config, job progress). This redesign
reframes the *builder itself* as the artifact you're building: a single,
growing document that looks like a rally program / timing sheet, assembled
piece by piece. There is no separate "form mode" vs "preview mode" — the
document *is* the editing surface.

## Core metaphor

- **Document, not paper.** Structure and hierarchy of a printed rally
  program (file header → one heading per leg → stages listed under each
  leg), but rendered with a technical, digital feel — not skeuomorphic
  paper texture. See "Visual language" below.
- **Lego bits, not a wizard.** You don't move through numbered wizard
  steps. You start with a near-empty document (title + description) and
  add pieces to it one at a time — a car-groups entry, then stages under
  Leg 1, then Leg 2, etc. Every add is an explicit, visible action; the
  document visibly grows with each one.

## Document structure (top to bottom)

1. **Header block** — rally title, description, and car-group selection.
   Car groups live here as a rally-level property (not per-leg), styled
   consistently with title/description, not as its own separate "section
   heading."
2. **Leg heading** — one per leg (`Leg 1`, `Leg 2`, ...), in the same
   heading weight/style as the document header, just nested one level down.
3. **Stage row** — under each leg heading, its stages laid out in a
   horizontal row of "bricks," left to right in stage order. Desktop-first;
   originally spec'd as horizontally-scrolling, but issue #52 replaced that
   with wrapping (`flex-wrap`) — see README.md's Status section for current
   behavior.
4. Repeat 2–3 for every leg. An "add leg" affordance sits at the bottom of
   the document, matching the same brick-adding interaction as stages.

## Adding a piece (the core interaction)

- Every leg's stage row ends in an explicit **`+ Add stage`** brick-shaped
  button.
- Clicking it opens a **modal dialog** with the full stage config form
  (stage picker from catalog, surface wear, wetness, weather, tyre
  compound, service time/mechanics/skill) — reuses the existing
  `StageCatalogPanel` catalog data, just surfaced in a modal rather than a
  permanently visible side panel.
- On save, the modal closes and a new brick appears at the end of that
  leg's row, in **collapsed/summary state**.
- Clicking an existing brick **reopens the same modal**, pre-filled, to edit
  it — one interaction pattern for both add and edit.

### Brick states

- **Collapsed (default):** stage name + surface icon, weather + tyre
  compound. Keep it scannable at a glance — this is the "timing sheet"
  density, not a full field dump.
- **Expanded:** only on click (opens the modal) — no inline expand.

### Reordering / removing bricks

- **Delete (`×`)** control on every brick.
- **Drag to reorder** within a leg's row is the primary interaction.
- **Up/down move controls** are also present on every brick as a
  non-drag-dependent fallback (accessibility, and for anyone who'd rather
  click than drag) — both affordances coexist, they're not
  either/or.
- Adding itself stays click-only (no drag-in-from-catalog) — only
  already-placed bricks are draggable. Real drag-and-drop *creation* from a
  catalog panel (the originally-deferred Phase 3 in issue #1) is still out
  of scope here; this spec doesn't reopen that.

## States

- **Empty document:** just the header block (title/description/car-groups
  fields, empty) and a single "Leg 1" heading with an empty stage row
  showing only the `+ Add stage` brick. No placeholder illustration needed
  — the empty `+` brick itself is the empty state.
- **In progress:** normal editable document, as above.
- **Created / locked:** once a rally job succeeds, the document becomes
  **read-only** — no more add/edit/delete/reorder controls, bricks render
  in a plain locked/summary style. This is a deliberate current-scope
  limitation: editing-and-republishing-as-a-new-event is an explicitly
  planned *future* feature, not built now. When it lands, "locked" should
  become "locked, with a Duplicate-as-new-draft action" rather than fully
  frozen — worth keeping in mind so the locked state doesn't get built in a
  way that's awkward to extend later.

## Job progress: separate screen

Job progress (the Playwright run against rallysimfans.hu) is **not**
layered onto the document view. Keep `JobProgress` as its own distinct
screen/step-list, shown after "Create Rally" is pressed. Simpler to build
and reason about than live-updating bricks mid-automation, and keeps the
document's read/write states unambiguous (editable vs locked) without a
third "submitting" visual state to design for.

## Visual language

- **Motorsport timing-sheet, not paper.** Dense-ish, technical, grid-heavy.
  Think stage timing sheets / entry lists: clear rules/dividers between
  sections, tabular alignment, no soft card shadows or paper texture.
- **Typography: monospace throughout**, including the rally title and
  description — full commitment to the technical/timing-sheet feel rather
  than mixing in a humanist sans for body copy. Flag: verify this stays
  legible for longer free-text description content once real content is in
  place; if description paragraphs feel harder to read in mono at length,
  that's the one place worth revisiting, not a reason to abandon the
  approach elsewhere.
- **Accent color: amber/yellow** (rally-plate / timing-clock amber) as the
  single accent, on top of a neutral ink/background pair. Current
  `tokens.css` accent is a red-orange (`--accent: oklch(55% 0.19 30)`) —
  needs to shift to an amber hue (roughly hue ~85-95 in oklch, keep the
  same lightness/chroma structure) for both the light and dark
  `prefers-color-scheme`/`data-theme` blocks.
- **Both light and dark themes**, using the existing token mechanism
  already in `tokens.css` (`prefers-color-scheme` + `:root[data-theme]`
  override) — no new theming infrastructure needed, just new values for
  `--accent`/`--accent-soft-bg`/`--accent-soft-fg` and a check that ink/bg
  pairs still read as "technical" rather than "warm paper" (may need to
  cool down the current hue-40 ink/bg toward a more neutral or blue-grey
  hue so it doesn't read as parchment).
- **Same visual system app-wide.** Credentials, settings, and job-progress
  screens adopt the same tokens/type/border treatment as the document —
  one cohesive app, not a themed builder bolted onto plain utility screens.

## Scope note

This spec covers the whole app's visual system and the rally-builder's
structure/interaction model. It does **not** cover:
- Drag-and-drop stage *creation* from a catalog (still deferred, per issue
  #1 Phase 3).
- Editing/republishing a created rally as a new event (flagged above as a
  future extension point for the locked state, not built now).
- Mobile/responsive layout — desktop-first by explicit decision; mobile
  just needs to not be actively broken, not a first-class target.

## Open items for implementation planning (resolved, kept for history)

- ~~Exact amber hue/lightness/chroma values for `--accent`~~ — resolved:
  `oklch(58% 0.16 92)` light / `oklch(78% 0.16 92)` dark, in `tokens.css`.
- ~~Whether the modal dialog reuses `StageCatalogPanel`'s existing catalog
  list UI~~ — resolved: `StageConfigModal` has its own simple in-modal
  `StagePicker` (click-to-select list with name/country/surface filters),
  not a reuse of `StageCatalogPanel`. `StageCatalogPanel` (the old
  drag-source side panel from the now-removed drag-onto-slot flow) no
  longer exists in `src/components/` at all — it's been removed, not just
  left unused.
- **Still open**: icon set for surface/weather/tyre glyphs on collapsed
  bricks. `StageBrick` currently renders a first-letter placeholder glyph
  (`G`/`T`/`S` for gravel/tarmac/snow, falling back to the surface's own
  first letter) — not a real icon system.

## UX review notes

Contributed via a UX-expert pass over the spec above. Restated goal: a
rally organizer wants to get a good rally live on rallysimfans.hu with less
tedium than the site's own wizard, while feeling like they're *composing*
something rather than filling out bureaucratic forms. The document/brick
metaphor serves that well for the "feeling in control" half; the notes
below were originally about the tedium half, which the plan hadn't yet
addressed at spec time. **All six recommendations below have since been
built** — tagged `[Done]` inline; left as prose rather than deleted since
it's still the record of *why* each exists.

**[Done] The costliest step in the current plan: one modal per stage, every time.**
A real rally is 4-8 stages across 2-3 legs, and adjacent stages are
frequently near-identical (same surface/wetness/weather/tyre, maybe just a
different stage pick or service time). The spec as written makes every
single one of those a full modal round-trip from a blank form. That's the
engineer's-default flow wearing a costume — "add stage" reads as bespoke
per-brick, but the real usage pattern is closer to "same as the last one,
with one thing changed." Recommend adding a **"Duplicate" action on each
existing brick** (opens the modal pre-filled with that brick's values
instead of blank) alongside the plain `+ Add stage`. Cheap to build, and it
turns the slowest part of building a multi-stage leg into the fastest.
Worth prioritizing over some of the "open items" already listed.

**[Done] Brick control clutter cuts against the "scannable at a glance" goal.**
Drag handle + up + down + delete + click-to-edit is five affordances
competing for space on a card that's also supposed to read cleanly as
"stage name + surface icon + weather + tyre." Recommend collapsing
up/down/delete/drag-handle to reveal on hover (or focus, for keyboard
users) rather than being permanently visible — the brick's resting state
stays a clean data summary, the editing controls appear only when you're
actually interacting with that brick.

**[Done] Long rallies fight the "document" metaphor's own scroll model.** A
3-leg rally means 3 independently horizontally-scrolling rows, stacked
vertically. To review a rally with several legs you're scrolling down
*and* right, repeatedly, and once a stage row overflows you lose the leg
heading's context if you've scrolled it out of view above the fold. Two
cheap mitigations worth adding to scope: make each leg heading **sticky**
while its stage row is mid-scroll, and add a stage-count badge next to the
leg heading (`Leg 2 — 4 stages`) so the row's contents are legible even
before scrolling it into view.

**[Done] The locked state is a dead end for an ordinary mistake, not just a
missing "future feature."** The spec defers edit/republish, which is
reasonable for actually *changing a live rally* — but the gap it leaves is
that a user who notices a typo the moment after their rally locks has no
recourse at all in this app. That doesn't require touching the published
rally on rallysimfans.hu: a **"Duplicate as new draft"** action on a locked
document — clone the local config into a fresh editable document, no
different from a template — is buildable now, at low cost, and removes the
dead end without pulling the deferred edit-and-republish work forward.
Recommend promoting this from "future extension point" to in-scope for
this pass.

**[Done] No undo on brick delete.** Deleting a fully-configured stage (all those
modal fields filled in) is one click, with no confirmation and no way
back except re-entering everything from scratch. Given the modal-heavy
add flow above, an accidental delete is disproportionately expensive to
recover from. A simple "Undo" toast for a few seconds after delete covers
this without needing a full trash/history system.

**[Done] Validation surfacing is under-specified, and "disabled button" alone
isn't an answer.** The existing per-leg stage-count validation guard (from
the NOTES.md history) needs a visible home in this document layout — is it
a banner at the document level, an inline flag on the offending leg
heading, or does it just silently disable "Create Rally"? A disabled
button with no explanation is a classic dead-end moment (the "edge/error"
moment is often what earns or loses trust, more than the happy path).
Recommend a persistent, small "readiness" line at the bottom of the
document (e.g. "Leg 2: stage count doesn't match schedule — fix before
publishing") that's visible without having to guess why the submit action
won't fire.

**[Done] First-time discoverability of the "add pieces to a document" pattern.**
This is not a common web pattern, and the spec's answer — "the empty `+`
brick is the empty state" — leans entirely on the affordance of a plus
sign being obvious. Recommend a lightweight, dismissible ghost-text hint
inside an empty leg row (e.g. "Add your first stage →" pointing at the
brick) rather than a real onboarding flow. Cheap, self-removing once the
row has content, doesn't require a tour or modal of its own.

**Safe to ship now vs. worth prototyping first:** the duplicate-brick
action, sticky leg headings, hover-revealed brick controls, and the
readiness banner are all low-cost and safe to build directly into this
pass. The undo-toast and the locked-document "duplicate as new draft"
action are slightly bigger (need a small amount of new state/history
handling) but still well within scope — worth including rather than
punting, since both close real dead-ends rather than adding polish.
