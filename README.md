# rbr-rally-creator-web

[rallysimfans.hu](https://rallysimfans.hu) (RSF) is where the sim-racing community creates and
runs online rallies, but its own rally-creation wizard is clunky and unpleasant to use. This app
is the frontend half of a project to fix that: a modern, friendlier UI for building an RSF rally,
which hands the actual work off to a backend service that drives RSF on your behalf. Deployed to
GitHub Pages at https://erikpantzar.github.io/rbr-rally-creator-web/.

Paired with [rbr-rally-creator-service](https://github.com/erikpantzar/rbr-rally-creator-service),
the automation backend this app talks to. See
[ideas-and-projects/active/rally-creation-automation/NOTES.md](https://github.com/erikpantzar/ideas-and-projects/blob/main/active/rally-creation-automation/NOTES.md)
for the full plan.

## Setup

```
npm install
npm run dev
```

The app defaults to the public `rbr-rally-creator-service` instance (exposed via Tailscale
Funnel, with CORS already configured for this GitHub Pages origin) — no setup needed, just open
the app and go. The Settings section only needs to be touched to point at a different backend,
e.g. `http://localhost:3000` for local development against a service running on your own
machine; the override is stored in `localStorage` (not a secret, just a hostname) and clearing
the field reverts to the public default. Your rallysimfans.hu credentials are **not** stored
here: signing in sends them once to the service, which validates them via a real login and sets
an httpOnly session cookie. This app never reads or stores the raw password.

### Leg time rules (configurable, rbr-rally-creator-service#12)

`src/lib/rallyPlan.js` exports three constants used to warn users *before* they submit a rally
that would hit the backend's leg-time limits — `MAX_LEG_SPAN_DAYS`, `MIN_LEG_LEAD_MINUTES`,
`CLAMP_LEG_LEAD_MINUTES`. These are **best-guess assumptions**, not confirmed live boundaries (see
that issue for why) — they're read from build-time env vars, falling back to the current best
guesses if unset:

| Env var | Default | Meaning |
|---|---|---|
| `VITE_MAX_LEG_SPAN_DAYS` | `6` | A leg can be open at most this many days. |
| `VITE_MIN_LEG_LEAD_MINUTES` | `5` | A leg can't start less than this many minutes from "now". |
| `VITE_CLAMP_LEG_LEAD_MINUTES` | `10` | Informational only here — matches the backend's clamp target, shown in warnings. |

Set these in a local `.env` (gitignored, Vite convention) to override for a build — since this is
a static GitHub Pages deploy, changing them requires a rebuild, unlike the backend service where
they're read live from the process environment. **Keep these in sync with the mirrored
`LEG_MAX_SPAN_DAYS`/`LEG_MIN_LEAD_MINUTES`/`LEG_CLAMP_LEAD_MINUTES` in
`rbr-rally-creator-service`'s `src/lib/legTimeRules.js`** — this app's values only warn pre-submit,
the backend's are what's actually enforced. If you ever get real confirmed numbers, update the
defaults in `rallyPlan.js` itself (not just the env var), so a build without the env var set still
gets the right behavior.

## Architecture

- **React + CSS Modules** (`*.module.css` per component) + one global `src/styles/tokens.css` for
  design tokens (colors, light/dark). No CSS-in-JS, no UI kit — plain, isolated component styles.
- **Component convention**: presentational components (`src/components/`) take data in via props
  and report out via callback props — no component reaches into `fetch`/`localStorage` itself.
  Only `App.jsx` and `RallyBuilder.jsx` own state and talk to the service/localStorage. Mirrors
  [willys-web-prototype](https://github.com/erikpantzar/willys-web-prototype)'s
  `docs/COMPONENTS.md` convention.
- No router yet — still a single real view. Add one when a second distinct, deep-linkable
  page exists (e.g. a job-status page).
- **Drag-and-drop** via `@dnd-kit` (`core`/`sortable`/`utilities`) — used only to reorder
  already-placed stage "bricks" within or across legs. There's no drag-and-drop *creation* from a
  catalog panel (that was explicitly deferred; see DESIGN_SPEC.md's scope note).

## Status

The rally builder described in `DESIGN_SPEC.md` (the "document of bricks" model) is built and is
the only way to compose a rally in this app — there's no older wizard-style form left. End to end,
today:

- **Auth**: rallysimfans.hu sign-in against the service's httpOnly-cookie session API. The service
  URL is fixed to the public Tailscale Funnel address (no user-facing settings UI); a
  `localStorage` override still exists as a devtools-only escape hatch for local dev (see
  `src/lib/settings.js`).
- **Rally basics**: name, description, damage rules, pacenotes option, road-side service cap,
  a rally-level "Hide stage names" checkbox, optional password. Stage/leg counts are no longer
  manual inputs — they're derived read-only from what's actually been built below.
- **Car groups**: picker over the service's car-group/car catalog.
- **Road book**: additive "Lego bits" model exactly as designed — legs and stages are only ever
  added explicitly (`+ Add Leg`, `+ Add stage`), never pre-sized. Each stage is a draggable/
  reorderable "brick" (collapsed summary; click to reopen the full config in a full-screen modal).
  Bricks support add / edit / **duplicate** / delete, with an **undo toast** (5s) on delete for
  both a stage and a whole leg removal. Legs are removable (merging orphaned stages into an
  adjacent leg via an inline confirm bubble), capped at 6 total to match the real site's wizard.
  The stage row wraps rather than scrolling horizontally (issue #52, superseding the earlier
  horizontal-scroll approach from issue #43).
- **Readiness banner**: a persistent line at the bottom of the document listing every reason
  "Create Rally" is disabled (missing name, no car group, unbalanced leg/stage counts, empty legs,
  too many legs, a leg opening too soon — see "Leg time rules" below), replacing the old
  alert()-based validation.
- **Leg time validation (frontend, issue #40)**: a leg whose open time is inside
  `MIN_LEG_LEAD_MINUTES` of "now" (or already past) is flagged in the readiness banner before
  submit, since the backend would otherwise silently clamp it forward. Rechecked every 30s so this
  can't go stale just from time passing while the user keeps building.
- **Locked/created state**: once a rally job succeeds, the document goes read-only (no more add/
  edit/delete/reorder) and offers a **"Duplicate as new draft"** action instead — clones the local
  config into a fresh editable draft, no touching the live rally on rallysimfans.hu. Actual
  edit-and-republish of a live rally is still out of scope.
- **In-progress persistence**: both the whole rally draft and an open stage-config modal's
  in-progress edits are saved to `localStorage` and restored on reload/reopen, so an accidental
  refresh or closed tab doesn't lose work.
- **Job progress**: shown as its own screen once "Create Rally" is pressed (not layered onto the
  document) — progress bar, cooperative cancel (`DELETE /jobs/:id`), a "Test run" (dry-run)
  checkbox, and the browser tab title reflects live progress/completion so the tab doesn't need to
  stay in focus.
- **Visual language**: amber/timing-clock accent and monospace-leaning styling per DESIGN_SPEC.md
  are in `tokens.css` (`--accent` at oklch hue ~92, both light/dark blocks) — the spec's visual
  redesign has landed, not just the interaction model.
- **Per-stage nickname (issue #64)**: `StageConfigModal` has a "Nickname (optional)" field per
  stage, but it's purely a local planning label — stripped before submission, never sent to the
  backend, never visible on rallysimfans.hu or to participants. Confirmed (per that issue) that the
  real site has no per-stage custom-naming mechanism of its own.

**Not yet in the frontend**: the backend (`rbr-rally-creator-service`) recently added support for
an actual per-stage **public** hidden name (a `stage_name` field, distinct from this app's local
nickname above, shown only when hidden-stage-names are enabled — it's what participants would
actually see on rallysimfans.hu). This app's "Hide stage names" control is still only the
rally-level boolean checkbox in `RallyBasicsForm`; there is no UI yet to set that per-stage public
name, and `stagePlan`/`rallyPlan.js` don't send one. If that's meant to be user-editable here,
that's unbuilt — separate from (and not solved by) the local-only nickname field above.

**Known risk, untested**: the session cookie is cross-site (this GitHub Pages origin ↔ the
service's own host). Some browsers (Safari ITP, strict tracking-protection modes) block cross-site
cookies even with correct `SameSite=None; Secure` flags — test this for real before relying on it.
If it doesn't work in your browser, the fallback is a bearer token in the login response instead
of a cookie.
